/* MediaCopia — encrypted sync across devices, working the same way as CatchAll's sync.
   Backend: MediaCopia's own Supabase project (js/sync-config.js), with its own sign-in emails. Tables: mc_records
   (encrypted records) and mc_keyring (the data key, wrapped by your passphrase). The data key is the one
   that locks MediaCopia on this device (js/vault.js), so one passphrase opens it everywhere. Only ciphertext crosses
   the network, plus each record's id, updated time and deleted flag.

   Records: the state is split into records so edits on two devices merge instead of overwriting each other:
   "lib:<id>", "drop:<id>", "ask:<id>", "custom:<category>", "interests", "dismissed", "settings" (your Claude key
   stays on each device) and "prices". After every save each record's JSON is hashed and compared with the last
   synced hash; changed records are queued with the current time, and removed ones are queued as deleted.

   Sync: check the keyring, pull rows changed since the cursor (newest wins by updated time, enforced on the server
   too), apply them, then push the queue. A device that has just connected or joined pulls before it pushes, so it
   takes the account's data and adds what only it has.

   Keyring, as in CatchAll: the first device uploads its keyring. A device whose key differs gets status "needs-key"
   and is asked for the synced passphrase, then switches to that key (js/lock.js → joinRemote). A passphrase changed on
   one device reaches the others, which use the new one next time they unlock. */
