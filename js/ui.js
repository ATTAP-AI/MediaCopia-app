/* MediaCopia — shared UI pieces: escaping, toasts, modals, cards, editors. */
window.MC = window.MC || {};

MC.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
MC.safeUrl = u => /^https?:\/\//i.test(u || '') ? u : '';
MC.actions = {};   // data-action="name" → handler(el, event)
MC.recCache = {};  // id → recommendation object, for card buttons

/* ---------- toast ---------- */
MC.toast = (msg, kind = '') => {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = msg;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.remove(), kind === 'error' ? 5200 : 2600);
};

/* ---------- modal ---------- */
MC.openModal = (html, onMount) => {
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-back" data-modal-back><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`;
  const back = root.firstElementChild;
  back.addEventListener('mousedown', e => { if (e.target === back) MC.closeModal(); });
  onMount?.(back.querySelector('.modal'));
  back.querySelector('input:not([type=hidden]), textarea, select')?.focus();
};
MC.closeModal = () => { document.getElementById('modal-root').innerHTML = ''; };
document.addEventListener('keydown', e => { if (e.key === 'Escape') MC.closeModal(); });

MC.confirm = (title, body, okLabel = 'Delete') => new Promise(resolve => {
  MC.openModal(`
    <div class="modal-head"><h2>${MC.esc(title)}</h2></div>
    <div class="modal-body"><p>${MC.esc(body)}</p></div>
    <div class="modal-foot"><button class="btn" data-no>Cancel</button><button class="btn danger solid" data-yes>${MC.esc(okLabel)}</button></div>`,
  m => {
    m.querySelector('[data-no]').onclick = () => { MC.closeModal(); resolve(false); };
    m.querySelector('[data-yes]').onclick = () => { MC.closeModal(); resolve(true); };
  });
});

/* ---------- small renderers ---------- */
MC.stars = n => n ? `<span class="stars" aria-label="${n} of 5 stars">${'★'.repeat(n)}<span class="off">${'★'.repeat(5 - n)}</span></span>` : '';
MC.typeStyle = type => `style="--type:${MC.TYPE[type]?.color || 'var(--accent)'}"`;
MC.statusPill = item => {
  const t = MC.TYPE[item.type];
  const cls = { want: 'accent', active: 'ok', done: '', dropped: 'warn' }[item.status] || '';
  return `<span class="pill ${cls}">${MC.esc(t.status[item.status] || item.status)}</span>`;
};

/* rec: { title, type, creator, year, why|blurb, tags[], release_date, where, reasons[] } */

/* ---------- where to watch / listen / read / play ---------- */
const enc = encodeURIComponent;
MC.ACCESS_LABEL = { subscription: 'subscription', free: 'free', rent: 'rent', buy: 'buy', library: 'library', theaters: 'in theaters', broadcast: 'TV / radio', cable: 'cable / satellite TV', other: '' };
/* Search links that always work, per media type (used for every card, and on their own when there is no AI answer). */
MC.findLinks = (type, title, creator = '') => {
  const q = enc(title), qc = enc([title, creator].filter(Boolean).join(' '));
  const cc = MC.region().toLowerCase(), jw = cc === 'gb' ? 'uk' : cc;
  const L = {
    books: [['Goodreads', `https://www.goodreads.com/search?q=${qc}`], ['Libby', `https://libbyapp.com/search/query-${q}/page-1`],
      ['Audible', `https://www.audible.com/search?keywords=${qc}`], ['Bookshop', `https://bookshop.org/search?keywords=${qc}`], ['WorldCat (libraries)', `https://search.worldcat.org/search?q=${qc}`]],
    music: [['Spotify', `https://open.spotify.com/search/${qc}`], ['Apple Music', `https://music.apple.com/${cc}/search?term=${qc}`],
      ['YouTube Music', `https://music.youtube.com/search?q=${qc}`], ['Bandcamp', `https://bandcamp.com/search?q=${qc}`]],
    movies: [['JustWatch', `https://www.justwatch.com/${jw}/search?q=${q}`], ['Trailer', `https://www.youtube.com/results?search_query=${enc(title + ' trailer')}`],
      ['Letterboxd', `https://letterboxd.com/search/${q}/`]],
    tv: [['JustWatch', `https://www.justwatch.com/${jw}/search?q=${q}`], ['Trailer', `https://www.youtube.com/results?search_query=${enc(title + ' trailer')}`]],
    games: [['Steam', `https://store.steampowered.com/search/?term=${q}`], ['PlayStation Store', `https://store.playstation.com/search/${q}`],
      ['Nintendo', `https://www.nintendo.com/search/#q=${q}`], ['Xbox', `https://www.xbox.com/search/results?q=${q}`], ['Gameplay video', `https://www.youtube.com/results?search_query=${enc(title + ' gameplay')}`]],
    streaming: [['Official site', `https://duckduckgo.com/?q=${enc(title + ' official site')}`], ['What’s on it (JustWatch)', `https://www.justwatch.com/${jw}/`]],
    social: /^r\/[\w-]+$/i.test(title) ? [['Open on Reddit', `https://www.reddit.com/${title}/`]]
      : [['Find it', `https://duckduckgo.com/?q=${qc}`]],
  };
  return L[type] || [];
};
/* rec/drop → "Where to get it" block.
   1. Says which of the user's subscriptions include it (✓ On your subscriptions: …) with direct links.
   2. Lists every other service Claude found (subscription / free / rent / buy …).
   3. With no AI answer, links straight into the user's relevant subscriptions to check, then general search links. */
