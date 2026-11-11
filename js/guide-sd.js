/* MediaCopia — the full TV guide from Schedules Direct (schedulesdirect.org), for 📡 On Live TV Now (js/livetv.js).
   With your own Schedules Direct account, the guide shows your actual cable or satellite lineup for your ZIP code:
   every channel, with channel numbers, and every program (movies, news and sports too).

   Schedules Direct licenses its data for individual use in open-source software only; MediaCopia is open source
   (MIT, see LICENSE) and each person uses their own account. Their API can't be called from a web page directly, so
   requests go through a relay (MC.SD_RELAY in js/sync-config.js; server/sd-relay.nginx.conf) that passes them on and keeps
   nothing. Your password is SHA-1 hashed here before it is sent, as their API requires; the hash, your username,
   ZIP code and lineup are kept in your encrypted settings (synced, never in a backup file). */
window.MC = window.MC || {};
MC.sdGuide = (() => {
  const E = s => MC.esc(s);
  const RELAY = new URL(MC.SD_RELAY || 'https://mediacopia.com/sd/');
  const BASE = RELAY.origin === location.origin ? RELAY.pathname : RELAY.href;   // same site: a relative path
  const COUNTRY = { US: 'USA', CA: 'CAN', GB: 'GBR', IE: 'IRL', AU: 'AUS', NZ: 'NZL', DE: 'DEU', FR: 'FRA' };
  const TOKEN_CODES = new Set([1004, 4004, 4005, 4006, 4007]);   // missing, invalid or expired token: sign in again once
  const DETAILS_BATCH = 500;
  const g = () => MC.state.settings.guide || {};
  let tok = null;                 // { token, exp, user }: a sign-in lasts 24 hours, and they allow 100 a day
  const details = {};             // programID → details, or null when it couldn't be fetched
  const inflight = new Set();
  let items = [];                 // the loaded schedule (normalized, see livetv.js)
  let loadedAt = 0;

  /* This device's copy of the sign-in and the loaded guide, encrypted with the vault key in IndexedDB (never synced or
     backed up). Reopening MediaCopia reuses it, so a reload doesn't sign in again or fetch the whole guide: Schedules
     Direct asks apps to refresh at most once an hour, and allows 100 sign-ins a day. */
  const CACHE = 'sdGuide', CACHE_AAD = 'mediacopia-sdguide', FRESH = 2 * 3600e3;
  let cacheP = null, saveTimer = 0;
  const readCache = () => cacheP ||= (async () => {
    const k = MC.vault.key(), rec = await MC.vault.meta.get(CACHE);
    return k && rec ? MC.crypto.decryptJSON(k, rec.iv, rec.ct, CACHE_AAD) : null;
  })().catch(() => null);   // locked, or the key changed after joining another device: start fresh
  async function writeCache() {
    const k = MC.vault.key(), cfg = g();
    if (!k || !cfg.lineup) return;
    const stations = {}, progs = [], keep = {};
    items.forEach(it => {
      stations[it.row] ||= { channel: it.channel, channelName: it.channelName, affiliate: it.affiliate, num: it.num, logo: it.logo, logoDark: it.logoDark };
      progs.push([it.row, it.pid, it.start, it.end, (it.isNew ? 1 : 0) | (it.live ? 2 : 0)]);
      if (details[it.pid]) keep[it.pid] = details[it.pid];   // not the failures: those are retried next time
    });
    const data = { user: cfg.user, lineup: cfg.lineup, token: tok?.user === cfg.user ? tok : null, at: loadedAt, stations, progs, details: keep };
    const { iv, ct } = await MC.crypto.encryptJSON(k, data, CACHE_AAD);
    await MC.vault.meta.set(CACHE, { iv, ct });
    cacheP = Promise.resolve(data);
  }
  const saveSoon = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => writeCache().catch(e => console.warn('MediaCopia: couldn’t keep the guide on this device', e)), 1500); };
  const clearCache = () => { clearTimeout(saveTimer); cacheP = null; loadedAt = 0; return MC.vault.meta.set(CACHE, null).catch(() => {}); };
  const blank = { show: '', ep: '', se: '', genres: [], year: '', summary: '', image: '' };
  function restore(c) {
    Object.assign(details, c.details || {});
    items = (c.progs || []).map(([row, pid, start, end, f]) => ({ key: `${row}|${start}`, pid, row, ...c.stations[row], start, end, isNew: !!(f & 1), live: !!(f & 2), ...blank, genres: [] }));
    items.forEach(apply);
    loadedAt = c.at;
  }

  class SDError extends Error { constructor(msg, code) { super(msg); this.code = code; } }
  const sha1 = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('');

  async function signIn(user, hash) {
    const r = await fetch(BASE + 'token', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: user, password: hash }) });
    const d = await r.json().catch(() => null);
    if (!d?.token) throw new SDError(d?.code === 4003 ? 'Wrong Schedules Direct username or password.' : d?.message || `Schedules Direct sign-in failed (${r.status}).`, d?.code);
    return { token: d.token, exp: (d.tokenExpires ? d.tokenExpires * 1000 : Date.now() + 20 * 3600e3) - 600e3, user };
  }
  async function token(creds = g(), fresh = false) {
    if (!fresh && !tok && creds === g()) {   // reopened: the sign-in this device kept, if it's still good
      const c = await readCache();
      if (c?.token && c.token.user === creds.user && c.token.exp > Date.now()) tok = c.token;
    }
    if (!fresh && tok && tok.user === creds.user && tok.exp > Date.now()) return tok.token;
    tok = await signIn(creds.user, creds.hash);
    if (creds === g() && loadedAt) saveSoon();
    return tok.token;
  }
  async function api(path, { method = 'GET', body, creds, retried = false } = {}) {
    const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', token: await token(creds) }, body: body ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(() => null);
    const code = d && !Array.isArray(d) ? d.code : 0;
    if (code && TOKEN_CODES.has(code) && !retried) { tok = null; return api(path, { method, body, creds, retried: true }); }
    if (code) throw new SDError(d.message || d.response || `Schedules Direct error ${code}`, code);
    if (!r.ok || d == null) throw new SDError(`Schedules Direct didn’t answer (${r.status}). Try again in a minute.`, r.status);
    return d;
  }

  /* ---- setup: sign in, find the lineups for your ZIP code, pick yours ---- */
  async function setup() {
    const tv = MC.myTV(), cc = MC.region(), country = COUNTRY[cc];
    if (!country) { MC.toast(`Schedules Direct lineups aren’t available for ${cc} here.`, 'error'); return; }
    let creds, heads;
    const first = await MC.formDialog({
      title: 'Full TV guide',
      html: `<p class="small">Show your real ${E(tv?.name || 'cable or satellite')} lineup, with channel numbers and every program, from
        <a href="https://www.schedulesdirect.org" target="_blank" rel="noopener">Schedules Direct</a>: a nonprofit guide-data service
        (about $35 a year, with a free 7-day trial). <a href="https://www.schedulesdirect.org/signup" target="_blank" rel="noopener">Create an account ↗</a></p>
        <p class="small muted">Your password is scrambled (hashed) on this device before it is sent, and kept encrypted with the rest of your MediaCopia. Requests pass through mediacopia.com, which keeps nothing.</p>`,
      fields: [
        { name: 'user', label: 'Schedules Direct username', autocomplete: 'username' },
        { name: 'pass', label: 'Password', type: 'password', autocomplete: 'current-password' },
        { name: 'zip', label: cc === 'US' ? 'ZIP code' : 'Postal code', autocomplete: 'postal-code' },
      ],
      submitLabel: 'Find my lineup',
      validate: async v => {
        if (!v.user.trim() || !v.pass || !v.zip.trim()) return 'Fill in all three.';
        try {
          creds = { user: v.user.trim(), hash: await sha1(v.pass), zip: v.zip.trim().toUpperCase() };
          tok = null;
          heads = await api(`headends?country=${country}&postalcode=${encodeURIComponent(creds.zip)}`, { creds });
        } catch (e) { return e.message; }
        if (!Array.isArray(heads) || !heads.length) return `No lineups found for ${creds.zip}.`;
        return null;
      },
    });
    if (!first) return;
    const word = (tv?.name || '').toLowerCase().split(/[\s!]/)[0];
    const lineups = heads.flatMap(h => (h.lineups || []).map(l => ({ id: l.lineup, name: l.name, transport: h.transport, location: h.location })))
      .filter((l, i, a) => a.findIndex(x => x.id === l.id) === i)
      .sort((a, b) => (word && b.name.toLowerCase().includes(word)) - (word && a.name.toLowerCase().includes(word)) || a.name.localeCompare(b.name));
    let chosen = null;
    const second = await MC.formDialog({
      title: 'Pick your lineup',
      html: `<label class="field">Lineups for ${E(creds.zip)}
          <select name="lineup" data-sd-lineup>${lineups.map(l => `<option value="${E(l.id)}">${E(l.name)} · ${E(l.transport || '')}${l.location ? ` · ${E(l.location)}` : ''}</option>`).join('')}</select></label>
        <p class="small muted">Pick the one that matches your service (cable, satellite or fiber). It’s added to your Schedules Direct account, which holds up to 4 lineups and allows 6 changes a day.</p>`,
      submitLabel: 'Use this lineup',
      validate: async () => {
        const id = document.querySelector('[data-sd-lineup]')?.value;
        chosen = lineups.find(l => l.id === id);
        if (!chosen) return 'Pick a lineup.';
        try {
          const st = await api('status', { creds });
          const have = (st.lineups || []).some(l => (l.lineup || l.ID) === chosen.id && !l.isDeleted);
          if (!have) await api(`lineups/${encodeURIComponent(chosen.id)}`, { method: 'PUT', creds });
        } catch (e) { return e.code === 4100 || /max/i.test(e.message) ? `${e.message} Remove a lineup at schedulesdirect.org, then try again.` : e.message; }
        return null;
      },
    });
    if (!second || !chosen) return;
    MC.update(s => { s.settings.guide = { ...creds, country, lineup: chosen.id, lineupName: chosen.name, at: new Date().toISOString() }; });
    items = []; await clearCache(); MC.ui.live && (MC.ui.live.at = 0);
    MC.toast(`Full guide on: ${chosen.name}`);
  }
  async function disconnect() {
    if (!(await MC.confirm('Turn off the full guide?', 'MediaCopia forgets your Schedules Direct sign-in and lineup, and goes back to the basic TVmaze listings. Your Schedules Direct account itself is unchanged.', 'Turn off'))) return;
    tok = null; items = []; await clearCache();
    MC.update(s => { delete s.settings.guide; });
    MC.ui.live && (MC.ui.live.at = 0);
  }

  /* ---- the schedule for every channel in your lineup ---- */
  // force: skip this device's copy (the "Try again" button).
  async function load(force = false) {
    const cfg = g();
    if (!force && !items.length) {
      const c = await readCache();
      if (c && c.lineup === cfg.lineup && c.user === cfg.user && Date.now() - c.at < FRESH && c.progs?.length) { restore(c); return items; }
    }
    const lu = await api(`lineups/${encodeURIComponent(cfg.lineup)}`);
    const st = Object.fromEntries((lu.stations || []).map(s => [s.stationID, s]));
    const chan = {};   // stationID → lowest channel number on this lineup
    (lu.map || []).forEach(m => { if (m.stationID && m.channel && (!chan[m.stationID] || parseFloat(m.channel) < parseFloat(chan[m.stationID]))) chan[m.stationID] = m.channel; });
    const ids = Object.keys(chan);
    const now = Date.now(), dates = [...new Set([now - 6 * 3600e3, now, now + 24 * 3600e3].map(t => new Date(t).toISOString().slice(0, 10)))];
    const sched = await api('schedules', { method: 'POST', body: ids.map(stationID => ({ stationID, date: dates })) });
    const seen = new Set();
    items = (Array.isArray(sched) ? sched : []).flatMap(s => {
      const sta = st[s.stationID];
      if (!sta || !Array.isArray(s.programs)) return [];
      const { logo, logoDark } = logos(sta);
      return s.programs.map(p => {
        const start = Date.parse(p.airDateTime), key = `${s.stationID}|${start}`;
        if (!start || seen.has(key)) return null;
        seen.add(key);
        return { key, pid: p.programID, row: s.stationID, channel: sta.callsign || sta.name, channelName: sta.name, affiliate: sta.affiliate || '',
          num: chan[s.stationID], logo, logoDark, start, end: start + (p.duration || 1800) * 1000, isNew: !!p.new, live: p.liveTapeDelay === 'Live',
          ...blank, genres: [] };
      }).filter(Boolean);
    });
    items.forEach(apply);
    loadedAt = Date.now();
    saveSoon();
    return items;
  }
  /* Station logos come in versions for light and dark backgrounds (category: light, gray, dark, white). Many are white
     artwork that vanishes on a light tile, so keep one of each and let the theme pick (css: .live-card img.lt / .dk). */
  const logos = sta => {
    const all = (sta.stationLogo || []).filter(l => l?.URL), pick = (...cats) => cats.map(c => all.find(l => l.category === c)).find(Boolean)?.URL || '';
    const light = pick('light', 'gray') || (all.some(l => l.category) ? '' : all[0]?.URL) || sta.logo?.URL || '';
    const dark = pick('dark', 'white');
    return { logo: light, logoDark: dark };
  };
  const apply = it => {
    if (art[it.pid]) it.image = artUrl(art[it.pid]);
    const d = details[it.pid];
    if (d === undefined) return;
    Object.assign(it, d || { show: 'Listing unavailable' });
  };
  const toDetails = p => {
    const md = (p.metadata || []).find(m => m.Gracenote)?.Gracenote || {};
    const desc = p.descriptions?.description1000?.[0]?.description || p.descriptions?.description100?.[0]?.description || '';
    return {
      show: p.titles?.[0]?.title120 || 'Untitled', ep: p.episodeTitle150 || '',
      se: md.season && md.episode ? `S${md.season} E${md.episode}` : '', genres: p.genres || [],
      year: String(p.movie?.year || (p.programID?.startsWith('MV') ? (p.originalAirDate || '').slice(0, 4) : '') || ''), summary: desc,
      kind: p.showType || '',
    };
  };
  /* ---- show artwork, for the "on now" cards only ----
     Each image counts toward the account's daily download limit, and asking for missing images can get the account
     blocked for a day, so: only the cards on screen, at most ART_MAX per page visit, never the same URI twice after a
     failure, and none at all after a few failures (the limit may have been reached). Their image URIs may change, so
     they're kept in memory only, not with this device's copy of the guide; the browser's cache keeps the images. */
  const ART_MAX = 60, ART_FAILS = 6;
  const art = {};                 // programID → image URI, or null when it has none (or it failed)
  let artCount = 0, artFails = 0, artBusy = false;
  const ASPECT = { '2x3': 0, '3x4': 1, '4x3': 3, '16x9': 4 }, SIZE = { Md: 0, Sm: 1, Lg: 2, Ms: 3 };
  const CATEGORY = ['Poster Art', 'Box Art', 'Banner-L1', 'Banner-L2', 'Iconic', 'Cast in Character', 'Scene Still'];
  const rankArt = a => (ASPECT[a.aspect] ?? 5) * 100 + (CATEGORY.includes(a.category) ? CATEGORY.indexOf(a.category) : 9) * 10 + (SIZE[a.size] ?? 4);
  const pickArt = list => (Array.isArray(list) ? list : []).filter(a => a?.uri && a.category !== 'Logo').sort((a, b) => rankArt(a) - rankArt(b))[0]?.uri || null;
  // A full URI points at Amazon S3; a partial one goes to Schedules Direct (through the relay), which redirects there.
  const artUrl = uri => /^https?:/i.test(uri) ? uri : tok ? `${BASE}image/${uri}?token=${encodeURIComponent(tok.token)}` : '';
  async function ensureArt(pids) {
    if (artBusy || artFails >= ART_FAILS) return false;
    const need = [...new Set(pids)].filter(id => id && !(id in art)).slice(0, ART_MAX - artCount);
    if (!need.length) return false;
    artBusy = true;
    try {
      const res = await api('metadata/programs/', { method: 'POST', body: need });
      (Array.isArray(res) ? res : []).forEach(r => {
        const uri = pickArt(r?.data);
        if (r?.programID) need.forEach(id => { if (id === r.programID || id.startsWith(r.programID)) art[id] ??= uri; });
      });
    } catch { artFails++; } finally { artBusy = false; }
    need.forEach(id => { art[id] ??= null; if (art[id]) artCount++; });
    items.forEach(apply);
    return true;
  }
  function artFailed(pid) {   // an image didn't load: don't ask for it again
    if (pid) art[pid] = null;
    items.forEach(it => { if (it.pid === pid) it.image = ''; });
    artFails++;
  }

  /* Fetch details (titles, episodes, descriptions) for these programs, in batches; resolves once they're applied. */
  async function ensure(pids) {
    const need = [...new Set(pids)].filter(id => id && !(id in details) && !inflight.has(id));
    if (!need.length) return false;
    need.forEach(id => inflight.add(id));
    try {
      for (let i = 0; i < need.length; i += DETAILS_BATCH) {
        const batch = need.slice(i, i + DETAILS_BATCH);
        const res = await api('programs', { method: 'POST', body: batch }).catch(() => []);
        (Array.isArray(res) ? res : []).forEach(p => { if (p?.programID && p.titles) details[p.programID] = toDetails(p); });
        batch.forEach(id => { if (!(id in details)) details[id] = null; });
      }
    } finally { need.forEach(id => inflight.delete(id)); }
    items.forEach(apply);
    saveSoon();
    return true;
  }

  return {
    connected: () => !!(g().user && g().hash && g().lineup),
    config: g, setup, disconnect, load, ensure, ensureArt, artFailed, loadedAt: () => loadedAt,
    pending: () => inflight.size > 0,
  };
})();

MC.actions['sd-setup'] = () => MC.sdGuide.setup();
MC.actions['sd-disconnect'] = () => MC.sdGuide.disconnect();
