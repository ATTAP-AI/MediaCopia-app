/* MediaCopia — lock screen, auto-lock and the sync dialogs, working the same way as CatchAll.
   - First run: choose a passphrase; everything (including data you already had here) is encrypted with it.
     "Use my MediaCopia from another device" signs in to sync and unlocks with the passphrase used there.
   - Each open: enter the passphrase, unless "Remember on this device" was ticked.
   - Auto-lock after 5, 15 or 60 idle minutes (off while remembered). Locking drops the key and your data from memory.
   - The cloud button in the header: sign in with an emailed code, see the status, sync now, sign out. If the account
     already has data locked with another passphrase, you're asked for it once to join and merge. */
window.MC = window.MC || {};
MC.lock = (() => {
  const V = MC.vault, S = () => MC.sync;
  const MIN_PASS = 10;
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const E = s => MC.esc(s);
  let unlocked = false, failedAttempts = 0, lastActive = Date.now(), autoLockMinutes = 15, askedToJoin = false;

  /* ---- a small form dialog (resolves with the values, 'alt', or null) ---- */
  MC.formDialog = ({ title, message = '', html = '', fields = [], submitLabel = 'OK', cancelLabel = 'Cancel', altLabel = '', danger = false, validate } = {}) =>
    new Promise(resolve => {
      let done = false;
      const finish = v => { if (done) return; done = true; MC.closeModal(); resolve(v); };
      MC.openModal(`
        <form class="fdlg" novalidate>
          <div class="modal-head"><h2>${E(title)}</h2></div>
          <div class="modal-body">
            ${message ? `<p>${E(message)}</p>` : ''}${html}
            ${fields.map(f => `<label class="field">${E(f.label)}
              <input name="${f.name}" type="${f.type || 'text'}" ${f.autocomplete ? `autocomplete="${f.autocomplete}"` : ''} ${f.inputmode ? `inputmode="${f.inputmode}"` : ''} autocapitalize="off" spellcheck="false"></label>`).join('')}
            <p class="form-error" role="alert"></p>
          </div>
          <div class="modal-foot">
            ${altLabel ? `<button type="button" class="btn ghost" data-alt>${E(altLabel)}</button><span class="grow"></span>` : ''}
            <button type="button" class="btn" data-cancel>${E(cancelLabel)}</button>
            <button type="submit" class="btn ${danger ? 'danger solid' : 'primary'}">${E(submitLabel)}</button>
          </div>
        </form>`, m => {
        const form = m.querySelector('form'), err = m.querySelector('.form-error'), btn = m.querySelector('[type=submit]');
        m.querySelector('[data-cancel]').onclick = () => finish(null);
        m.querySelector('[data-alt]')?.addEventListener('click', () => finish('alt'));
        // Escape closes the modal elsewhere; treat it as cancel.
        new MutationObserver((_, obs) => { if (!m.isConnected) { obs.disconnect(); finish(null); } }).observe(document.getElementById('modal-root'), { childList: true });
        form.onsubmit = async e => {
          e.preventDefault();
          const values = Object.fromEntries(fields.map(f => [f.name, form.elements[f.name].value]));
          err.textContent = ''; btn.disabled = true;
          try {
            const problem = validate ? await validate(values) : null;
            if (problem) { err.textContent = problem; return; }
            finish(values);
          } finally { btn.disabled = false; }
        };
      });
    });

  /* ---- lock screen ---- */
  const passStrength = p => {
    if (!p) return 0;
    let pool = 0;
    if (/[a-z]/.test(p)) pool += 26;
    if (/[A-Z]/.test(p)) pool += 26;
    if (/\d/.test(p)) pool += 10;
    if (/[^a-zA-Z0-9]/.test(p)) pool += 33;
    const words = p.trim().split(/\s+/).length;
    const bits = Math.max(p.length * Math.log2(pool) * 0.6, words >= 3 ? words * 11 : 0);   // ~11 bits per random word
    return bits < 40 ? 1 : bits < 60 ? 2 : bits < 80 ? 3 : 4;
  };
  const appShell = () => document.querySelector('.app') || document.getElementById('view')?.parentElement;
  function lockMarkup() {
    if (document.getElementById('lock')) return;
    document.body.insertAdjacentHTML('afterbegin', `
      <section class="lock" id="lock" aria-labelledby="lock-title" hidden>
        <form class="lock-card" id="lock-form" method="post" autocomplete="on">
          <img class="lock-mark" src="assets/logo.svg?v=2" alt="">
          <h1 id="lock-title" class="wordmark">MediaCopia</h1>
          <p class="lock-sub" id="lock-sub"></p>
          <div class="lock-shared" id="lock-shared" hidden></div>
          <input class="visually-hidden" type="text" name="username" value="MediaCopia" autocomplete="username" tabindex="-1" aria-hidden="true">
          <label class="field"><span>Passphrase</span>
            <span class="pass-row"><input id="lock-pass" name="password" type="password" autocomplete="current-password" autocapitalize="off" spellcheck="false" required>
            <button type="button" class="btn icon-btn" id="lock-show" aria-label="Show passphrase">👁</button></span></label>
          <div class="meter" id="lock-meter" hidden><span class="meter-bar"><i></i><i></i><i></i><i></i></span><span class="meter-label"></span></div>
          <label class="field" id="lock-confirm-wrap" hidden><span>Confirm passphrase</span>
            <input id="lock-confirm" type="password" autocomplete="new-password" autocapitalize="off" spellcheck="false"></label>
          <label class="check lock-remember"><input type="checkbox" id="lock-remember">
            <span>Remember on this device<small>Opens without your passphrase. Only for a device that’s yours and locked with Face ID, Touch ID or a password.</small></span></label>
          <p class="form-error" id="lock-error" role="alert"></p>
          <button class="btn primary block" id="lock-submit" type="submit">Unlock</button>
          <div class="lock-notes" id="lock-notes" hidden>
            <p><b>There is no reset.</b> Your passphrase never leaves this device and can’t be recovered. If you forget it, your MediaCopia data can’t be decrypted.</p>
            <p>Tip: four or more random words (like <i>maple orbit candle river</i>) are strong and easy to type on a phone. Save it in iCloud Keychain or your password manager.</p>
          </div>
          <button type="button" class="btn block" id="lock-sync" hidden>☁️ Use my MediaCopia from another device</button>
          <button type="button" class="link-btn" id="lock-reset" hidden>Forgot passphrase?</button>
        </form>
      </section>`);
    const $ = id => document.getElementById(id);
    $('lock-form').onsubmit = submitLock;
    $('lock-pass').oninput = updateMeter;
    $('lock-show').onclick = () => { const i = $('lock-pass'); i.type = i.type === 'password' ? 'text' : 'password'; };
    $('lock-sync').onclick = restoreFromSync;
    $('lock-reset').onclick = eraseDevice;
  }
  function updateMeter() {
    const level = passStrength(document.getElementById('lock-pass').value), m = document.getElementById('lock-meter');
    m.dataset.level = level;
    m.querySelector('.meter-label').textContent = ['', 'Weak', 'Fair', 'Good', 'Strong'][level];
  }
  // Opened from a share link (#/shared/…) while locked: show what was shared, so it's clear what unlocking leads to.
  // The list itself comes from the link; nothing is saved until it's added after unlocking.
  async function showSharedPreview(setup) {
    const box = document.getElementById('lock-shared');
    const m = location.hash.match(/^#\/shared\/([zj][A-Za-z0-9_-]+)/);
    if (!box) return;
    if (!m || !MC.share) { box.hidden = true; return; }
    try {
      const d = await MC.share.decode(m[1]);
      const all = [...d.items, ...d.drops], E = MC.esc;
      box.innerHTML = `<b>📬 ${E(d.title)}</b>${d.from ? ` <span class="muted">from ${E(d.from)}</span>` : ''}
        <ul>${all.slice(0, 6).map(i => `<li>${MC.TYPE[i.type]?.icon || '•'} ${E(i.title)}${i.creator ? ` <span class="muted">— ${E(i.creator)}</span>` : ''}</li>`).join('')}
        ${all.length > 6 ? `<li class="muted">and ${all.length - 6} more…</li>` : ''}</ul>
        <span class="tiny muted">${setup ? 'Choose a passphrase to start your own MediaCopia, then add what you like from this list.' : 'Unlock to see the whole list and add what you like.'}</span>`;
      box.hidden = false;
    } catch { box.hidden = true; }
  }

  async function showLock(sub = '') {
    lockMarkup();
    const setup = !(await V.hasKeyring());
    const plain = setup ? V.plaintext() : null;
    const n = plain ? (plain.library?.length || 0) + (plain.drops?.length || 0) : 0;
    const $ = id => document.getElementById(id);
    document.body.classList.add('locked');
    const app = appShell(); if (app) app.inert = true;
    $('lock').hidden = false;
    $('lock-sub').textContent = sub || (setup
      ? `Choose a passphrase. Everything in MediaCopia is encrypted with it${n ? `, including the ${n} ${n === 1 ? 'title' : 'titles'} already on this device` : ''}.`
      : 'Enter your passphrase to open MediaCopia.');
    showSharedPreview(setup);
    $('lock-form').dataset.mode = setup ? 'setup' : 'unlock';
    $('lock-pass').autocomplete = setup ? 'new-password' : 'current-password';
    $('lock-submit').textContent = setup ? 'Encrypt & continue' : 'Unlock';
    $('lock-confirm-wrap').hidden = !setup;
    $('lock-notes').hidden = !setup;
    $('lock-meter').hidden = !setup;
    $('lock-reset').hidden = setup;
    $('lock-sync').hidden = !setup;
    $('lock-pass').value = ''; $('lock-confirm').value = '';
    $('lock-error').textContent = '';
    $('lock-remember').checked = V.rememberPref();
    updateMeter();
    $('lock-pass').focus();
  }
  async function submitLock(e) {
    e.preventDefault();
    const $ = id => document.getElementById(id);
    const mode = $('lock-form').dataset.mode, pass = $('lock-pass').value, err = $('lock-error'), btn = $('lock-submit');
    err.textContent = '';
    if (mode === 'setup') {
      if (pass.length < MIN_PASS) { err.textContent = `Use at least ${MIN_PASS} characters.`; return; }
      if (pass !== $('lock-confirm').value) { err.textContent = 'The passphrases don’t match.'; return; }
    } else if (!pass) return;
    const label = btn.textContent;
    btn.disabled = true; btn.textContent = mode === 'setup' ? 'Encrypting…' : 'Unlocking…';
    try {
      const r = mode === 'setup' ? await V.setup(pass) : await V.unlock(pass);
      failedAttempts = 0;
      const keep = $('lock-remember').checked;
      V.setRememberPref(keep);
      if (keep) await V.remember();
      opened(r);
    } catch (ex) {
      if (ex.message === 'WRONG_PASSPHRASE') {
        failedAttempts++;
        err.textContent = 'Wrong passphrase.';
        $('lock-pass').select();
        await new Promise(r => setTimeout(r, Math.min(10000, 250 * 2 ** failedAttempts)));   // slow down repeated guesses
      } else { console.error(ex); err.textContent = 'Something went wrong opening MediaCopia.'; }
    } finally { btn.disabled = false; btn.textContent = label; }
  }
  function opened({ migrated } = {}) {
    unlocked = true; lastActive = Date.now(); askedToJoin = false;
    const lockEl = document.getElementById('lock');
    if (lockEl) { lockEl.hidden = true; document.getElementById('lock-pass').value = ''; document.getElementById('lock-confirm').value = ''; }
    document.body.classList.remove('locked');
    const app = appShell(); if (app) app.inert = false;
    MC.applyTheme(); MC.render(); paint();
    if (migrated) MC.toast(`Encrypted your MediaCopia data on this device`);
    S().start();
  }

  // Drops the key and every decrypted copy held in memory.
  async function lock() {
    if (!unlocked) return;
    if (V.isRemembered()) { await V.forget(); V.setRememberPref(false); }
    S().stop();
    MC.closeModal();
    unlocked = false;
    V.lock();
    for (const u of Object.values(MC.ui.aibar || {})) Object.assign(u, { loading: false, partial: null });
    MC.render();
    showLock();
  }
  function checkIdle() { if (unlocked && !V.isRemembered() && autoLockMinutes && Date.now() - lastActive > autoLockMinutes * 60000) lock(); }

  async function eraseDevice() {
    const ok = await MC.formDialog({
      title: 'Erase MediaCopia on this device?',
      message: 'Without the passphrase nobody, including you, can decrypt your MediaCopia data. Erasing deletes everything stored on this device so you can start over. Synced data on the server stays locked with the old passphrase.',
      fields: [{ name: 'confirm', label: 'Type ERASE to confirm' }],
      submitLabel: 'Erase everything', danger: true,
      validate: ({ confirm }) => (confirm.trim() === 'ERASE' ? null : 'Type ERASE in capitals to confirm.'),
    });
    if (!ok) return;
    await V.erase();
    location.reload();
  }

  async function changePassphrase() {
    const ok = await MC.formDialog({
      title: 'Change passphrase',
      message: 'Your data stays encrypted with the same key: only the passphrase that unlocks it changes. Your other devices use the new one next time they unlock.',
      fields: [
        { name: 'current', label: 'Current passphrase', type: 'password', autocomplete: 'current-password' },
        { name: 'next', label: 'New passphrase', type: 'password', autocomplete: 'new-password' },
        { name: 'confirm', label: 'Confirm new passphrase', type: 'password', autocomplete: 'new-password' },
      ],
      submitLabel: 'Change passphrase',
      validate: async ({ current, next, confirm }) => {
        if (next.length < MIN_PASS) return `Use at least ${MIN_PASS} characters.`;
        if (next !== confirm) return 'The new passphrases don’t match.';
        try { await V.changePassphrase(current, next); } catch { return 'Current passphrase is wrong.'; }
        S().keyringChanged();
      },
    });
    if (ok) MC.toast('Passphrase changed');
  }

  /* ---- remember / auto-lock (Settings) ---- */
  async function toggleRemember() {
    if (V.isRemembered()) { await V.forget(); V.setRememberPref(false); MC.toast('This device will ask for your passphrase again'); }
    else { await V.remember(); V.setRememberPref(true); MC.toast('Remembered on this device'); }
    MC.render();
  }
  async function setAutoLock(min) { autoLockMinutes = +min; await V.meta.set('autoLockMinutes', autoLockMinutes); }

  /* ---- sync ---- */
  function syncLabel(s = S().getStatus()) {
    switch (s.state) {
      case 'syncing': return 'Syncing…';
      case 'ok': { const sec = Math.round((Date.now() - s.at) / 1000); return `Synced ${sec < 60 ? 'just now' : sec < 3600 ? `${Math.round(sec / 60)} min ago` : `${Math.round(sec / 3600)} h ago`}`; }
      case 'offline': return 'Offline: changes will sync when you’re back online';
      case 'needs-key': return 'Needs the passphrase of your synced MediaCopia';
      case 'signed-out': return 'Signed out: sign in again to keep syncing';
      case 'error': return `Sync problem: ${s.error}`;
      default: return S().signedIn() ? 'Waiting to sync' : 'Sync is off';
    }
  }
  function paint() {
    const s = S().getStatus(), state = S().signedIn() || s.state === 'signed-out' ? s.state : 'off';
    document.querySelectorAll('.sync-btn').forEach(b => { b.dataset.state = state; b.title = syncLabel(s); b.setAttribute('aria-label', `Sync: ${syncLabel(s)}`); });
    document.querySelectorAll('[data-sync-line]').forEach(el => { el.textContent = syncLabel(s); });
    const foot = document.querySelector('.sidebar-foot');
    if (foot && unlocked) foot.innerHTML = `<button class="link-btn" data-action="open-sync">☁️ ${E(syncLabel(s))}</button><br>Encrypted on this device. <button class="link-btn" data-action="lock-now">🔒 Lock</button>`;
  }
  function onSyncStatus(s) {
    paint();
    if (s.state === 'needs-key' && unlocked && !askedToJoin) { askedToJoin = true; joinSynced(s.remote); }
  }
  setInterval(() => { if (S().getStatus().state === 'ok') paint(); }, 30_000);   // keep "Synced 2 min ago" current

  // Email → one-time code → signed in. Returns true when signed in.
  async function signInFlow() {
    let email = '';
    const first = await MC.formDialog({
      title: 'Sync across devices',
      message: 'Sign in with your email to keep MediaCopia in sync on your devices. Everything is encrypted on this device before upload: the server only ever stores ciphertext.',
      fields: [{ name: 'email', label: 'Email', type: 'email', autocomplete: 'email', inputmode: 'email' }],
      submitLabel: 'Email me a code',
      validate: async v => {
        email = v.email.trim().toLowerCase();
        if (!EMAIL_RE.test(email)) return 'Enter a valid email address.';
        try { await S().sendCode(email); } catch (e) { return e.message; }
      },
    });
    if (!first) return false;
    const second = await MC.formDialog({
      title: 'Check your email',
      message: `We sent a sign-in code to ${email}. Enter it here.`,
      fields: [{ name: 'code', label: 'Code', autocomplete: 'one-time-code', inputmode: 'numeric' }],
      submitLabel: 'Sign in',
      validate: async ({ code }) => {
        const c = code.replace(/\s/g, '');
        if (!/^\d{6,10}$/.test(c)) return 'Enter the code from the email.';
        try { await S().verifyCode(email, c); } catch (e) { return /expired|invalid/i.test(e.message) ? 'That code is wrong or has expired.' : e.message; }
      },
    });
    return !!second;
  }
  async function openSync() {
    if (!S().signedIn()) {
      if (!(await signInFlow())) return;
      askedToJoin = false;
      await S().connected();
      MC.toast('Sync is on');
      return;
    }
    const s = S().getStatus();
    if (s.state === 'needs-key') { await joinSynced(s.remote); return; }
    const res = await MC.formDialog({
      title: 'Sync across devices',
      html: `<dl class="sync-dl"><dt>Account</dt><dd>${E(S().account())}</dd><dt>Status</dt><dd>${E(syncLabel(s))}</dd></dl>`,
      submitLabel: 'Sync now', cancelLabel: 'Close', altLabel: 'Sign out',
    });
    if (res === 'alt') { await S().signOut(); MC.toast('Signed out. This device keeps its copy of MediaCopia.'); }
    else if (res) { await S().syncNow(); MC.toast(syncLabel(S().getStatus())); }
  }
  // This device has its own data key, but the account already has synced data locked with another passphrase.
  async function joinSynced(remote) {
    if (!remote) return;
    const n = (MC.state.library?.length || 0) + (MC.state.drops?.length || 0);
    const ok = await MC.formDialog({
      title: 'Join your synced MediaCopia',
      message: `This account already has MediaCopia data synced from another device, locked with a different passphrase. Enter that passphrase to merge ${n ? `this device’s ${n} ${n === 1 ? 'title' : 'titles'} into it` : 'it into this device'}. Afterwards, this device unlocks with that passphrase too.`,
      fields: [{ name: 'pass', label: 'Passphrase of the synced MediaCopia', type: 'password', autocomplete: 'current-password' }],
      submitLabel: 'Merge',
      validate: async ({ pass }) => {
        let k;
        try { k = await MC.crypto.unlockKeyring(remote.keyring, pass); } catch { return 'That isn’t the synced MediaCopia’s passphrase.'; }
        await S().joinRemote(k, remote);
      },
    });
    if (ok) MC.toast('Merging with your synced MediaCopia…');
  }
  // From the setup screen on a new device: sign in and fetch the synced keyring.
  async function restoreFromSync() {
    if (!S().signedIn() && !(await signInFlow())) return;
    let found;
    try { found = await S().adoptRemoteKeyring(); } catch (e) { MC.toast(e.message, 'error'); return; }
    if (!found) { MC.toast('Nothing is synced on this account yet. Choose a passphrase to start.'); return; }
    await showLock('Found your synced MediaCopia. Enter the passphrase you use on your other device.');
  }

  /* ---- start-up ---- */
  async function boot() {
    lockMarkup();
    try {
      await S().init({ onStatus: onSyncStatus, onNotice: t => MC.toast(t) });
      await S().takeSessionFromUrl();
      const saved = await V.meta.get('autoLockMinutes');
      if (saved !== undefined) autoLockMinutes = saved;
      // A remembered device opens straight into MediaCopia; otherwise the passphrase screen.
      const k = await V.rememberedKey();
      if (k) { opened(await V.open(k)); return; }
    } catch (e) { console.error('MediaCopia: could not open the vault', e); }
    showLock();
  }
  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(ev => document.addEventListener(ev, () => { lastActive = Date.now(); }, { passive: true }));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkIdle(); });
  setInterval(checkIdle, 30_000);

  MC.actions['open-sync'] = () => openSync();
  MC.actions['lock-now'] = () => lock();
  MC.actions['change-passphrase'] = () => changePassphrase();
  MC.actions['toggle-remember'] = () => toggleRemember();

  return { boot, lock, openSync, setAutoLock, autoLock: () => autoLockMinutes, syncLabel, paint, isUnlocked: () => unlocked };
})();
