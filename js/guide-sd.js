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
  let tok = null;                 // { token, exp, user } — kept in memory only (they allow 100 sign-ins a day)
  const details = {};             // programID → details, or null when it couldn't be fetched
  const inflight = new Set();
  let items = [];                 // the loaded schedule (normalized, see livetv.js)

  class SDError extends Error { constructor(msg, code) { super(msg); this.code = code; } }
  const sha1 = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('');

  async function signIn(user, hash) {
    const r = await fetch(BASE + 'token', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: user, password: hash }) });
    const d = await r.json().catch(() => null);
    if (!d?.token) throw new SDError(d?.code === 4003 ? 'Wrong Schedules Direct username or password.' : d?.message || `Schedules Direct sign-in failed (${r.status}).`, d?.code);
    return { token: d.token, exp: (d.tokenExpires ? d.tokenExpires * 1000 : Date.now() + 20 * 3600e3) - 600e3, user };
  }
  async function token(creds = g(), fresh = false) {
    if (!fresh && tok && tok.user === creds.user && tok.exp > Date.now()) return tok.token;
    tok = await signIn(creds.user, creds.hash);
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
    items = []; MC.ui.live && (MC.ui.live.at = 0);
    MC.toast(`Full guide on: ${chosen.name}`);
  }
  async function disconnect() {
    if (!(await MC.confirm('Turn off the full guide?', 'MediaCopia forgets your Schedules Direct sign-in and lineup, and goes back to the basic TVmaze listings. Your Schedules Direct account itself is unchanged.', 'Turn off'))) return;
    tok = null; items = [];
    MC.update(s => { delete s.settings.guide; });
    MC.ui.live && (MC.ui.live.at = 0);
  }

  /* ---- the schedule for every channel in your lineup ---- */
  async function load() {
    const cfg = g();
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
      const logo = (sta.stationLogo || [])[0]?.URL || sta.logo?.URL || '';
      return s.programs.map(p => {
        const start = Date.parse(p.airDateTime), key = `${s.stationID}|${p.airDateTime}`;
        if (!start || seen.has(key)) return null;
        seen.add(key);
        return { key, pid: p.programID, row: s.stationID, channel: sta.callsign || sta.name, channelName: sta.name, affiliate: sta.affiliate || '',
          num: chan[s.stationID], logo, start, end: start + (p.duration || 1800) * 1000, isNew: !!p.new, live: p.liveTapeDelay === 'Live',
          show: '', ep: '', se: '', genres: [], year: '', summary: '', image: '' };
      }).filter(Boolean);
    });
    items.forEach(apply);
    return items;
  }
  const apply = it => {
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
    return true;
  }

  return {
    connected: () => !!(g().user && g().hash && g().lineup),
    config: g, setup, disconnect, load, ensure,
    pending: () => inflight.size > 0,
  };
})();

MC.actions['sd-setup'] = () => MC.sdGuide.setup();
MC.actions['sd-disconnect'] = () => MC.sdGuide.disconnect();