window.MC = window.MC || {};
MC.sync = (() => {
  const C = MC.crypto, V = MC.vault, meta = MC.vault.meta;
  const TABLE = 'mc_records', KEYRING = 'mc_keyring';
  const PAGE = 500, PUSH_BATCH = 100, CURSOR_OVERLAP_MS = 120_000, INTERVAL_MS = 3 * 60_000;

  class SyncError extends Error { constructor(code, message) { super(message || code); this.code = code; } }

  let hooks = {};          // { onStatus(status), onNotice(text) }
  let session = null;      // { access_token, refresh_token, expires_at, user: { id, email } }
  let map = {};            // record id -> { h: hash of last synced JSON, at: updated time (ms), del?: true }
  let outbox = new Set();  // record ids waiting to be pushed
  let primed = false;      // pulled at least once since connecting or joining (it may then push)
  let active = false;      // unlocked
  let running = null, again = false, timer = null, debounce = null, persistTimer = null, applying = false;
  let status = { state: 'off', at: 0, error: '', remote: null };

  const setStatus = (state, extra = {}) => { status = { ...status, state, ...extra }; hooks.onStatus?.(status); };

  /* ---- records ---- */
  const records = s => {
    const m = new Map();
    (s.library || []).forEach(i => i?.id && m.set('lib:' + i.id, i));
    (s.drops || []).forEach(d => d?.id && m.set('drop:' + d.id, d));
    (s.asks || []).forEach(a => a?.id && m.set('ask:' + a.id, a));
    const { custom, ...interests } = s.interests || {};
    m.set('interests', interests);
    Object.entries(custom || {}).forEach(([cat, list]) => m.set('custom:' + cat, list));
    m.set('dismissed', s.dismissed || []);
    const { apiKey, ...settings } = s.settings || {};   // the Claude key never leaves this device
    m.set('settings', settings);
    if (s.servicePrices) m.set('prices', s.servicePrices);
    return m;
  };
  const LISTS = { lib: 'library', drop: 'drops', ask: 'asks' };
  const applyRecord = (s, id, data, deleted) => {
    const cut = id.indexOf(':'), kind = cut < 0 ? id : id.slice(0, cut), key = cut < 0 ? '' : id.slice(cut + 1);
    const list = LISTS[kind];
    if (list) {
      const i = s[list].findIndex(x => x.id === key);
      if (deleted || !data) { if (i >= 0) s[list].splice(i, 1); }
      else if (i >= 0) s[list][i] = data; else s[list].push(data);
      return;
    }
    if (kind === 'custom') { if (deleted || !Array.isArray(data)) delete s.interests.custom[key]; else s.interests.custom[key] = data; return; }
    if (deleted || !data) return;   // the single records (interests, settings…) are never deleted
    if (kind === 'interests') s.interests = { ...s.interests, ...data, custom: s.interests.custom || {} };
    else if (kind === 'dismissed') s.dismissed = Array.isArray(data) ? data : [];
    else if (kind === 'settings') s.settings = { ...s.settings, ...data, apiKey: s.settings.apiKey };
    else if (kind === 'prices') s.servicePrices = data;
  };
  // FNV-1a: a short fingerprint of a record's JSON, to notice changes cheaply.
  const hash = str => { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36) + '.' + str.length; };

  /* Joining (the first pull after connecting or joining): an empty or default record from a new device never
     replaces real data here, and for titles the copy edited more recently wins. Records kept this way have no
     sync entry yet, so the next scan pushes them, newer, to every device. */
  const isBlank = (id, d) => d == null || (Array.isArray(d) ? d.length === 0
    : id === 'interests' ? !Object.keys(d.picks || {}).length && !d.about && !d.creators && !Object.keys(d.types || {}).length
    : id === 'settings' ? !(d.subs || []).length && !d.region
    : false);
  const stamp = d => Date.parse(d?.updatedAt || d?.addedAt || d?.at || '') || 0;
  function keepLocalOnJoin(id, remote, local) {
    if (local === undefined) return false;
    if (isBlank(id, remote) && !isBlank(id, local)) return true;
    const lt = stamp(local), rt = stamp(remote);
    return !!(lt && rt && lt > rt);
  }

  const ready = () => !!(session && active && V.isOpen());
  const persist = () => { clearTimeout(persistTimer); persistTimer = setTimeout(() => { meta.set('syncMap', map); meta.set('syncOutbox', [...outbox]); }, 300); };

  // Compare the current state with what was last synced and queue the differences.
  function scan() {
    if (!ready() || !primed || applying || status.state === 'needs-key') return 0;
    const recs = records(MC.state), now = Date.now();
    let n = 0;
    for (const [id, obj] of recs) {
      const h = hash(JSON.stringify(obj)), k = map[id];
      if (!k || k.del || k.h !== h) { map[id] = { h, at: Math.max(now, (k?.at || 0) + 1) }; outbox.add(id); n++; }
    }
    for (const id of Object.keys(map)) {
      if (!recs.has(id) && !map[id].del) { map[id] = { h: '', at: Math.max(now, map[id].at + 1), del: true }; outbox.add(id); n++; }
    }
    if (n) persist();
    return n;
  }

  /* ---- HTTP (Supabase REST: auth and PostgREST) ---- */
  async function call(path, { method = 'GET', body, headers = {}, auth = true } = {}) {
    const h = { apikey: MC.SYNC_KEY, ...headers };
    if (auth) { await ensureFresh(); h.Authorization = `Bearer ${session.access_token}`; }
    const payload = body === undefined ? undefined : JSON.stringify(body);
    if (payload !== undefined) h['Content-Type'] = 'application/json';
    let res;
    try { res = await fetch(MC.SYNC_URL + path, { method, headers: h, body: payload }); }
    catch { throw new SyncError('OFFLINE', 'Can’t reach the sync server'); }
    if (res.status === 401 && auth && !call.retrying) {
      call.retrying = true;
      try { await refresh(); return await call(path, { method, body, headers, auth }); }
      finally { call.retrying = false; }
    }
    if (!res.ok) {
      let msg = '';
      try { const j = await res.json(); msg = j.msg || j.message || j.error_description || j.error || ''; } catch { /* not JSON */ }
      throw new SyncError(res.status === 401 ? 'AUTH' : `HTTP_${res.status}`, msg || `Sync server error (${res.status})`);
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  /* ---- sign-in (email one-time code) ---- */
  async function saveSession(s) {
    session = s ? {
      access_token: s.access_token, refresh_token: s.refresh_token,
      expires_at: s.expires_at ? s.expires_at * 1000 : Date.now() + (s.expires_in || 3600) * 1000,
      user: { id: s.user?.id || session?.user?.id, email: s.user?.email || session?.user?.email },
      project: MC.SYNC_URL,   // a sign-in only works with the project it came from
    } : null;
    await meta.set('syncSession', session);
  }
  async function ensureFresh() {
    if (!session) throw new SyncError('AUTH', 'Not signed in');
    if (Date.now() > session.expires_at - 60_000) await refresh();
  }
  let refreshing = null;
  function refresh() {
    return (refreshing ??= (async () => {
      try { await saveSession(await call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', auth: false, body: { refresh_token: session.refresh_token } })); }
      catch (e) {
        if (e.code !== 'OFFLINE') { await saveSession(null); throw new SyncError('AUTH', 'Your sync sign-in expired. Sign in again.'); }
        throw e;
      } finally { refreshing = null; }
    })());
  }
  // The email's link brings you back to the address you asked from (mediacopia.com, or 127.0.0.1 while testing),
  // as long as that address is on the project's Redirect URLs list; otherwise it goes to the Site URL.
  const sendCode = email => call(`/auth/v1/otp?redirect_to=${encodeURIComponent(location.origin + location.pathname)}`, { method: 'POST', auth: false, body: { email, create_user: true } });
  async function verifyCode(email, token) {
    await saveSession(await call('/auth/v1/verify', { method: 'POST', auth: false, body: { type: 'email', email, token } }));
    await resetProgress();
  }
  // A magic link from the email lands here as #access_token=…&refresh_token=…
  async function takeSessionFromUrl() {
    const h = new URLSearchParams(location.hash.slice(1));
    if (!h.get('access_token') || !h.get('refresh_token')) return false;
    history.replaceState(null, '', location.pathname + location.search + '#/home');
    session = { access_token: h.get('access_token'), refresh_token: h.get('refresh_token'), expires_at: Date.now() + 3_000_000, user: {} };
    try {
      const user = await call('/auth/v1/user');
      await saveSession({ access_token: session.access_token, refresh_token: session.refresh_token, expires_in: +h.get('expires_in') || 3600, user });
      await resetProgress();
      return true;
    } catch { session = null; return false; }
  }
  async function signOut() {
    stop();
    if (session) call('/auth/v1/logout', { method: 'POST' }).catch(() => {});
    await saveSession(null);
    await resetProgress();
    setStatus('off', { error: '', at: 0, remote: null });
  }
  async function resetProgress() {
    map = {}; outbox = new Set(); primed = false;
    await meta.set('syncMap', null); await meta.set('syncOutbox', null); await meta.set('syncCursor', null); await meta.set('syncPrimed', false);
  }

  /* ---- keyring ---- */
  async function remoteKeyring() {
    const rows = await call(`/rest/v1/${KEYRING}?select=kid,keyring,updated_at`);
    return rows?.[0] ? { kid: rows[0].kid, keyring: C.keyringFromJSON(rows[0].keyring), json: rows[0].keyring, updatedAt: +rows[0].updated_at } : null;
  }
  // Setting up a new device from sync: use the account's keyring, then unlock with its passphrase.
  async function adoptRemoteKeyring() {
    const r = await remoteKeyring();
    if (!r) return false;
    await V.adoptKeyring(r.json, r.updatedAt);
    return true;
  }
  async function pushKeyring(kid) {
    await call(`/rest/v1/${KEYRING}?on_conflict=user_id`, {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: { user_id: session.user.id, kid, keyring: await V.keyringJSON(), updated_at: (await V.keyringAt()) || Date.now() },
    });
  }
  // Returns null when keys match, or the synced keyring when this device has a different key.
  async function reconcileKeyring() {
    const kid = await C.keyFingerprint(V.key());
    const remote = await remoteKeyring();
    if (!remote) { await pushKeyring(kid); return null; }
    if (remote.kid !== kid) return remote;
    const localAt = await V.keyringAt();
    if (remote.updatedAt > localAt) {
      await V.adoptKeyring(remote.json, remote.updatedAt);   // passphrase changed on another device; same data key
      if (localAt) hooks.onNotice?.('Your passphrase was changed on another device. Use the new one next time you unlock.');
    } else if (remote.updatedAt < localAt) await pushKeyring(kid);
    return null;
  }
  // After the passphrase changes here, so other devices pick up the new wrap.
  const keyringChanged = () => schedule(0);
  // Join the synced data: switch this device to the account's key (unwrapped by the caller with the synced
  // passphrase), then pull before pushing so this device's data merges in.
  async function joinRemote(remoteKey, remote) {
    await V.switchKey(remoteKey, remote.json, remote.updatedAt);
    await resetProgress();
    setStatus('syncing', { remote: null, error: '' });
    schedule(0);
  }

  /* ---- push / pull ---- */
  async function push() {
    const ids = [...outbox];
    if (!ids.length) return 0;
    const recs = records(MC.state), key = V.key();
    for (let i = 0; i < ids.length; i += PUSH_BATCH) {
      const batch = ids.slice(i, i + PUSH_BATCH), rows = [];
      for (const id of batch) {
        const k = map[id]; if (!k) continue;
        const del = !!k.del || !recs.has(id);
        const { iv, ct } = await C.encryptJSON(key, del ? null : recs.get(id), id);
        rows.push({ user_id: session.user.id, id, iv: C.toB64(iv), ct: C.toB64(ct), updated_at: k.at, deleted: del });
      }
      if (rows.length) await call(`/rest/v1/${TABLE}?on_conflict=user_id,id`, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: rows });
      batch.forEach(id => outbox.delete(id));
      persist();
    }
    return ids.length;
  }
  async function pull() {
    const cursor = (await meta.get('syncCursor')) || null;
    const since = cursor ? new Date(Date.parse(cursor) - CURSOR_OVERLAP_MS).toISOString() : null;
    const key = V.key();
    const local = primed ? null : records(MC.state);   // joining: compare with what this device has
    let maxSeen = cursor;
    const incoming = [];
    for (let offset = 0; ; offset += PAGE) {
      const rows = await call(`/rest/v1/${TABLE}?select=id,iv,ct,updated_at,deleted,server_at&order=server_at.asc,id.asc&limit=${PAGE}&offset=${offset}`
        + (since ? `&server_at=gt.${encodeURIComponent(since)}` : ''));
      for (const row of rows) {
        if (!maxSeen || Date.parse(row.server_at) > Date.parse(maxSeen)) maxSeen = row.server_at;
        const k = map[row.id];
        if (k && k.at >= +row.updated_at) continue;   // this device has the same or a newer version
        let data = null;
        try { data = await C.decryptJSON(key, C.fromB64(row.iv), C.fromB64(row.ct), row.id); }
        catch { console.warn('MediaCopia: a synced record could not be decrypted', row.id); continue; }
        if (local && !row.deleted && keepLocalOnJoin(row.id, data, local.get(row.id))) continue;
        incoming.push({ id: row.id, data, deleted: row.deleted, at: +row.updated_at });
      }
      if (rows.length < PAGE) break;
    }
    if (incoming.length) {
      applying = true;
      try {
        MC.update(s => {
          incoming.forEach(r => applyRecord(s, r.id, r.data, r.deleted));
          s.asks.sort((a, b) => (b.at || '').localeCompare(a.at || ''));
        });
      } finally { applying = false; }
      // Remember what was applied, hashed from the state as it is now, so it isn't pushed straight back.
      const recs = records(MC.state);
      incoming.forEach(r => {
        map[r.id] = r.deleted || !recs.has(r.id) ? { h: '', at: r.at, del: true } : { h: hash(JSON.stringify(recs.get(r.id))), at: r.at };
        outbox.delete(r.id);
      });
      persist();
    }
    if (maxSeen !== cursor) await meta.set('syncCursor', maxSeen);
    return incoming.length;
  }

  async function runOnce() {
    if (!ready()) return;
    setStatus('syncing');
    try {
      const remote = await reconcileKeyring();
      if (remote) { setStatus('needs-key', { remote, error: '' }); return; }
      const got = await pull();
      if (!primed) { primed = true; await meta.set('syncPrimed', true); }
      scan();
      const sent = await push();
      setStatus('ok', { at: Date.now(), error: '', remote: null, got, sent });
    } catch (e) {
      if (e.code === 'OFFLINE') setStatus('offline', { error: e.message });
      else if (e.code === 'AUTH') setStatus(session ? 'error' : 'signed-out', { error: e.message });
      else { console.error(e); setStatus('error', { error: e.message }); }
    }
  }
  function syncNow() {
    if (running) { again = true; return running; }
    running = runOnce().finally(() => { running = null; if (again && ready()) { again = false; schedule(0); } });
    return running;
  }
  function schedule(ms = 2000) {
    if (!ready()) return;
    clearTimeout(debounce);
    debounce = setTimeout(syncNow, ms);
  }

  /* ---- lifecycle ---- */
  async function init(h) {
    hooks = h || {};
    MC.listeners.add(() => { if (scan()) schedule(); });
    window.addEventListener('online', () => schedule(0));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') schedule(0); });
    session = (await meta.get('syncSession')) || null;
    // Signed in to a different sync project (MediaCopia used CatchAll's at first): sign in again here.
    if (session && session.project !== MC.SYNC_URL) { session = null; await meta.set('syncSession', null); await resetProgress(); }
    map = (await meta.get('syncMap')) || {};
    outbox = new Set((await meta.get('syncOutbox')) || []);
    primed = !!(await meta.get('syncPrimed'));
  }
  // Called after unlock.
  function start() {
    active = true;
    if (!session) { setStatus('off'); return; }
    clearInterval(timer);
    timer = setInterval(() => schedule(0), INTERVAL_MS);
    schedule(0);
  }
  // Called on lock.
  function stop() { active = false; clearInterval(timer); clearTimeout(debounce); timer = null; }
  // First connection from this device.
  async function connected() { start(); }

  return {
    init, start, stop, connected, sendCode, verifyCode, takeSessionFromUrl, signOut, syncNow, schedule,
    adoptRemoteKeyring, joinRemote, keyringChanged,
    getStatus: () => status, signedIn: () => !!session, account: () => session?.user?.email || '',
    _test: { records, applyRecord, hash, keepLocalOnJoin },   // for checks in the console
  };
})();
