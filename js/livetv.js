/* MediaCopia — 📡 On Live TV Now: a program guide on Home when the TV tile is picked.
   Listings come from TVmaze's free schedule (broadcast and cable channels for your country, no key needed). They're framed
   around your TV provider: the one ticked in Settings → My subscriptions → Cable & satellite TV, which you can also pick
   here (Interests → "Cable / Satellite TV" says you have one). With a provider, cable channels count as yours.
   TVmaze lists scheduled series episodes, not every movie, news or sports slot, so there's a link to the provider's full guide.
   With a Schedules Direct account (js/guide-sd.js) the guide is your real lineup instead: every channel, with numbers. */
window.MC = window.MC || {};
(() => {
  const E = s => MC.esc(s);
  const SLOT = 30 * 60e3, SLOTS = 6, MAX_ROWS = 14;
  // Each provider's own full guide, where we know it; otherwise its site.
  const GUIDE = {
    xfinity: 'https://www.xfinity.com/stream/listings', spectrum: 'https://watch.spectrum.net/guide', directv: 'https://www.directv.com/guide',
    sky: 'https://www.sky.com/tv-guide', foxtel: 'https://www.foxtel.com.au/tv-guide',
  };
  const CABLE_PICK = 'streaming.service.cable-satellite-tv';   // Interests → Services I use → Cable / Satellite TV
  // Broadcast networks first, in the order a guide lists them.
  const BROADCAST = ['abc', 'cbs', 'nbc', 'fox', 'pbs', 'the cw', 'cw', 'ion', 'telemundo', 'univision', 'syndication',
    'bbc one', 'bbc two', 'itv1', 'itv', 'channel 4', 'channel 5', 'cbc', 'ctv', 'global', 'abc tv', 'seven network', 'nine network', 'network 10', 'sbs'];
  const bIndex = ch => { const i = BROADCAST.indexOf(ch.toLowerCase()); return i < 0 ? 99 : i; };

  const ui = MC.ui.live = { cc: '', src: '', sd: false, at: 0, loading: false, error: '', items: [], offset: 0, all: false, filter: '' };
  const sdOn = () => !!MC.sdGuide?.connected();
  const srcKey = () => sdOn() ? 'sd:' + MC.sdGuide.config().lineup : 'tvmaze:' + MC.region();
  const stale = () => Date.now() - ui.at > (ui.sd ? 2 * 3600e3 : 30 * 60e3);
  const cache = {};
  const fetchDay = (cc, date) => cache[`${cc}|${date}`] ||= fetch(`https://api.tvmaze.com/schedule?country=${cc}&date=${date}`)
    .then(r => { if (!r.ok) throw new Error(`TVmaze ${r.status}`); return r.json(); })
    .catch(e => { delete cache[`${cc}|${date}`]; throw e; });
  const strip = h => (h || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
  const norm = e => {
    const s = e.show || {}, ch = s.network?.name;
    if (!ch || !e.airstamp) return null;
    const start = new Date(e.airstamp).getTime();
    return {
      key: `${e.id}`, show: s.name || 'Untitled', ep: e.name && e.name !== s.name ? e.name : '',
      se: e.season && e.number ? `S${e.season} E${e.number}` : '', channel: ch,
      start, end: start + (e.runtime || s.runtime || 30) * 60e3,
      image: s.image?.medium || '', genres: s.genres || [], year: (s.premiered || '').slice(0, 4),
      summary: strip(e.summary) || strip(s.summary),
    };
  };
  async function load(force = false) {
    const cc = MC.region(), src = srcKey(), sd = sdOn();
    if (ui.loading || (!force && ui.src === src && !stale() && ui.items.length)) return;
    if (ui.src !== src) { ui.items = []; ui.at = 0; ui.offset = 0; ui.all = false; }
    Object.assign(ui, { loading: true, error: '', cc, src, sd });
    draw();
    try {
      if (sd) ui.items = await MC.sdGuide.load();
      else {
        const day = 864e5, now = Date.now();
        const dates = [...new Set([now - day, now, now + day].map(t => MC.isoDate(new Date(t))))];
        const days = await Promise.all(dates.map(d => fetchDay(cc, d)));
        const seen = new Set();
        ui.items = days.flat().map(norm).filter(p => p && !seen.has(p.key) && seen.add(p.key));
      }
      ui.at = Date.now();
    } catch (e) { ui.error = sd ? `Couldn’t load your full guide: ${e.message || e}` : `Couldn’t load TV listings (${e.message || e}).`; }
    ui.loading = false;
    draw();
  }

  /* ---- what's yours, and what you'd like ---- */
  const myShows = () => new Set(MC.state.library.filter(i => i.type === 'tv').map(i => MC.titleKey(i.title)));
  const g = s => s.toLowerCase().replace(/science[- ]fiction/, 'sci-fi').replace(/[^a-z]/g, '');
  const likedGenres = () => new Set(Object.entries(MC.state.interests.picks).filter(([k, v]) => v > 0 && k.startsWith('tv.genre.'))
    .map(([k]) => g(MC.optionLabel('tv', 'genre', k.split('.')[2]) || '')));
  const time = t => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  /* A program → a recommendation-style record, so the details popup, How to watch and "+ Want to watch" all work. */
  const toRec = p => {
    const id = 'live-' + p.key;
    if (MC.recCache[id]?.title === p.show) return id;   // rebuilt once the full guide's details arrive
    MC.recCache[id] = {
      id, title: p.show, type: 'tv', creator: p.channel, year: p.year,
      blurb: [`${time(p.start)}–${time(p.end)} on ${p.num ? `${p.num} ` : ''}${p.channel}${p.se ? ` · ${p.se}` : ''}${p.ep ? ` · “${p.ep}”` : ''}.`, p.summary].filter(Boolean).join(' '),
      where: [{ name: p.channelName || p.channel, access: !p.num && MC.isOTA?.(p.channel) ? 'broadcast' : 'cable', url: '', price: p.num ? `ch ${p.num}` : '' }],
      source: 'live-tv',
    };
    return id;
  };

  const providerBar = tv => {
    const opts = MC.SERVICES.filter(sv => sv.cable && MC.serviceInRegion(sv));
    const saysCable = (MC.state.interests.picks[CABLE_PICK] || 0) > 0;
    return `<div class="live-provider">
      <label class="small">📡 Your TV provider
        <select data-live-provider><option value="">${opts.length ? 'Pick yours…' : 'None for ' + E(MC.region())}</option>${opts.map(sv => `<option value="${sv.id}" ${tv?.id === sv.id ? 'selected' : ''}>${E(sv.name)}</option>`).join('')}</select></label>
      ${sdOn() ? `<span class="small">✓ Full guide: <b>${E(MC.sdGuide.config().lineupName || MC.sdGuide.config().lineup)}</b> <button class="btn sm ghost" data-action="sd-disconnect">Turn off</button></span>`
        : tv ? `<button class="btn sm primary" data-action="sd-setup" title="Every channel with channel numbers, from Schedules Direct">Get every channel ✨</button>` : ''}
      ${tv ? `<a class="btn sm" href="${E(GUIDE[tv.id] || tv.url)}" target="_blank" rel="noopener">${sdOn() ? 'Open' : 'Full'} ${E(tv.name)} guide ↗</a>
        <a class="btn sm ghost" href="${E(tv.url)}" target="_blank" rel="noopener">Watch on ${E(tv.name)} ↗</a>`
        : `<span class="small muted">${saysCable ? 'Your interests say you have cable or satellite TV: pick your provider so its channels count as yours.' : 'Pick your cable or satellite provider so its channels count as yours. Broadcast channels are free with an antenna.'}</span>`}
    </div>`;
  };

  function body() {
    const tv = MC.myTV();
    const now = Date.now();
    const ws = Math.floor(now / SLOT) * SLOT + ui.offset * SLOT * SLOTS, we = ws + SLOT * SLOTS;
    const mine = myShows(), liked = likedGenres();
    const flag = p => mine.has(MC.titleKey(p.show)) ? 'mine' : p.genres.some(x => liked.has(g(x))) ? 'foryou' : '';
    const head = providerBar(tv);
    if ((ui.loading || !ui.at) && !ui.error && !ui.items.length) return `${head}<div class="status-line"><div class="spinner"></div><span>Loading tonight’s listings for ${E(ui.cc || MC.region())}…</span></div>`;
    if (ui.error) return `${head}<div class="notice error">${E(ui.error)} <button class="btn sm" data-action="live-reload">Try again</button></div>`;
    if (!ui.items.length) return `${head}<div class="empty" style="padding:18px">No TV listings found for ${E(ui.cc || MC.region())}.</div>`;

    // On now: everything airing this minute, your shows and your genres first.
    const sd = ui.sd, chNum = p => parseFloat(p.num) || 9999;
    const rank = p => (flag(p) === 'mine' ? 0 : flag(p) === 'foryou' ? 1 : 2) * 1e4 + (sd ? chNum(p) : bIndex(p.channel));
    const onNow = ui.items.filter(p => p.start <= now && p.end > now).sort((a, b) => rank(a) - rank(b));
    const label = p => p.show || '…';
    // Both versions of a station's logo; css shows the one for the current theme (the hidden one isn't downloaded).
    const logoImg = (src, cls) => `<img class="logo ${cls}" src="${E(src)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`;
    const nowCards = onNow.slice(0, 12).map(p => {
      const pct = Math.round((now - p.start) / (p.end - p.start) * 100), f = flag(p);
      return `<button class="live-card ${f}" type="button" data-action="rec-details" data-rec="${toRec(p)}">
        ${p.image ? `<img src="${E(p.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`
          : p.logo && p.logoDark ? logoImg(p.logo, 'lt') + logoImg(p.logoDark, 'dk')
          : p.logoDark ? logoImg(p.logoDark, 'on-dark') : p.logo ? logoImg(p.logo, '') : ''}
        <span class="lc-body"><span class="lc-ch">${p.num ? `${E(p.num)} · ` : ''}${E(p.channel)}${f === 'mine' ? ' · ★ yours' : f === 'foryou' ? ' · for you' : ''}${p.live ? ' · LIVE' : p.isNew ? ' · NEW' : ''}</span>
          <b>${E(label(p))}</b><span class="lc-ep">${E([p.se, p.ep].filter(Boolean).join(' · '))}</span>
          <span class="lc-bar"><i style="width:${pct}%"></i></span><span class="lc-time">Ends ${E(time(p.end))}</span></span>
      </button>`;
    }).join('');

    // The guide: one row per channel, half-hour columns.
    const inWin = ui.items.filter(p => p.end > ws && p.start < we);
    const byCh = {};
    inWin.forEach(p => (byCh[p.row || p.channel] ||= []).push(p));
    const rowName = ps => ps[0].num ? `${ps[0].num} ${ps[0].channel}` : ps[0].channel;
    const has = (ps, f) => ps.some(p => flag(p) === f) ? 0 : 1;
    // Channels showing your shows first; then by channel number (full guide) or broadcast networks, your genres, A–Z.
    let rows = Object.values(byCh).sort((pa, pb) => has(pa, 'mine') - has(pb, 'mine')
      || (sd ? chNum(pa[0]) - chNum(pb[0]) : bIndex(pa[0].channel) - bIndex(pb[0].channel) || has(pa, 'foryou') - has(pb, 'foryou'))
      || rowName(pa).localeCompare(rowName(pb)));
    const q = ui.filter.trim().toLowerCase();
    if (q) rows = rows.filter(ps => `${rowName(ps)} ${ps[0].channelName || ''} ${ps[0].affiliate || ''} ${ps.map(p => p.show).join(' ')}`.toLowerCase().includes(q));
    const max = sd ? 20 : MAX_ROWS;
    const shown = ui.all || q ? rows : rows.slice(0, max);
    // Full guide: fetch titles for what's on screen (and on now), then draw again.
    if (sd) {
      const need = [...onNow.slice(0, 600), ...shown.flat()].filter(p => !p.show).map(p => p.pid);
      if (need.length) MC.sdGuide.ensure(need).then(changed => { if (changed) draw(); }).catch(() => {});
    }
    const pos = t => Math.min(100, Math.max(0, (t - ws) / (we - ws) * 100));
    const nowLine = now >= ws && now < we ? `<i class="lg-nowline" style="left:${pos(now)}%"></i>` : '';
    const slots = Array.from({ length: SLOTS }, (_, i) => ws + i * SLOT);
    const when = new Date(ws).toDateString() === new Date().toDateString() ? 'Today' : new Date(ws).toLocaleDateString([], { weekday: 'long' });
    const tag = ps => sd ? (ps[0].affiliate && ps[0].affiliate !== ps[0].channel ? `<i>${E(ps[0].affiliate)}</i>` : '')
      : tv && !MC.isOTA?.(ps[0].channel) ? '<i>✓ yours</i>' : MC.isOTA?.(ps[0].channel) ? '<i>antenna</i>' : '';
    const grid = `<div class="lg-scroll"><div class="lg">
      <div class="lg-row lg-times"><span class="lg-ch">${E(when)}</span><div class="lg-track">${slots.map(t => `<span style="left:${pos(t)}%">${E(time(t))}</span>`).join('')}${nowLine}</div></div>
      ${shown.map(ps => `<div class="lg-row"><span class="lg-ch" title="${E(ps[0].channelName || ps[0].channel)}">${ps[0].num ? `<em>${E(ps[0].num)}</em> ` : ''}${E(ps[0].channel)}${tag(ps)}</span><div class="lg-track">
        ${ps.sort((a, b) => a.start - b.start).map(p => {
          const l = pos(p.start), w = pos(p.end) - l, f = flag(p), on = p.start <= now && p.end > now;
          return `<button class="lg-prog ${f}${on ? ' on' : ''}${p.show ? '' : ' pending'}" type="button" style="left:${l}%;width:${w}%" data-action="rec-details" data-rec="${toRec(p)}" title="${E(`${label(p)}${p.ep ? ` · ${p.ep}` : ''}\n${time(p.start)}–${time(p.end)} · ${p.num ? p.num + ' ' : ''}${p.channel}`)}"><b>${f === 'mine' ? '★ ' : ''}${E(label(p))}</b><span>${E(time(p.start))}${p.live ? ' · LIVE' : p.isNew ? ' · NEW' : ''}</span></button>`;
        }).join('')}${nowLine}</div></div>`).join('')}
    </div></div>
    ${rows.length > max && !q ? `<button class="btn sm ghost" data-action="live-all">${ui.all ? 'Show fewer channels' : `Show all ${rows.length} channels`}</button>` : ''}`;

    const cfg = sd ? MC.sdGuide.config() : null;
    return `${head}
      ${nowCards ? `<div class="live-now">${nowCards}</div>` : '<p class="small muted">Nothing in the listings is airing this minute.</p>'}
      <div class="section-head lg-head"><h3>TV guide</h3><div class="row">
        <input type="search" class="lg-filter" data-live-filter value="${E(ui.filter)}" placeholder="Find a channel or show" aria-label="Find a channel or show">
        <button class="btn sm ghost" data-action="live-shift" data-by="-1" ${ui.offset <= 0 ? 'disabled' : ''} aria-label="Earlier">◀ Earlier</button>
        <button class="btn sm ${ui.offset ? '' : 'primary'}" data-action="live-shift" data-by="0">Now</button>
        <button class="btn sm ghost" data-action="live-shift" data-by="1" ${ui.offset >= 7 ? 'disabled' : ''} aria-label="Later">Later ▶</button></div></div>
      ${rows.length ? grid : `<p class="small muted">${q ? `No channel or show matching “${E(ui.filter)}” in this time window.` : 'No listings in this time window.'}</p>`}
      <p class="tiny muted">${sd
        ? `Your full guide: ${E(cfg.lineupName || cfg.lineup)} (${E(cfg.zip)}), from <a href="https://www.schedulesdirect.org" target="_blank" rel="noopener">Schedules Direct</a>, in your time zone.`
        : `Listings from <a href="https://www.tvmaze.com" target="_blank" rel="noopener">TVmaze</a>: scheduled series episodes on broadcast and cable channels in ${E(ui.cc)}, in your time zone. Movies, news and sports may be missing, and channel numbers depend on your area${tv ? `: <b>Get every channel</b> for your real ${E(tv.name)} lineup` : ''}.`}
        ★ shows in your library · <span class="lg-key foryou"></span> your favourite TV genres.</p>`;
  }
  function draw() {
    const el = document.getElementById('live-tv-body'); if (!el) return;
    // Keep typing in the search box while the guide redraws around it.
    const f = document.activeElement?.matches?.('[data-live-filter]') ? document.activeElement : null, caret = f?.selectionStart;
    el.innerHTML = body();
    if (f) { const n = el.querySelector('[data-live-filter]'); n.focus(); try { n.setSelectionRange(caret, caret); } catch { /* not supported */ } }
  }

  MC.liveTV = () => `<div class="section card pad live-tv" id="live-tv">
    <div class="section-head" style="margin:0"><h2>📡 On Live TV Now</h2><span class="small muted" data-live-clock>${E(time(Date.now()))}</span></div>
    <div id="live-tv-body">${body()}</div></div>`;
  MC.liveTVMount = root => {
    load();
    root.querySelector('#live-tv')?.addEventListener('input', e => {
      if (!e.target.matches('[data-live-filter]')) return;
      ui.filter = e.target.value; draw();
    });
    root.querySelector('#live-tv')?.addEventListener('change', e => {
      if (!e.target.matches('[data-live-provider]')) return;
      const id = e.target.value;
      MC.update(s => {
        s.settings.subs = (s.settings.subs || []).filter(x => !MC.SERVICE[x]?.cable).concat(id ? [id] : []);
        if (id && !(s.interests.picks[CABLE_PICK] > 0)) s.interests.picks[CABLE_PICK] = 1;
      });
      MC.toast(id ? `${MC.SERVICE[id].name} is your TV provider: its channels now count as yours.` : 'TV provider removed.');
    });
  };
  // Keep the clock, progress bars and the "now" line current while the guide is on screen.
  setInterval(() => {
    if (!document.getElementById('live-tv') || document.querySelector('#live-tv select:focus')) return;
    const c = document.querySelector('[data-live-clock]'); if (c) c.textContent = time(Date.now());
    if (document.activeElement?.matches?.('[data-live-filter]')) return;
    if (stale() && !ui.loading) load(); else draw();
  }, 60e3);

  MC.actions['live-shift'] = el => { const by = +el.dataset.by; ui.offset = by ? Math.max(0, Math.min(7, ui.offset + by)) : 0; draw(); };
  MC.actions['live-all'] = () => { ui.all = !ui.all; draw(); };
  MC.actions['live-reload'] = () => load(true);
})();