const INCLUDED = new Set(['subscription', 'free', 'library', 'cable']);
/* A paid channel inside a service you have ("Prime Video (Paramount+ channel)") isn't included with it. */
const isAddon = w => /\(.*\b(channel|add-?on)\b|\badd-?on\b/i.test(`${w.name || ''} ${w.price || ''}`);
/* App-icon style logo tile for a service/store/site: brand colour, its logo, initials until (or unless) the logo loads. */
const lightHex = hex => { const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || ''); if (!m) return false; const [r, g, b] = m.slice(1).map(x => parseInt(x, 16)); return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.72; };
const initials = name => (name || '?').replace(/[^\p{L}\p{N}+ ]/gu, '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
MC.logoTile = ({ name = '', url = '', svc = null, size = '' } = {}) => {
  const sv = svc || MC.matchService(name);
  const bg = sv?.bg || '#2a2540';
  const icon = MC.favicon(sv?.url || url, 128);
  return `<span class="logo-tile ${size}${lightHex(bg) ? ' light' : ''}" style="--bg:${MC.esc(bg)}" aria-hidden="true"><span class="ini">${MC.esc(initials(sv?.name || name))}</span>${icon ? `<img src="${MC.esc(icon)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}</span>`;
};
/* ---------- Cheapest way first: HyperFan's "cheapest legal path", for films, shows, books, music and games ----------
   Every way to get a title, ranked: YOURS (on a service you already pay for) → FREE (with ads, a library card) →
   TRIAL (free for new members) → ON TV → everything paid, cheapest first, so a $3.99 rental beats a new $8.99/mo
   subscription. Subscription prices and free trials come from Settings → Check prices & deals when Claude didn't give
   one. Prices are approximate: the popups say so. */
const MONEY_RE = /([$€£¥₹])\s?(\d+(?:[.,]\d{1,2})?)/;
const parseMoney = s => { const m = MONEY_RE.exec(s || ''); return m ? { cur: m[1], n: parseFloat(m[2].replace(',', '.')) } : null; };
const perOf = s => /\/\s*(mo|month)\b|per month|monthly|a month/i.test(s || '') ? '/mo' : /\/\s*(yr|year)\b|per year|annual|a year/i.test(s || '') ? '/yr' : '';
const money = (m, per = '') => `${m.cur}${m.n % 1 ? m.n.toFixed(2) : m.n}${per}`;
MC.WATCH_TAG = { yours: 'YOURS', free: 'FREE', library: 'LIBRARY', trial: 'TRIAL', tv: 'ON TV', subs: 'SUBS', addon: 'ADD-ON', rent: 'RENT', buy: 'BUY', theaters: 'CINEMAS', other: 'OTHER' };
const ZERO = new Set(['yours', 'free', 'library']);
/* Broadcast channels anyone can get free with an antenna. Other "on TV" options (cable, on demand) need a TV package,
   so they count as yours once you've ticked a cable or satellite provider in Settings. */
const OTA_RE = /^(abc(?! news)|nbc(?! sports| news)|cbs(?! sports| news)|fox(?! news| business| sports| deportes| soul| life)|pbs|the cw|cw|ion|syndication|telemundo|univision|bbc (one|two|three|four)|itv\d?x?|channel [45]|e4|cbc|ctv|global)\b/i;
MC.isOTA = name => OTA_RE.test((name || '').trim());
const KIND_ORDER = { yours: 0, free: 1, library: 2, subs: 3, trial: 4, addon: 5, rent: 6, buy: 7, theaters: 8, tv: 9, other: 10 };
const UNPRICED = { subs: 'Subs', trial: 'Free trial', addon: 'Add-on', rent: 'Rent', buy: 'Buy', theaters: 'Cinemas', tv: 'On TV', other: 'See options' };
MC.watchPaths = rec => {
  const where = Array.isArray(rec.where) ? rec.where : [];
  const seen = new Set();
  return where.filter(w => w && w.name).map(w => {
    const svc = MC.matchService(w.name), addon = isAddon(w);
    // On a cable channel ("FX", "AMC, live or on demand") and you have a TV provider: included with your package.
    const viaTV = !addon && !svc?.cable && (w.access === 'cable' || (w.access === 'broadcast' && !OTA_RE.test(w.name.trim()))) ? MC.myTV() : null;
    const mine = !!viaTV || (!!svc && MC.hasSub(svc.id) && INCLUDED.has(w.access) && !addon);
    let kind = mine ? 'yours' : addon ? 'addon'
      : { subscription: 'subs', free: 'free', library: 'library', rent: 'rent', buy: 'buy', theaters: 'theaters', broadcast: 'tv', cable: 'tv' }[w.access] || 'other';
    let cost = parseMoney(w.price), per = perOf(w.price) || (kind === 'subs' || kind === 'addon' ? '/mo' : '');
    const sp = svc ? MC.servicePrice(svc.id) : null;
    if ((kind === 'subs' || kind === 'addon') && !cost && sp?.price) { cost = parseMoney(sp.price); per = perOf(sp.price) || '/mo'; }
    if (kind === 'subs' && sp?.trial) kind = 'trial';
    const ota = kind === 'tv' && OTA_RE.test(w.name.trim());
    if (ota) kind = 'free';
    const extra = w.price && !cost ? w.price : '';   // "with ads", "4K"…
    const name = svc && w.name.length <= svc.name.length + 2 ? svc.name : w.name;
    const note = viaTV ? `with your ${viaTV.name} TV package${extra ? ` · ${extra}` : ''}`
      : kind === 'yours' ? `included with your ${svc.name}${extra ? ` · ${extra}` : ''}`
      : kind === 'free' ? (ota ? 'free over the air with an antenna' : extra || 'free, often with ads')
      : kind === 'library' ? 'free with a library card'
      : kind === 'trial' ? `${sp.trial}${cost ? `, then ${money(cost, per)}` : ''}`
      : kind === 'tv' ? (extra || (w.access === 'cable' ? 'needs a cable or satellite TV package' : 'needs a TV package; check listings'))
      : kind === 'theaters' ? (extra || 'in cinemas')
      : kind === 'addon' ? 'paid channel inside this service'
      : extra;
    const priceText = kind === 'yours' ? '✓ Yours' : ZERO.has(kind) ? 'Free' : cost ? money(cost, per) : UNPRICED[kind];
    // Free to you first, then paid by real price (a trial ranks by what it costs afterwards), then anything unpriced.
    const tier = ZERO.has(kind) ? 0 : cost ? 1 : 2;
    const url = MC.safeUrl(w.url) || (viaTV ? viaTV.url : mine ? MC.serviceLink(svc, rec.title).url : '');
    return { name, svc, w, kind, tag: MC.WATCH_TAG[kind], cost, per, priceText, note, tier, url, free: ZERO.has(kind) };
  }).filter(o => { const k = `${o.name}|${o.kind}`.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => a.tier - b.tier || (a.cost?.n ?? 1e9) - (b.cost?.n ?? 1e9) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
};
const kindCls = o => o.free ? 'free' : o.kind === 'trial' || o.kind === 'tv' ? 'trial' : 'paid';
/* The card's chip: just the cheapest way. */
MC.cheapestChip = rec => {
  const o = MC.watchPaths(rec)[0];
  if (!o) return '';
  return `<span class="cine-badge watch-chip ${kindCls(o)}" title="Cheapest way: ${MC.esc(o.priceText)} · ${MC.esc(o.name)}${o.note ? ` (${MC.esc(o.note)})` : ''}">${MC.siteIcon(o.svc?.url || o.url)}<b>${MC.esc(o.priceText)}</b> · ${MC.esc(o.name)}</span>`;
};

MC.whereBlock = (rec, { compact = false } = {}) => {
  const paths = MC.watchPaths(rec);
  const legacy = typeof rec.where === 'string' && rec.where.trim() ? rec.where.trim() : '';
  const verb = { books: 'read', music: 'listen', movies: 'watch', tv: 'watch', games: 'play', streaming: 'sign up', social: 'follow' }[rec.type] || 'get it';
  const relevantSubs = MC.mySubs().filter(sv => sv.types.includes(rec.type));
  const link = (o, cls, inner) => o.url ? `<a class="${cls}" href="${MC.esc(o.url)}" target="_blank" rel="noopener">${inner}</a>` : `<div class="${cls}">${inner}</div>`;
  let band = '';
  if (paths.length) {
    const top = paths[0], rest = paths.slice(1, compact ? 5 : 12);
    band = `<div class="w-band">
      <div class="where-label">Cheapest way to ${verb}</div>
      ${link(top, `w-cheapest ${kindCls(top)}`, `<span class="w-price">${MC.esc(top.priceText)}</span>
        ${MC.logoTile({ name: top.w.name, svc: top.svc, url: top.url, size: 'sm' })}
        <span class="w-svc">${MC.esc(top.name)}<i>${MC.esc(top.note || MC.WATCH_TAG[top.kind])}</i></span>
        ${top.url ? '<span class="w-go">↗</span>' : ''}`)}
      ${!paths.some(o => o.kind === 'yours') && relevantSubs.length ? `<div class="where-subs">Not on your subscriptions</div>` : ''}
      ${rest.length ? `<div class="w-opts">${rest.map(o => link(o, `w-opt ${kindCls(o)}`, `${MC.logoTile({ name: o.w.name, svc: o.svc, url: o.url, size: 'xs' })}
        <span class="w-oname">${MC.esc(o.name)}${o.note ? `<i>${MC.esc(o.note)}</i>` : ''}</span>
        <em class="w-kind">${MC.esc(o.tag)}</em><span class="w-oprice">${MC.esc(o.priceText)}</span>`)).join('')}</div>` : ''}
    </div>`;
  } else if (relevantSubs.length) {
    band = `<div class="where-subs">Check your subscriptions</div><div class="offer-row">${relevantSubs.slice(0, 8).map(sv => {
      const l = MC.serviceLink(sv, rec.title);
      return `<a class="offer check" href="${MC.esc(l.url)}" target="_blank" rel="noopener" title="${MC.esc(l.label)}">${MC.logoTile({ svc: sv })}<span class="offer-name">${MC.esc(sv.name)}</span><span class="offer-label">Check ↗</span></a>`;
    }).join('')}</div>`;
  }
  const finds = MC.findLinks(rec.type, rec.title, rec.creator).slice(0, compact ? 3 : 5)
    .map(([n, u]) => `<a href="${MC.esc(u)}" target="_blank" rel="noopener">${MC.siteIcon(u)}${MC.esc(n)}</a>`).join('');
  return `<div class="where">
    ${band}
    ${legacy ? `<div class="where-list"><span class="where-chip">${MC.esc(legacy)}</span></div>` : ''}
    ${finds ? `<div class="where-find"><span class="muted">${paths.length || legacy || relevantSubs.length ? 'Also search:' : `Find where to ${verb}:`}</span>${finds}</div>` : ''}
  </div>`;
};
MC.whereText = where => Array.isArray(where) ? where.map(w => w.name + (MC.ACCESS_LABEL[w.access] ? ` (${MC.ACCESS_LABEL[w.access]})` : '')).join(', ') : (where || '');

/* ---------- cinematic 16:9 cards ----------
   One card for everything: library items, picks, drops. The artwork fills the card; text sits on a dark fade at the left.
   The short "where" badge shows your subscription first. Click a pick or drop for the full details. */
const subBadge = rec => MC.cheapestChip(rec);   // every card shows the cheapest way to get it
/* Visual media (films and TV) get a "How to watch" button on every card, except the big card at the top of a details popup,
   which already lists where to watch. */
MC.WATCHABLE = new Set(['movies', 'tv']);
MC.watchCache = {};
MC.cineCard = ({ rec, attrs = '', cls = '', kindExtra = '', sub = '', why = '', badges = '', actions = '', play = null }) => {
  const t = MC.TYPE[rec.type] || MC.TYPE.movies;
  const pid = play && MC.canPlay(rec) ? MC.registerPlay({ rec, ...play }) : '';
  if (MC.WATCHABLE.has(rec.type) && !/\bhero\b/.test(cls)) {
    const wid = 'w' + MC.uid(); MC.watchCache[wid] = rec;
    actions = `<button class="btn sm watch-btn" data-action="how-to-watch" data-wid="${wid}" title="Where you can watch it: your subscriptions, free, rent, buy…">📺 How to watch</button>${actions}`;
  }
  return `<article class="cine ${cls}" ${MC.typeStyle(rec.type)} ${attrs}${pid ? ` data-pid="${pid}"` : ''}>
    ${MC.thumb(rec, 'fill')}
    <div class="cine-shade" aria-hidden="true"></div>
    ${pid ? `<button class="cine-play" data-action="play" data-pid="${pid}" aria-label="Play ${MC.esc(MC.PLAY_WORD[rec.type] || 'clip')}: ${MC.esc(rec.title)}" title="Play ${MC.esc(MC.PLAY_WORD[rec.type] || 'clip')}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg></button>` : ''}
    <div class="cine-body">
      <div class="cine-kind">${t.icon} ${MC.esc(t.label)}${kindExtra}</div>
      <h3 class="cine-title">${MC.esc(rec.title)}</h3>
      ${sub ? `<div class="cine-sub">${MC.esc(sub)}</div>` : ''}
      ${why ? `<p class="cine-why">${MC.esc(why)}</p>` : ''}
      ${badges.trim() ? `<div class="cine-badges">${badges}</div>` : ''}
      ${actions.trim() ? `<div class="cine-actions">${actions}</div>` : ''}
    </div>
  </article>`;
};

MC.itemCard = item => {
  const upcoming = item.releaseDate && item.releaseDate >= MC.today();
  return MC.cineCard({
    rec: item, cls: 'clickable', attrs: `data-action="edit-item" data-id="${item.id}" tabindex="0"`, play: { kind: 'item', id: item.id },
    sub: [item.creator, item.year].filter(Boolean).join(' · '),
    kindExtra: upcoming ? ` · 📅 ${MC.esc(MC.fmtDate(item.releaseDate, { month: 'short', day: 'numeric' }))}` : '',
    why: item.notes,
    badges: `${MC.statusPill(item)} ${MC.stars(item.rating)} ${subBadge(item)}`,
  });
};

const recButtons = (rec, id) => {
  const t = MC.TYPE[rec.type];
  const inLib = MC.findInLibrary(rec.title, rec.type);
  const upcoming = rec.release_date && rec.release_date >= MC.today();
  return `${inLib ? `<span class="pill ok">In your library</span>` : `
      <button class="btn sm primary" data-action="rec-want" data-rec="${id}">+ ${MC.esc(t.status.want)}</button>
      <button class="btn sm" data-action="rec-have" data-rec="${id}">${rec.type === 'streaming' || rec.type === 'social' ? 'I use this' : 'Already did'}</button>`}
    ${upcoming ? `<button class="btn sm" data-action="rec-drop" data-rec="${id}">📅 Track</button>` : ''}
    ${inLib ? '' : `<button class="btn sm ghost" data-action="rec-dismiss" data-rec="${id}" title="Not for me" aria-label="Not for me">✕</button>`}`;
};
MC.recCard = rec => {
  const id = rec.id || (rec.id = MC.uid());
  MC.recCache[id] = rec;
  const upcoming = rec.release_date && rec.release_date >= MC.today();
  return MC.cineCard({
    rec, cls: 'clickable', attrs: `data-action="rec-details" data-rec="${id}" tabindex="0"`, play: { kind: 'rec', recId: id },
    sub: [rec.creator, rec.year].filter(Boolean).join(' · '),
    kindExtra: upcoming ? ` · 📅 Out ${MC.esc(MC.fmtDate(rec.release_date, { month: 'short', day: 'numeric' }))}` : '',
    why: rec.why || rec.blurb,
    badges: subBadge(rec),
    actions: recButtons(rec, id),
  });
};

/* Drops and dated releases (Calendar, Home "Coming up", Calendar Ask results). opts.actions replaces the default buttons. */
MC.detailCache = {};
const evButtons = ev => {
  const link = MC.safeUrl(ev.link);
  return `${ev.kind === 'library' ? `<button class="btn sm" data-action="edit-item" data-id="${ev.itemId}">Edit item</button>`
      : ev.id && MC.state.drops.some(d => d.id === ev.id) ? `<button class="btn sm" data-action="edit-drop" data-id="${ev.id}">Edit</button>` : ''}
    ${ev.kind !== 'library' && ev.id && !MC.findInLibrary(ev.title, ev.type) && MC.state.drops.some(d => d.id === ev.id) ? `<button class="btn sm ghost" data-action="drop-to-library" data-id="${ev.id}">+ Library</button>` : ''}
    ${link ? `<a class="btn sm ghost" href="${MC.esc(link)}" target="_blank" rel="noopener">Source ↗</a>` : ''}`;
};
MC.eventCard = (ev, { showDate = false, actions } = {}) => {
  const did = 'd' + MC.uid();
  const buttons = actions ?? evButtons(ev);
  MC.detailCache[did] = { ev, actions: buttons };
  const est = ev.dateConfidence === 'estimated';
  return MC.cineCard({
    rec: ev, cls: `clickable${est ? ' est' : ''}`, attrs: `data-action="ev-details" data-did="${did}" tabindex="0"`, play: { kind: 'event', did },
    sub: [ev.creator, showDate ? MC.fmtDate(ev.date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : ''].filter(Boolean).join(' · '),
    kindExtra: ` · <span class="cine-when">${MC.esc(MC.countdownLabel(ev.date))}</span>`,
    why: ev.notes,
    badges: `${est ? '<span class="pill warn">estimated date</span>' : ''}${subBadge(ev)}`,
    actions: buttons,
  });
};
MC.eventRow = ev => MC.eventCard(ev, { showDate: true });

/* Full details in a popup: big 16:9 artwork, why, reasons, every place to get it, and the same buttons. */
MC.openDetails = (rec, { actions = '', date = '' } = {}) => {
  const t = MC.TYPE[rec.type] || MC.TYPE.movies;
  const reasons = rec.reasons?.length ? `<div class="reason">Because: ${rec.reasons.map(r => `<b>${MC.esc(r)}</b>`).join(', ')}</div>` : '';
  MC.openModal(`
    ${MC.cineCard({ rec, cls: 'hero', sub: [rec.creator, rec.year].filter(Boolean).join(' · '), play: { kind: 'detail' } })}
    <button class="btn icon-btn details-close" data-close aria-label="Close">✕</button>
    <div class="modal-body details-body">
      ${date ? `<div class="ev-when">📅 ${MC.esc(MC.fmtDate(date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }))} <span class="countdown">${MC.esc(MC.countdownLabel(date))}</span>${rec.dateConfidence === 'estimated' ? ' <span class="pill warn">estimated date</span>' : ''}</div>` : ''}
      ${rec.why || rec.blurb || rec.notes ? `<p class="item-why">${MC.esc(rec.why || rec.blurb || rec.notes)}</p>` : ''}
      ${reasons}
      ${MC.whereBlock(rec)}
      ${actions.trim() ? `<div class="item-actions">${actions}</div>` : ''}
    </div>`, m => {
    m.classList.add('details');
    m.querySelectorAll('[data-close]').forEach(b => b.onclick = MC.closeModal);
    // A button here acts, then the popup closes (before any editor it opens).
    m.addEventListener('click', e => { if (e.target.closest('.item-actions [data-action]')) MC.closeModal(); });
  });
};
/* ---------- How to watch: every option for one film or show ----------
   Shows what's known (Claude's where-to-watch list, your subscriptions to check, search links) and can ask Claude to look up
   live options for your country. The answer is saved on the library item, drop or pick, so the card's badge shows it too. */
const WATCH_LEGEND = 'Ranked cheapest first. <b>YOURS</b> on a service you pay for · <b>FREE</b> free, often with ads · <b>LIBRARY</b> free with a library card (Kanopy, Hoopla) · <b>TRIAL</b> free trial for new members · <b>ON TV</b> broadcast, cable or satellite (YOURS when you tick your TV provider in Settings) · <b>SUBS</b> needs a subscription · <b>ADD-ON</b> paid channel inside another service · <b>RENT / BUY</b> pay for this title · <b>CINEMAS</b> in theaters. Prices are approximate: check before you pay.';
MC.saveWhere = (rec, r) => {
  const apply = o => { if (o) Object.assign(o, { where: r.where, watchSummary: r.summary, whereAt: r.at }); };
  apply(rec);
  MC.update(s => {
    const id = rec.itemId || rec.id;
    apply(s.library.find(i => i.id === id));
    apply(s.drops.find(d => d.id === rec.id));
    s.asks.forEach(a => apply(a.items.find(i => i.id === rec.id)));
    apply(s.library.find(i => i.type === rec.type && MC.titleKey(i.title) === MC.titleKey(rec.title)));   // your library copy too
  });
};
MC.openHowToWatch = rec => {
  const st = { loading: false, error: '', started: 0, status: '' };
  const clock = () => { const t = Math.floor((Date.now() - st.started) / 1000); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
  const body = () => {
    const when = rec.whereAt ? MC.fmtDate(rec.whereAt.slice(0, 10), { month: 'short', day: 'numeric' }) : '';
    const check = !MC.hasKey() ? `<p class="small muted">Add a Claude API key in <a href="#/settings" data-close>Settings</a> to look up live options for ${MC.esc(MC.region())}.</p>`
      : st.loading ? `<div class="status-line"><div class="spinner"></div><span data-watch-status>${MC.esc(st.status || 'Checking…')}</span><span class="aibar-clock" data-watch-clock>${clock()}</span></div>`
      : `<button class="btn ${rec.whereAt ? '' : 'primary'}" data-watch-check>${rec.whereAt ? '↻ Check again with Claude' : `✨ Check with Claude for ${MC.esc(MC.region())}`}</button>`;
    return `${st.error ? `<div class="notice error">${MC.esc(st.error)}</div>` : ''}
      ${rec.watchSummary ? `<p class="watch-summary">${MC.esc(rec.watchSummary)}</p><p class="small muted">Checked by Claude${when ? ` on ${MC.esc(when)}` : ''}. Catalogs change, so check before you pay.</p>` : ''}
      ${MC.whereBlock(rec)}
      <p class="small muted watch-legend">${WATCH_LEGEND}</p>
      <div class="watch-check">${check}</div>`;
  };
  const t = MC.TYPE[rec.type];
  MC.openModal(`
    <div class="modal-head"><div><h2>📺 How to watch</h2><p class="muted small">${MC.esc(rec.title)}${rec.year ? ` (${MC.esc(rec.year)})` : ''} · ${MC.esc(t?.label || '')} · ${MC.esc(MC.region())}</p></div>
      <button class="btn icon-btn" data-close aria-label="Close">✕</button></div>
    <div class="modal-body how-to-watch" data-watch-body>${body()}</div>`, m => {
    m.classList.add('watch-modal');
    const box = m.querySelector('[data-watch-body]');
    const draw = () => { if (box.isConnected) box.innerHTML = body(); };
    m.addEventListener('click', async e => {
      if (e.target.closest('[data-close]')) { MC.closeModal(); return; }
      if (!e.target.closest('[data-watch-check]') || st.loading) return;
      Object.assign(st, { loading: true, error: '', started: Date.now(), status: 'Connecting to Claude…' }); draw();
      const tick = setInterval(() => { const c = box.querySelector('[data-watch-clock]'); if (c) c.textContent = clock(); }, 1000);
      try {
        const r = await MC.aiWhereToWatch(rec, { onStatus: msg => { st.status = msg; const el = box.querySelector('[data-watch-status]'); if (el) el.textContent = msg; } });
        MC.saveWhere(rec, r);
      } catch (err) { st.error = err.message || String(err); }
      clearInterval(tick); st.loading = false; draw();
    });
  });
};
MC.actions['how-to-watch'] = el => { const rec = MC.watchCache[el.dataset.wid]; if (rec) MC.openHowToWatch(rec); };

MC.actions['rec-details'] = el => {
  const rec = MC.recCache[el.dataset.rec]; if (!rec) return;
  MC.openDetails(rec, { actions: recButtons(rec, el.dataset.rec), date: rec.release_date && rec.release_date >= MC.today() ? rec.release_date : '' });
};
MC.actions['ev-details'] = el => {
  const d = MC.detailCache[el.dataset.did]; if (!d) return;
  MC.openDetails(d.ev, { actions: d.actions, date: d.ev.date });
};



/* ---------- trailers: Netflix-style hover preview + full player ----------
   Hover a card (mouse) and after a moment it grows into a preview: the trailer plays muted, with ▶ ＋ 👍 ⌄ controls,
   a "Watch on <your service>" button when it's on your subscriptions, and its tags. ▶ (on the card, the preview or the
   details popup) opens the full player with sound. On touch screens the ▶ button on each card opens the player. */
MC.PLAY_WORD = { movies: 'trailer', tv: 'trailer', games: 'trailer', music: 'preview', books: 'sample', streaming: 'clip', social: 'clip' };
const SEARCH_WORD = { movies: 'official trailer', tv: 'official trailer', games: 'official trailer', music: 'official video', books: 'book trailer', streaming: '', social: '' };
const WATCH_VERB = { movies: 'Watch', tv: 'Watch', music: 'Listen', books: 'Read', games: 'Play', streaming: 'Open', social: 'Open' };
MC.canPlay = rec => !!(MC.TYPE[rec.type] && (!['streaming', 'social'].includes(rec.type) || MC.safeUrl(rec.trailer)));
MC.playCache = {};
MC.registerPlay = d => { const pid = 'p' + MC.uid(); MC.playCache[pid] = d; return pid; };
const ytSearchUrl = rec => `https://www.youtube.com/results?search_query=${enc([rec.title, rec.creator, SEARCH_WORD[rec.type]].filter(Boolean).join(' '))}`;
/* The first of your subscriptions that includes it, with a link (e.g. a Netflix search for the title). */
MC.watchOn = rec => {
  for (const w of Array.isArray(rec.where) ? rec.where : []) {
    const svc = MC.matchService(w.name);
    if (svc && MC.hasSub(svc.id) && INCLUDED.has(w.access)) return { svc, url: MC.safeUrl(w.url) || MC.serviceLink(svc, rec.title).url, verb: WATCH_VERB[rec.type] || 'Open' };
    const tv = MC.myTV();   // a cable channel, with your TV provider
    if (tv && !svc && (w.access === 'cable' || (w.access === 'broadcast' && !OTA_RE.test(w.name.trim())))) return { svc: tv, url: MC.safeUrl(w.url) || tv.url, verb: WATCH_VERB[rec.type] || 'Open' };
  }
  return null;
};
const detailsAttrs = d => d.kind === 'rec' ? `data-action="rec-details" data-rec="${d.recId}"`
  : d.kind === 'item' ? `data-action="edit-item" data-id="${d.id}"`
  : d.kind === 'event' ? `data-action="ev-details" data-did="${d.did}"` : '';
const tagsLine = rec => [...(rec.tags || []), ...(rec.genres || []), ...(rec.moods || [])]
  .filter((v, i, a) => a.indexOf(v) === i).slice(0, 3).map(k => MC.labelForAnyTag ? MC.labelForAnyTag(k) : k).filter(Boolean);

const ytWatch = id => `https://www.youtube.com/watch?v=${id}`;
const mediaHtml = (clip, { muted }) => {
  if (!clip || clip.blocked) return '';
  if (clip.kind === 'youtube' || clip.kind === 'vimeo')
    return `<iframe class="clip" ${clip.kind === 'youtube' ? `data-yt="${MC.esc(clip.id)}"` : ''} src="${MC.esc(MC.clipEmbed(clip, { muted }))}" title="Trailer" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen onload="MC.ytListen(this)"></iframe>`;
  if (clip.kind === 'video') return `<video class="clip" src="${MC.esc(clip.url)}" ${muted ? 'muted loop' : 'controls'} autoplay playsinline></video>`;
  return '';
};

/* YouTube tells an embedding page (enablejsapi) when a video can't play there, e.g. the studio blocks embedding. */
MC.ytListen = f => { if (f.dataset.yt) try { f.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: f.dataset.yt, channel: 'widget' }), 'https://www.youtube.com'); } catch { /* ignore */ } };
window.addEventListener('message', e => {
  if (e.origin !== 'https://www.youtube.com') return;
  let d; try { d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch { return; }
  if (d?.event !== 'onError') return;
  const f = [...document.querySelectorAll('iframe.clip[data-yt]')].find(x => x.contentWindow === e.source);
  if (!f) return;
  const id = f.dataset.yt;
  MC.clipBlocked(id);
  const stage = f.parentElement;
  f.remove();
  const link = `<a href="${MC.esc(ytWatch(id))}" target="_blank" rel="noopener">`;
  if (stage.classList.contains('pv-media')) {
    stage.querySelector('.pv-mute')?.remove();
    stage.insertAdjacentHTML('beforeend', `<div class="pv-status">${link}Plays on YouTube only · Watch ↗</a></div>`);
  } else if (player?.clip?.id === id) {
    const alts = player.clip.alts || [];
    const next = alts.find(a => !a.blocked && a.kind !== 'link');
    showClip(next ? { ...next, alts: [...alts.filter(a => a !== next), { ...player.clip, blocked: true, alts: undefined }] } : { ...player.clip, blocked: true });
  } else {
    const src = document.querySelector('[data-player-src]'); if (src) src.textContent = 'Trailer found on YouTube (plays there only)';
    stage.insertAdjacentHTML('beforeend', `<div class="player-msg none"><div><b>The owner only allows this trailer to play on YouTube.</b></div>
    <div class="row" style="justify-content:center"><a class="btn primary" href="${MC.esc(ytWatch(id))}" target="_blank" rel="noopener">▶ Watch on YouTube ↗</a></div></div>`);
  }
});

/* -- hover preview -- */
const canHover = matchMedia('(hover: hover) and (pointer: fine)');
let pv = null, hoverT = 0, leaveT = 0;
MC.closePreview = () => { clearTimeout(hoverT); clearTimeout(leaveT); if (pv) { pv.el.remove(); pv = null; } };
const openPreview = card => {
  const d = MC.playCache[card.dataset.pid];
  if (!d || !card.isConnected) return;
  MC.closePreview();
  const rec = d.rec, t = MC.TYPE[rec.type];
  const r = card.getBoundingClientRect();
  const w = Math.min(Math.max(r.width * 1.32, 380), 560, innerWidth - 24);
  const left = Math.min(Math.max(r.left + r.width / 2 - w / 2, 12), innerWidth - w - 12);
  const estH = w * 9 / 16 + 140;
  const top = Math.min(Math.max(r.top + r.height / 2 - (w * 9 / 16) / 2 - 10, 8), innerHeight - estH - 8);
  const watch = MC.watchOn(rec);
  const inLib = MC.findInLibrary(rec.title, rec.type);
  const add = d.kind === 'rec' ? (inLib ? '' : `<button class="pv-btn" data-action="rec-want" data-rec="${d.recId}" title="Add to ${MC.esc(t.status.want)}" aria-label="Add to ${MC.esc(t.status.want)}">＋</button>`)
    : d.kind === 'event' && !inLib && d.rec.id && MC.state.drops.some(x => x.id === d.rec.id) ? `<button class="pv-btn" data-action="drop-to-library" data-id="${d.rec.id}" title="Add to library" aria-label="Add to library">＋</button>` : '';
  const like = d.kind === 'rec' && !inLib ? `<button class="pv-btn" data-action="rec-have" data-rec="${d.recId}" title="${rec.type === 'streaming' || rec.type === 'social' ? 'I use this' : 'Already did (rate it)'}" aria-label="Already did">👍</button>` : '';
  const meta = [t.icon + ' ' + t.label, rec.year, d.kind === 'event' ? MC.countdownLabel(rec.date) : '', d.kind === 'item' ? t.status[rec.status] : ''].filter(Boolean);
  const tags = tagsLine(rec);
  const el = document.createElement('div');
  el.className = 'preview';
  el.style.cssText = `left:${left}px;top:${top}px;width:${w}px;--type:${t.color}`;
  el.innerHTML = `
    <div class="pv-media">${MC.thumb(rec, 'fill')}<div class="pv-status"><div class="spinner"></div></div></div>
    <div class="pv-info">
      <div class="pv-controls">
        <button class="pv-btn play" data-action="play" data-pid="${card.dataset.pid}" title="Play ${MC.PLAY_WORD[rec.type]}" aria-label="Play ${MC.PLAY_WORD[rec.type]}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg></button>
        ${add}${like}
        ${watch ? `<a class="btn sm primary pv-watch" href="${MC.esc(watch.url)}" target="_blank" rel="noopener">${MC.siteIcon(watch.svc.url)}${watch.verb} on ${MC.esc(watch.svc.name)} ↗</a>` : ''}
        <span class="grow"></span>
        ${detailsAttrs(d) ? `<button class="pv-btn" ${detailsAttrs(d)} title="More info" aria-label="More info"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>` : ''}
      </div>
      <div class="pv-title">${MC.esc(rec.title)}</div>
      <div class="pv-meta">${meta.map(m => `<span>${MC.esc(m)}</span>`).join('')}${rec.dateConfidence === 'estimated' ? '<span class="pill warn">est.</span>' : ''}</div>
      ${tags.length ? `<div class="pv-tags">${tags.map(x => `<span>${MC.esc(x)}</span>`).join('')}</div>` : ''}
    </div>`;
  el.addEventListener('mouseenter', () => clearTimeout(leaveT));
  el.addEventListener('mouseleave', () => { leaveT = setTimeout(MC.closePreview, 160); });
  el.addEventListener('click', e => { if (e.target.closest('[data-action], a')) setTimeout(MC.closePreview, 0); });
  document.body.appendChild(el);
  pv = { el, card };
  MC.findClip(rec).then(clip => {
    if (pv?.el !== el) return;
    const media = el.querySelector('.pv-media'), status = el.querySelector('.pv-status');
    const html = mediaHtml(clip, { muted: true });
    if (html) {
      media.insertAdjacentHTML('beforeend', html + `<button class="pv-mute" aria-label="Turn sound on" title="Sound on">🔇</button>`);
      status.remove();
      media.querySelector('.pv-mute').onclick = () => {
        const v = media.querySelector('video'); const f = media.querySelector('iframe');
        if (v) v.muted = !v.muted;
        else if (f) f.src = MC.clipEmbed(clip, { muted: false });
        media.querySelector('.pv-mute').remove();
      };
    } else status.innerHTML = clip?.kind === 'audio' ? '<span>♪ Preview: press ▶</span>'
      : clip?.blocked ? `<a href="${MC.esc(ytWatch(clip.id))}" target="_blank" rel="noopener">Plays on YouTube only · Watch ↗</a>`
      : `<a href="${MC.esc(ytSearchUrl(rec))}" target="_blank" rel="noopener">No ${MC.esc(MC.PLAY_WORD[rec.type])} found · YouTube ↗</a>`;
  });
};
document.addEventListener('mouseover', e => {
  if (!canHover.matches) return;
  if (pv && pv.el.contains(e.target)) { clearTimeout(leaveT); return; }
  const card = e.target.closest?.('.cine[data-pid]');
  if (card && card.closest('.modal')) return;
  if (card && pv && card === pv.card) { clearTimeout(leaveT); return; }
  clearTimeout(hoverT);
  if (pv) leaveT = setTimeout(MC.closePreview, 160);
  if (card) hoverT = setTimeout(() => openPreview(card), 650);
});
document.addEventListener('mouseout', e => { if (!e.relatedTarget) { clearTimeout(hoverT); if (pv) leaveT = setTimeout(MC.closePreview, 160); } });
window.addEventListener('scroll', () => { if (pv) MC.closePreview(); else clearTimeout(hoverT); }, { passive: true });
window.addEventListener('blur', () => MC.closePreview());

/* -- full player (with sound) -- */
MC.openPlayer = async d => {
  if (!d) return;
  MC.closePreview();
  const rec = d.rec, t = MC.TYPE[rec.type] || MC.TYPE.movies;
  const token = MC.uid();
  const watch = MC.watchOn(rec);
  const yt = ytSearchUrl(rec);
  MC.openModal(`
    <div class="player-stage" data-player="${token}">${MC.thumb(rec, 'fill')}<div class="player-msg"><div class="spinner"></div><span>Finding a ${MC.esc(MC.PLAY_WORD[rec.type])}…</span></div></div>
    <button class="btn icon-btn details-close" data-close aria-label="Close">✕</button>
    <div class="modal-body player-body">
      <div class="item-kind" ${MC.typeStyle(rec.type)}>${t.icon} ${MC.esc(t.label)}${rec.year ? ` · ${MC.esc(rec.year)}` : ''}${rec.date ? ` · ${MC.esc(MC.fmtDate(rec.date))}` : ''}</div>
      <h2>${MC.esc(rec.title)}</h2>
      ${rec.creator ? `<div class="item-sub">${MC.esc(rec.creator)}</div>` : ''}
      <div class="tiny muted" data-player-src></div>
      ${rec.why || rec.blurb || rec.notes ? `<p class="item-why">${MC.esc(rec.why || rec.blurb || rec.notes)}</p>` : ''}
      <div class="item-actions">
        ${watch ? `<a class="btn primary" href="${MC.esc(watch.url)}" target="_blank" rel="noopener">${MC.siteIcon(watch.svc.url)}${watch.verb} on ${MC.esc(watch.svc.name)} ↗</a>` : ''}
        <a class="btn" href="${MC.esc(yt)}" target="_blank" rel="noopener">More on YouTube ↗</a>
        ${detailsAttrs(d) ? `<button class="btn ghost" ${detailsAttrs(d)}>${d.kind === 'item' ? 'Edit' : 'Details'}</button>` : ''}
      </div>
    </div>`, m => {
    m.classList.add('player');
    m.querySelectorAll('[data-close]').forEach(b => b.onclick = MC.closeModal);
    m.addEventListener('click', e => { if (e.target.closest('.item-actions [data-action]')) MC.closeModal(); });
  });
  const clip = await MC.findClip(rec);
  if (!document.querySelector(`[data-player="${token}"]`)) return;   // closed meanwhile
  player = { token, rec, d, yt };
  showClip(clip);
};
/* The open player: what's on stage, and the backups to fall back to. */
let player = null;
const altLabel = c => c.label || (c.kind === 'youtube' ? (c.title || 'YouTube video') : c.src || 'Clip');
const showClip = (clip, note = '') => {
  if (!player) return;
  const { token, rec, d, yt } = player;
  const stage = document.querySelector(`[data-player="${token}"]`), src = document.querySelector('[data-player-src]');
  if (!stage) return;
  player.clip = clip;
  const alts = (clip?.alts || []).filter(a => !a.blocked || a.kind === 'youtube');
  const altBtns = alts.length ? `<div class="player-alts"><span class="tiny muted">Backups:</span>${alts.map((a, i) => a.kind === 'link'
    ? `<a class="btn sm" href="${MC.esc(a.url)}" target="_blank" rel="noopener">${MC.esc(altLabel(a))} ↗</a>`
    : `<button class="btn sm" data-alt="${i}">▶ ${MC.esc(altLabel(a))}</button>`).join('')}</div>` : '';
  const html = clip && !clip.blocked ? mediaHtml(clip, { muted: false }) : '';
  const claudeBtn = MC.hasKey() ? `<button class="btn${clip ? '' : ' primary'}" data-find-claude>✨ Find with Claude</button>` : '';
  if (html) stage.innerHTML = html;
  else if (clip?.kind === 'audio') stage.innerHTML = `${MC.thumb(rec, 'fill')}<audio class="clip-audio" src="${MC.esc(clip.url)}" controls autoplay></audio>`;
  else if (clip?.blocked) stage.innerHTML = `${MC.thumb(rec, 'fill')}<div class="player-msg none"><div><b>The owner only allows this ${MC.esc(MC.PLAY_WORD[rec.type])} to play on YouTube.</b></div>
      <div class="row" style="justify-content:center"><a class="btn primary" href="${MC.esc(ytWatch(clip.id))}" target="_blank" rel="noopener">▶ Watch on YouTube ↗</a>${claudeBtn}</div></div>`;
  else stage.innerHTML = `${MC.thumb(rec, 'fill')}<div class="player-msg none">
      <div><b>${note ? MC.esc(note) : `No ${MC.esc(MC.PLAY_WORD[rec.type])} found for this title yet.`}</b></div>
      <div class="row" style="justify-content:center">
        ${clip?.kind === 'link' ? `<a class="btn primary" href="${MC.esc(clip.url)}" target="_blank" rel="noopener">Open the ${MC.esc(MC.PLAY_WORD[rec.type])} ↗</a>` : ''}
        ${note ? '' : claudeBtn}
        <a class="btn ${clip?.kind === 'link' || MC.hasKey() ? '' : 'primary'}" href="${MC.esc(yt)}" target="_blank" rel="noopener">Search YouTube ↗</a>
        ${d.kind === 'item' ? `<button class="btn" data-action="edit-item" data-id="${d.id}">Add a trailer link</button>` : ''}
      </div></div>`;
  if (src) src.innerHTML = clip ? `${clip.kind === 'youtube'
      ? `${clip.title ? `<b>${MC.esc(clip.title)}</b>${clip.author ? ` · ${MC.esc(clip.author)}` : ''} · ` : ''}${MC.esc(clip.src)} · <a href="${MC.esc(ytWatch(clip.id))}" target="_blank" rel="noopener">Open in YouTube ↗</a>`
      : `Playing from ${MC.esc(clip.src)}`}${note ? ` · ${MC.esc(note)}` : ''}${altBtns}` : altBtns;
  stage.querySelector('[data-action="edit-item"]')?.addEventListener('click', () => MC.closeModal(), { capture: true });
  stage.querySelector('[data-find-claude]')?.addEventListener('click', findWithClaude);
  src?.querySelectorAll('[data-alt]').forEach(b => b.onclick = () => {
    const a = alts[+b.dataset.alt], rest = [clip, ...alts].filter(x => x && x !== a).map(x => ({ ...x, alts: undefined }));
    showClip({ ...a, alts: rest });
  });
};
/* Claude searches the web for the trailer; links are checked before they're used, and the working one is saved on the drop or library item. */
const findWithClaude = async () => {
  if (!player) return;
  const { token, rec } = player;
  const stage = document.querySelector(`[data-player="${token}"]`);
  stage.innerHTML = `${MC.thumb(rec, 'fill')}<div class="player-msg"><div class="spinner"></div><span data-claude-status>Asking Claude to find the ${MC.esc(MC.PLAY_WORD[rec.type])}…</span></div>`;
  try {
    const r = await MC.aiFindTrailer(rec, { onStatus: m => { const el = stage.querySelector('[data-claude-status]'); if (el) el.textContent = m; } });
    if (player?.token !== token) return;
    if (r.clip) MC.saveTrailer(rec, r.clip);
    showClip(r.clip, r.clip ? r.note : (r.note || `Claude couldn't find a working ${MC.PLAY_WORD[rec.type]} for this title.`));
  } catch (e) {
    if (player?.token === token) showClip(null, e.message || String(e));
  }
};
/* Remember a working trailer on the drop or library item it belongs to. */
MC.saveTrailer = (rec, clip) => {
  const url = clip.kind === 'youtube' ? ytWatch(clip.id) : clip.kind === 'vimeo' ? `https://vimeo.com/${clip.id}` : clip.url;
  if (!url || clip.kind === 'audio') return false;
  const drop = MC.state.drops.find(x => x.id === rec.id);
  const item = !drop && MC.state.library.find(i => i.id === (rec.itemId || rec.id));
  if (!drop && !item) return false;
  MC.ui.skipRender = !!document.querySelector('.modal.player');
  MC.update(s => { const t = drop ? s.drops.find(x => x.id === drop.id) : s.library.find(i => i.id === item.id); if (t) t.trailer = url; });
  return true;
};
MC.actions.play = el => MC.openPlayer(MC.playCache[el.dataset.pid]);

/* ---------- item editor ---------- */
MC.tagChipsFor = (type, selectedGenres, selectedMoods) => {
  const groups = (MC.TAXONOMY[type] || []).map(g => `
    <div><div class="tiny muted" style="margin-bottom:6px;font-weight:650">${MC.esc(g.label)}</div>
    <div class="chips">${g.options.map(o => `<button type="button" class="chip" data-tag="${o.key}" aria-pressed="${selectedGenres.includes(o.key)}">${MC.esc(o.label)}</button>`).join('')}</div></div>`).join('');
  const moods = `<div><div class="tiny muted" style="margin-bottom:6px;font-weight:650">Mood</div>
    <div class="chips">${MC.MOODS.map(o => `<button type="button" class="chip" data-mood="${o.key}" aria-pressed="${selectedMoods.includes(o.key)}">${MC.esc(o.label)}</button>`).join('')}</div></div>`;
  return groups + moods;
};

MC.openItemEditor = (item, { isNew = false, onSave } = {}) => {
  const it = JSON.parse(JSON.stringify(item));
  const render = () => {
    const t = MC.TYPE[it.type];
    return `
    <div class="modal-head"><div class="item-ic" ${MC.typeStyle(it.type)}>${t.icon}</div><h2>${isNew ? 'Add to library' : 'Edit'}</h2>
      <button class="btn ghost icon-btn" data-close aria-label="Close">✕</button></div>
    <form class="modal-body" data-form>
      <div class="form-grid">
        <label class="field">Type
          <select name="type">${MC.TYPES.map(x => `<option value="${x.key}" ${x.key === it.type ? 'selected' : ''}>${x.icon} ${x.label}</option>`).join('')}</select></label>
        <label class="field">Status
          <select name="status">${MC.STATUSES.map(s => `<option value="${s}" ${s === it.status ? 'selected' : ''}>${MC.esc(t.status[s])}</option>`).join('')}</select></label>
        <label class="field full">Title <input type="text" name="title" required value="${MC.esc(it.title)}" placeholder="Name of the ${MC.esc(t.noun)}"></label>
        <label class="field">${MC.esc(t.creatorLabel)} <input type="text" name="creator" value="${MC.esc(it.creator)}"></label>
        <label class="field">Year <input type="text" name="year" inputmode="numeric" value="${MC.esc(it.year)}"></label>
        <div class="field full">Your rating
          <div class="star-input" data-stars>${[1, 2, 3, 4, 5].map(n => `<button type="button" data-n="${n}" class="${n <= it.rating ? 'on' : ''}" aria-label="${n} stars">★</button>`).join('')}
            <button type="button" class="btn sm ghost" data-n="0" style="font-size:12px;color:var(--muted)">clear</button></div></div>
        <label class="field">${MC.esc(t.placeLabel)} <input type="text" name="place" value="${MC.esc(it.place)}"></label>
        <label class="field">Release date <input type="date" name="releaseDate" value="${MC.esc(it.releaseDate)}"></label>
        <label class="field full">Link <input type="url" name="link" value="${MC.esc(it.link)}" placeholder="https://"></label>
        <div class="field full cover-field"><div data-cover-preview>${MC.thumb(it, 'lg')}</div>
          <label class="field grow">Cover image <input type="url" name="image" value="${MC.esc(it.image || '')}" placeholder="https:// (blank = find it automatically)">
            <span class="tiny muted" style="font-weight:500">Paste an image link to use your own cover, poster or logo.</span></label></div>
        <label class="field full">Trailer or clip <input type="url" name="trailer" value="${MC.esc(it.trailer || '')}" placeholder="https://www.youtube.com/watch?v=… (blank = find one automatically)"></label>
        <div class="field full">Tags <div style="display:grid;gap:12px">${MC.tagChipsFor(it.type, it.genres, it.moods)}</div></div>
        <label class="field full">Notes <textarea name="notes" rows="3">${MC.esc(it.notes)}</textarea></label>
      </div>
    </form>
    <div class="modal-foot">
      ${isNew ? '' : '<button class="btn danger left" data-delete>Delete</button><button class="btn" data-share-item title="Send a link to this title">Share</button>'}
      <button class="btn" data-close>Cancel</button>
      <button class="btn primary" data-save>${isNew ? 'Add' : 'Save'}</button>
    </div>`;
  };
  const readForm = m => {
    const f = m.querySelector('[data-form]');
    ['title', 'creator', 'year', 'place', 'releaseDate', 'link', 'image', 'trailer', 'notes', 'status'].forEach(k => { it[k] = f.elements[k].value.trim(); });
  };
  const mount = m => {
    m.querySelectorAll('[data-close]').forEach(b => b.onclick = MC.closeModal);
    m.querySelector('[name=type]').onchange = e => {
      readForm(m); it.type = e.target.value; it.genres = [];
      m.innerHTML = render(); mount(m);
    };
    const preview = () => { readForm(m); m.querySelector('[data-cover-preview]').innerHTML = MC.thumb(it, 'lg'); };
    ['image', 'title', 'creator'].forEach(n => m.querySelector(`[name=${n}]`).addEventListener('change', preview));
    m.querySelector('[data-stars]').onclick = e => {
      const b = e.target.closest('[data-n]'); if (!b) return;
      it.rating = +b.dataset.n;
      m.querySelectorAll('[data-stars] [data-n]').forEach(x => x.classList.toggle('on', +x.dataset.n > 0 && +x.dataset.n <= it.rating));
    };
    m.querySelectorAll('[data-tag],[data-mood]').forEach(b => b.onclick = () => {
      const list = b.dataset.tag ? it.genres : it.moods; const k = b.dataset.tag || b.dataset.mood;
      const i = list.indexOf(k); if (i >= 0) list.splice(i, 1); else list.push(k);
      b.setAttribute('aria-pressed', i < 0);
    });
    m.querySelector('[data-form]').onsubmit = e => { e.preventDefault(); m.querySelector('[data-save]').click(); };
    m.querySelector('[data-save]').onclick = () => {
      readForm(m);
      if (!it.title) { m.querySelector('[name=title]').focus(); MC.toast('Give it a title first.', 'error'); return; }
      if (isNew && MC.findInLibrary(it.title, it.type)) MC.toast('Heads up: that title was already in your library.');
      MC.saveItem(it); MC.closeModal(); MC.toast(isNew ? `Added “${it.title}”` : 'Saved'); onSave?.(it);
    };
    m.querySelector('[data-share-item]')?.addEventListener('click', () => { readForm(m); MC.share.shareItem(it); });
    m.querySelector('[data-delete]')?.addEventListener('click', async () => {
      const id = it.id, title = it.title;
      if (await MC.confirm('Delete this item?', `“${title}” will be removed from your library.`)) { MC.removeItem(id); MC.toast('Deleted'); }
    });
  };
  MC.openModal(render(), mount);
};

MC.newItem = (fields = {}) => ({
  id: MC.uid(), type: 'books', title: '', creator: '', year: '', status: 'want', rating: 0, genres: [], moods: [],
  place: '', link: '', image: '', trailer: '', notes: '', releaseDate: '', addedAt: new Date().toISOString(), updatedAt: '', source: 'manual', ...fields,
});

/* ---------- drop editor ---------- */
MC.openDropEditor = (drop, isNew = false) => {
  const d = { ...drop };
  MC.openModal(`
    <div class="modal-head"><h2>${isNew ? 'Add a drop' : 'Edit drop'}</h2><button class="btn ghost icon-btn" data-close aria-label="Close">✕</button></div>
    <form class="modal-body" data-form>
      <div class="form-grid">
        <label class="field full">What's coming out? <input type="text" name="title" required value="${MC.esc(d.title)}" placeholder="e.g. a new album, a season premiere"></label>
        <label class="field">Type <select name="type">${MC.TYPES.map(x => `<option value="${x.key}" ${x.key === d.type ? 'selected' : ''}>${x.icon} ${x.label}</option>`).join('')}</select></label>
        <label class="field">Date <input type="date" name="date" required value="${MC.esc(d.date)}"></label>
        <label class="field">Creator <input type="text" name="creator" value="${MC.esc(d.creator)}"></label>
        <label class="field">Date is <select name="dateConfidence"><option value="confirmed" ${d.dateConfidence !== 'estimated' ? 'selected' : ''}>Confirmed</option><option value="estimated" ${d.dateConfidence === 'estimated' ? 'selected' : ''}>An estimate</option></select></label>
        <label class="field full">Link <input type="url" name="link" value="${MC.esc(d.link)}" placeholder="https://"></label>
        <label class="field full">Notes <textarea name="notes" rows="2">${MC.esc(d.notes)}</textarea></label>
      </div>
    </form>
    <div class="modal-foot">
      ${isNew ? '' : '<button class="btn danger left" data-delete>Remove</button>'}
      <button class="btn" data-close>Cancel</button><button class="btn primary" data-save>${isNew ? 'Add to calendar' : 'Save'}</button>
    </div>`, m => {
    m.querySelectorAll('[data-close]').forEach(b => b.onclick = MC.closeModal);
    const f = m.querySelector('[data-form]');
    f.onsubmit = e => { e.preventDefault(); m.querySelector('[data-save]').click(); };
    m.querySelector('[data-save]').onclick = () => {
      ['title', 'type', 'date', 'creator', 'dateConfidence', 'link', 'notes'].forEach(k => { d[k] = f.elements[k].value.trim(); });
      if (!d.title || !d.date) { MC.toast('A title and a date are required.', 'error'); return; }
      if (isNew) MC.addDrop(d); else MC.update(s => { const i = s.drops.findIndex(x => x.id === d.id); if (i >= 0) s.drops[i] = d; });
      MC.closeModal(); MC.toast(isNew ? 'Added to your calendar' : 'Saved');
    };
    m.querySelector('[data-delete]')?.addEventListener('click', () => { MC.removeDrop(d.id); MC.closeModal(); MC.toast('Removed from calendar'); });
  });
};

/* ---------- bulk add ---------- */
MC.openBulkAdd = (type = 'books') => {
  MC.openModal(`
    <div class="modal-head"><h2>Quick add a list</h2><button class="btn ghost icon-btn" data-close aria-label="Close">✕</button></div>
    <div class="modal-body">
      <p class="small muted">One per line. Optionally add the creator after a dash: <code>Dune — Frank Herbert</code></p>
      <div class="form-grid">
        <label class="field">Type <select name="type">${MC.TYPES.map(x => `<option value="${x.key}" ${x.key === type ? 'selected' : ''}>${x.icon} ${x.label}</option>`).join('')}</select></label>
        <label class="field">Status <select name="status"></select></label>
      </div>
      <textarea name="lines" rows="9" placeholder="The Left Hand of Darkness — Ursula K. Le Guin&#10;Hyperion — Dan Simmons"></textarea>
    </div>
    <div class="modal-foot"><button class="btn" data-close>Cancel</button><button class="btn primary" data-save>Add all</button></div>`, m => {
    const typeSel = m.querySelector('[name=type]'), statusSel = m.querySelector('[name=status]');
    const fillStatus = () => { const t = MC.TYPE[typeSel.value]; statusSel.innerHTML = MC.STATUSES.map(s => `<option value="${s}">${MC.esc(t.status[s])}</option>`).join(''); };
    fillStatus(); typeSel.onchange = fillStatus;
    m.querySelectorAll('[data-close]').forEach(b => b.onclick = MC.closeModal);
    m.querySelector('[data-save]').onclick = () => {
      const lines = m.querySelector('[name=lines]').value.split('\n').map(l => l.trim()).filter(Boolean);
      let n = 0;
      MC.update(s => lines.forEach(l => {
        const [title, creator = ''] = l.split(/\s+[—–-]\s+|\t/).map(x => x.trim());
        if (!title || s.library.some(i => i.type === typeSel.value && MC.titleKey(i.title) === MC.titleKey(title))) return;
        s.library.unshift(MC.newItem({ type: typeSel.value, status: statusSel.value, title, creator, updatedAt: new Date().toISOString() }));
        n++;
      }));
      MC.closeModal(); MC.toast(`Added ${n} item${n === 1 ? '' : 's'}`);
    };
  });
};

/* ---------- rec card actions ---------- */
const recToItem = (rec, status) => MC.newItem({
  type: rec.type, title: rec.title, creator: rec.creator || '', year: rec.year || '', status,
  genres: (rec.tags || []).filter(t => (MC.TAXONOMY[rec.type] || []).some(g => g.options.some(o => o.key === t))),
  moods: [...(rec.moods || []), ...(rec.tags || []).filter(t => MC.MOODS.some(o => o.key === t))].filter((v, i, a) => a.indexOf(v) === i),
  place: MC.whereText(rec.where), releaseDate: rec.release_date || '', notes: rec.why || rec.blurb || '', trailer: rec.trailer || '', source: rec.source || 'recommendation',
});
MC.actions['rec-want'] = el => {
  const rec = MC.recCache[el.dataset.rec]; if (!rec) return;
  MC.saveItem(recToItem(rec, 'want')); MC.toast(`Added “${rec.title}” to ${MC.TYPE[rec.type].status.want}`);
};
MC.actions['rec-have'] = el => {
  const rec = MC.recCache[el.dataset.rec]; if (!rec) return;
  const status = rec.type === 'streaming' || rec.type === 'social' ? 'active' : 'done';
  MC.openItemEditor(recToItem(rec, status), { isNew: true });
};
MC.actions['rec-dismiss'] = el => {
  const rec = MC.recCache[el.dataset.rec]; if (!rec) return;
  MC.dismiss(rec.title); MC.toast('Got it — fewer like that.');
};
MC.actions['rec-drop'] = el => {
  const rec = MC.recCache[el.dataset.rec]; if (!rec) return;
  MC.addDrop({ type: rec.type, title: rec.title, creator: rec.creator, date: rec.release_date, notes: rec.why || '', where: Array.isArray(rec.where) ? rec.where : [], trailer: rec.trailer || '', origin: 'recommendation' });
  MC.toast('Added to your calendar');
};
MC.actions['edit-item'] = el => {
  const item = MC.state.library.find(i => i.id === el.dataset.id);
  if (item) MC.openItemEditor(item);
};
MC.actions['edit-drop'] = el => {
  const d = MC.state.drops.find(x => x.id === el.dataset.id);
  if (d) MC.openDropEditor(d);
};
MC.actions['drop-to-library'] = el => {
  const d = MC.state.drops.find(x => x.id === el.dataset.id); if (!d) return;
  MC.saveItem(MC.newItem({ type: d.type, title: d.title, creator: d.creator, status: 'want', releaseDate: d.date, link: d.link, notes: d.notes, trailer: d.trailer || '', source: 'drop' }));
  MC.toast(`Added “${d.title}” to your library`);
};
