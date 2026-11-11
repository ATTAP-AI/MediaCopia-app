/* MediaCopia — the encrypted vault, the same design as CatchAll.
   Everything you keep in MediaCopia (library, watchlist, interests, calendar, saved asks, settings and your Claude key)
   is encrypted on this device with a random data key, and your passphrase unlocks that key (js/crypto.js). The
   encrypted state lives in IndexedDB; nothing readable is left in localStorage. Sync uses the same key, so one
   passphrase opens MediaCopia on every device.

   "Remember on this device" seals the data key with a key the browser keeps and can't export, so the app opens
   without the passphrase on that device only. Locking forgets it again.

   Only the cover and trailer lookup caches (public titles and links) and display preferences stay unencrypted. */
window.MC = window.MC || {};
MC.vault = (() => {
  const C = MC.crypto;
  const PLAIN_KEY = 'mediacopia.v1';     // where older versions kept everything in plain text
  const STATE_AAD = 'mediacopia-state';
  const REMEMBER_PREF = 'mediacopia:remember';

  /* ---- IndexedDB key-value store, shared with sync (it can hold the non-extractable device key) ---- */
  let dbp = null;
  const idb = () => dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open('mediacopia', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('meta');
    r.onsuccess = () => {
      // Another tab erasing this device: let go of the database so the erase can finish, and start over.
      r.result.onversionchange = () => { r.result.close(); dbp = null; location.reload(); };
      res(r.result);
    };
    r.onerror = () => rej(r.error);
  });
  const meta = {
    async get(k) { const db = await idb(); return new Promise((res, rej) => { const q = db.transaction('meta').objectStore('meta').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); },
    async set(k, v) {
      const db = await idb();
      return new Promise((res, rej) => {
        const t = db.transaction('meta', 'readwrite'), os = t.objectStore('meta');
        v === undefined || v === null ? os.delete(k) : os.put(v, k);
        t.oncomplete = () => res(); t.onerror = () => rej(t.error);
      });
    },
  };

  let key = null;                    // the data key while unlocked
  let remembered = false;
  let writing = Promise.resolve();
  const TAB = Math.random().toString(36).slice(2);
  const chan = 'BroadcastChannel' in window ? new BroadcastChannel('mediacopia') : null;

  const plaintext = () => { try { const s = localStorage.getItem(PLAIN_KEY); return s ? JSON.parse(s) : null; } catch { return null; } };
  const readState = async k => { const rec = await meta.get('state'); return rec ? C.decryptJSON(k, rec.iv, rec.ct, STATE_AAD) : null; };

  // Encrypt and store the state. Writes are queued so they land in order; other open tabs reload afterwards.
  function write(state) {
    if (!key) return writing;
    const k = key, snapshot = JSON.parse(JSON.stringify(state));
    writing = writing.then(async () => {
      const { iv, ct } = await C.encryptJSON(k, snapshot, STATE_AAD);
      await meta.set('state', { iv, ct });
      chan?.postMessage({ type: 'saved', tab: TAB });
    }).catch(e => { console.error('MediaCopia: could not save', e); MC.toast?.('Could not save: browser storage is full or blocked.', 'error'); });
    return writing;
  }

  // Unlocked: load (or create) the encrypted state. Older plain-text data is encrypted and then removed.
  async function open(k) {
    const stored = await readState(k);   // throws if the key is wrong
    const plain = plaintext();
    key = k;
    const migrated = !stored && plain ? plain : null;
    MC.state = MC.fromJSON(stored || plain || {});
    if (!stored) await write(MC.state);
    if (plain) { try { localStorage.removeItem(PLAIN_KEY); } catch { /* private mode */ } }
    return { migrated };
  }

  const hasKeyring = async () => !!(await meta.get('keyring'));
  // First run: choose a passphrase and encrypt everything with a new data key.
  async function setup(passphrase) {
    const { dataKey, keyring } = await C.createKeyring(passphrase);
    await meta.set('keyring', keyring);
    await meta.set('keyringAt', Date.now());
    return open(dataKey);
  }
  // Throws Error('WRONG_PASSPHRASE').
  async function unlock(passphrase) {
    const k = await C.unlockKeyring(await meta.get('keyring'), passphrase);
    return open(k);
  }
  async function changePassphrase(current, next) {
    await C.unlockKeyring(await meta.get('keyring'), current);   // throws WRONG_PASSPHRASE
    await meta.set('keyring', await C.wrapDataKey(key, next));
    await meta.set('keyringAt', Date.now());
  }
  function lock() {
    key = null;
    MC.state = MC.defaultState();
  }

  /* ---- remember on this device ---- */
  const rememberPref = () => { try { return localStorage.getItem(REMEMBER_PREF) === '1'; } catch { return false; } };
  const setRememberPref = on => { try { localStorage.setItem(REMEMBER_PREF, on ? '1' : '0'); } catch { /* private mode */ } };
  async function remember(k = key) { await meta.set('remembered', await C.sealForDevice(k)); remembered = true; }
  async function forget() { await meta.set('remembered', null); remembered = false; }
  // The remembered key, or null if there's none or it no longer opens the vault.
  async function rememberedKey() {
    const sealed = await meta.get('remembered');
    if (!sealed) return null;
    try { const k = await C.openForDevice(sealed); await readState(k); remembered = true; return k; }
    catch (e) { console.warn('MediaCopia: the remembered key no longer opens this device’s data', e); await forget(); return null; }
  }

  /* ---- for sync: the keyring is the account's keyring ---- */
  const keyringJSON = async () => C.keyringToJSON(await meta.get('keyring'));
  const keyringAt = async () => (await meta.get('keyringAt')) || 0;
  async function adoptKeyring(keyringJson, at) {   // the same key, re-wrapped with a passphrase changed elsewhere
    await meta.set('keyring', C.keyringFromJSON(keyringJson));
    await meta.set('keyringAt', at);
  }
  // Joining another device's synced data: switch to its key and re-encrypt this device's data with it.
  async function switchKey(newKey, keyringJson, at) {
    await adoptKeyring(keyringJson, at);
    key = newKey;
    await write(MC.state);
    if (remembered) await remember(newKey);
  }

  // "Forgot passphrase": delete everything stored on this device.
  async function erase() {
    key = null; remembered = false;
    try {   // empty the store first, so nothing is left even if deleting the database is held up by another tab
      const db = await idb();
      await new Promise(res => { const t = db.transaction('meta', 'readwrite'); t.objectStore('meta').clear(); t.oncomplete = t.onerror = () => res(); });
      db.close();
    } catch { /* not open */ }
    dbp = null;
    await new Promise(res => { const r = indexedDB.deleteDatabase('mediacopia'); r.onsuccess = r.onerror = () => res(); r.onblocked = () => setTimeout(res, 2000); });
    try { localStorage.removeItem(PLAIN_KEY); localStorage.removeItem(REMEMBER_PREF); } catch { /* private mode */ }
  }

  // Another tab saved: reload so this tab never writes back an older copy.
  chan?.addEventListener('message', async e => {
    if (e.data?.type !== 'saved' || e.data.tab === TAB || !key) return;
    try { MC.state = MC.fromJSON(await readState(key)); MC.applyTheme?.(); MC.render?.(); } catch { /* key changed elsewhere */ }
  });

  return {
    meta, write, setup, unlock, open, lock, changePassphrase, hasKeyring, plaintext,
    remember, forget, rememberedKey, rememberPref, setRememberPref, isRemembered: () => remembered,
    isOpen: () => !!key, key: () => key, keyringJSON, keyringAt, adoptKeyring, switchKey, erase,
  };
})();
