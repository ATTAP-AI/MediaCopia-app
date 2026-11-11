/* MediaCopia — artwork.
   Every title gets a thumbnail at once: generated cover art in its media type's colours. It is swapped for the real
   cover, poster, album art or logo once one is found. Lookups use keyless public APIs (Open Library, TVMaze, Wikipedia,
   Apple's iTunes Search, Google's favicon service). Results, including misses, are cached in localStorage, so each
   title is looked up once. Turn lookups off in Settings → Appearance. */
window.MC = window.MC || {};
(() => {
const enc = encodeURIComponent;
const HUE = { books: 32, music: 330, movies: 0, games: 262, tv: 221, streaming: 192, social: 161 };

/* ---------- category art: one line drawing per media type (120×80) ---------- */
const ART = {
  books: '<rect x="20" y="22" width="13" height="44" rx="2"/><rect x="35" y="14" width="12" height="52" rx="2"/><rect x="49" y="26" width="15" height="40" rx="2"/><path d="M66 66 80 18l12 3.6L78 70z"/><path d="M38 24h6M38 30h6M23 32h7M52 34h9"/><path d="M12 68h96"/>',
  music: '<circle cx="54" cy="40" r="28"/><circle cx="54" cy="40" r="19" opacity=".55"/><circle cx="54" cy="40" r="11" opacity=".55"/><circle cx="54" cy="40" r="3"/><path d="M98 10 95 44 78 55"/><circle cx="98" cy="10" r="3"/>',
  movies: '<rect x="26" y="36" width="68" height="34" rx="3"/><path d="m26 36 62-18 3 9-62 18"/><path d="m40 32 7 8M56 28l7 8M72 23l7 8"/><path d="M26 47h68"/>',
  games: '<path d="M38 26h44a16 16 0 0 1 15 11l6 18a8 8 0 0 1-13 8l-10-10H40L30 63a8 8 0 0 1-13-8l6-18a16 16 0 0 1 15-11z"/><path d="M42 36v13M35.5 42.5h13"/><circle cx="76" cy="38" r="2.5"/><circle cx="84" cy="46" r="2.5"/>',
  tv: '<rect x="22" y="22" width="76" height="48" rx="7"/><rect x="29" y="29" width="50" height="34" rx="4"/><path d="M46 8l14 14 16-16"/><circle cx="88" cy="36" r="3"/><circle cx="88" cy="48" r="3"/>',
  streaming: '<circle cx="60" cy="40" r="20"/><path d="m55 31 14 9-14 9z"/><path d="M32 22a32 32 0 0 0 0 36M88 22a32 32 0 0 1 0 36M21 13a46 46 0 0 0 0 54M99 13a46 46 0 0 1 0 54"/>',
  social: '<path d="M20 16h46a7 7 0 0 1 7 7v22a7 7 0 0 1-7 7H38L27 62V52h-7a7 7 0 0 1-7-7V23a7 7 0 0 1 7-7z"/><path d="M80 32h17a7 7 0 0 1 7 7v17a7 7 0 0 1-7 7h-3v9l-10-9H69a7 7 0 0 1-7-7v-1"/><path d="M43 41s-10-6-10-12a5 5 0 0 1 10-1 5 5 0 0 1 10 1c0 6-10 12-10 12z"/>',
};
MC.typeArt = (type, cls = '') => `<svg class="type-art ${cls}" viewBox="0 0 120 80" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ART[type] || ART.streaming}</svg>`;

/* ---------- cache ---------- */
const KEY = 'mediacopia.covers.v2';   // v2: larger images, TV backdrops
const MISS_TTL = 7 * 864e5;   // try again a week after nothing was found
let cache = {};
try { cache = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; localStorage.removeItem('mediacopia.covers.v1'); } catch { cache = {}; }
let saveT;
const persist = () => {
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    const keys = Object.keys(cache);
    if (keys.length > 2500) keys.sort((a, b) => cache[a].t - cache[b].t).slice(0, keys.length - 2000).forEach(k => delete cache[k]);
    try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* full: keep it in memory */ }
  }, 400);
};
const fresh = e => !!e && (!!e.u || Date.now() - e.t < MISS_TTL);
MC.coversOn = () => MC.state.settings.covers !== false;
MC.clearCovers = () => { cache = {}; try { localStorage.removeItem(KEY); } catch { /* ignore */ } };

const fold = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const coverKey = (type, title, creator) => [type, MC.titleKey(fold(title)), MC.titleKey(fold(creator))].join('|');
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

/* Small site/service icon (Google's favicon service). */
MC.favicon = (urlOrHost, sz = 64) => {
  const host = /^https?:/i.test(urlOrHost || '') ? hostOf(urlOrHost) : (urlOrHost || '');
  return host && MC.coversOn() ? `https://www.google.com/s2/favicons?domain=${enc(host)}&sz=${sz}` : '';
};
MC.siteIcon = urlOrHost => {
  const src = MC.favicon(urlOrHost, 32);
  return src ? `<img class="svc-ic" src="${MC.esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : '';
};

/* ---------- the thumbnail ----------
   Every frame is 16:9 ("cinematic"). Wide art fills it. Tall or square art (posters, book covers, album art) is shown whole
   on a blurred, darkened copy of itself, so nothing is cropped. Logos sit on a white tile over the generated art. */
const imgTag = (u, shown) => `<img class="thumb-img${shown ? ' in' : ''}" src="${MC.esc(u)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onload="MC.coverLoaded(this)" onerror="MC.coverFailed(this)">`;
const cssUrl = u => `url("${String(u).replace(/["\\\n]/g, c => encodeURIComponent(c))}")`;
const TALL = 1.3;   // width/height below this → shown as a poster on a blurred backdrop

/* rec/item/drop → thumbnail html. size: xs | sm | md | lg | xl | fill (fills its card). Uses rec.image if set, else the cache, else generated art (and queues a lookup). */
MC.thumb = (rec, size = 'md') => {
  const type = MC.TYPE[rec.type] ? rec.type : 'streaming';
  const t = MC.TYPE[type];
  const title = rec.title || '', creator = rec.creator || '';
  const k = coverKey(type, title, creator);
  const h = hash(k);
  const h1 = (HUE[type] + (h % 46) - 23 + 360) % 360, h2 = (h1 + 20 + ((h >>> 8) % 50)) % 360;
  const own = MC.safeUrl(rec.image);
  const hit = own ? { u: own, f: '' } : (MC.coversOn() ? cache[k] : null);
  const lookup = !own && MC.coversOn() && !fresh(cache[k]);
  const hint = type === 'social' || type === 'streaming'
    ? [rec.place, ...(Array.isArray(rec.where) ? rec.where.map(w => w.name) : [rec.where])].filter(Boolean).join(' ') : '';
  const data = lookup ? ` data-k="${MC.esc(k)}" data-type="${type}" data-title="${MC.esc(title)}" data-creator="${MC.esc(creator)}" data-year="${MC.esc(rec.year || '')}" data-hint="${MC.esc(hint)}"` : '';
  const poster = hit?.u && !hit.f && hit.r && hit.r < TALL;
  const style = `--h1:${h1};--h2:${h2}${poster ? `;--bgimg:${cssUrl(hit.u)}` : ''}`;
  return `<div class="thumb ${size} t-${type}${hit?.u && hit.f ? ' contain' : ''}${poster ? ' poster' : ''}" style="${MC.esc(style)}" data-ck="${own ? '' : MC.esc(k)}"${data} aria-hidden="true">`
    + `<div class="thumb-art">${MC.typeArt(type)}<span class="thumb-ic">${t.icon}</span><span class="thumb-t">${MC.esc(title)}</span></div>`
    + `${hit?.u ? imgTag(hit.u, true) : ''}</div>`;
};
/* A few overlapping thumbnails (history rows, banners). */
MC.thumbStack = (recs, size = 'xs', max = 4) => recs.length
  ? `<div class="thumb-stack ${size}">${recs.slice(0, max).map(r => MC.thumb(r, size)).join('')}</div>` : '';

MC.coverLoaded = img => {
  img.classList.add('in');
  const th = img.closest('.thumb');
  if (!th || th.classList.contains('contain') || !img.naturalWidth) return;
  const r = Math.round(img.naturalWidth / img.naturalHeight * 100) / 100;
  if (r < TALL && !th.classList.contains('poster')) { th.style.setProperty('--bgimg', cssUrl(img.currentSrc || img.src)); th.classList.add('poster'); }
  const k = th.dataset.ck;
  if (k && cache[k]?.u && cache[k].r !== r) { cache[k].r = r; persist(); }   // remember the shape so it renders right first time
};
MC.coverFailed = img => {
  const th = img.closest('.thumb');
  img.remove();
  if (!th) return;
  th.classList.remove('contain');
  const k = th.dataset.ck;
  if (k) { cache[k] = { u: '', f: '', t: Date.now() }; persist(); }
};

/* ---------- lookups ---------- */
const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'in', 'on', 'to', 'for', 'by', 'with', 'season', 'film', 'novel', 'album', 'video', 'game', 'tv', 'series', 'book', 'edition', 'deluxe', 'remastered', 'ep']);
const words = s => fold(s).replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').split(' ').filter(w => (w.length > 1 || /\d/.test(w)) && !STOP.has(w));
/* Loose title match both ways, so "Dune" doesn't pick up "Dune: Part Two". */
const similar = (found, wanted) => {
  const A = words(found), B = words(wanted);
  if (!A.length || !B.length) return false;
  return B.filter(w => A.includes(w)).length / B.length >= 0.6 && A.filter(w => B.includes(w)).length / A.length >= 0.5;
};

const getJSON = async (url, ctx) => {
  const ctl = new AbortController();
  const tm = setTimeout(() => ctl.abort(), 9000);
  try {
    const r = await fetch(url, { signal: ctl.signal, referrerPolicy: 'no-referrer' });
    if (!r.ok) { if (r.status === 429 || r.status >= 500) ctx.err++; return null; }
    return await r.json();
  } catch { ctx.err++; return null; } finally { clearTimeout(tm); }
};

const wiki = async (query, title, ctx, prefer, strict = true) => {
  const d = await getJSON(`https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrsearch=${enc(query)}&gsrlimit=5&prop=pageimages&piprop=thumbnail&pithumbsize=800&pilicense=any`, ctx);
  const pages = Object.values(d?.query?.pages || {}).sort((a, b) => a.index - b.index).filter(p => p.thumbnail && (!strict || similar(p.title, title)));
  const p = (prefer && pages.find(p => prefer.test(p.title))) || pages[0];
  return p?.thumbnail?.source || '';
};

/* Apple's search API allows ~20 calls a minute, so it is spaced out and only used as a fallback. */
let itunesNext = 0, itunesOff = false;
const itunesFind = async (term, media, entity, match, ctx) => {
  if (itunesOff) return null;
  const wait = Math.max(0, itunesNext - Date.now());
  if (wait > 20000) { ctx.err++; return null; }   // too busy now: try again another time
  itunesNext = Date.now() + wait + 3200;
  if (wait) await new Promise(r => setTimeout(r, wait));
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 9000);
  try {
    const r = await fetch(`https://itunes.apple.com/search?term=${enc(term)}&media=${media}&entity=${entity}&limit=5&country=${MC.region().toLowerCase()}`, { signal: ctl.signal, referrerPolicy: 'no-referrer' });
    if (r.status === 403 || r.status === 429) { itunesOff = true; ctx.err++; return null; }
    if (!r.ok) return null;
    return (await r.json()).results?.find(match) || null;
  } catch { ctx.err++; return null; } finally { clearTimeout(tm); }
};
const itunes = async (term, media, entity, match, ctx) => {
  const hit = await itunesFind(term, media, entity, match, ctx);
  const art = hit?.artworkUrl512 || hit?.artworkUrl100 || '';
  return art.replace(/\/\d+x\d+(bb)?\.(jpg|png)$/, '/600x600bb.$2');
};

const PLATFORMS = [
  [/(^|\s)r\/|reddit/i, 'reddit.com'], [/youtube|youtuber/i, 'youtube.com'], [/tiktok|booktok/i, 'tiktok.com'], [/instagram/i, 'instagram.com'],
  [/bluesky|bsky/i, 'bsky.app'], [/twitch/i, 'twitch.tv'], [/discord/i, 'discord.com'], [/substack/i, 'substack.com'], [/patreon/i, 'patreon.com'],
  [/mastodon/i, 'joinmastodon.org'], [/threads/i, 'threads.net'], [/twitter|(^|\s)x(\s|$)|x\.com/i, 'x.com'], [/facebook/i, 'facebook.com'],
  [/linkedin/i, 'linkedin.com'], [/tumblr/i, 'tumblr.com'], [/letterboxd/i, 'letterboxd.com'], [/goodreads/i, 'goodreads.com'], [/podcast/i, 'podcasts.apple.com'],
];
const logo = host => ({ u: MC.favicon(host, 128), f: 'contain' });

const FIND = {
  async books(d, ctx) {
    const ol = await getJSON(`https://openlibrary.org/search.json?title=${enc(d.title)}${d.creator ? `&author=${enc(d.creator)}` : ''}&limit=5&fields=title,cover_i`, ctx);
    const doc = ol?.docs?.find(x => x.cover_i && similar(x.title, d.title));
    if (doc) return { u: `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` };
    const w = await wiki(`${d.title} ${d.creator} novel`, d.title, ctx, /novel|book/i);
    if (w) return { u: w };
    return { u: await itunes(`${d.title} ${d.creator}`, 'ebook', 'ebook', x => similar(x.trackName, d.title), ctx) };
  },
  async music(d, ctx) {
    const artist = !d.creator || similar(d.creator, d.title);
    const w = await wiki(artist ? `${d.title} musician` : `${d.title} ${d.creator} album`, d.title, ctx, artist ? /band|singer|musician|rapper|group/i : /album|EP\)/i);
    if (w) return { u: w };
    return { u: await itunes(`${d.title} ${artist ? '' : d.creator}`.trim(), 'music', 'album', x => similar(x.collectionName, d.title) || similar(x.artistName, d.title), ctx) };
  },
  async movies(d, ctx) {
    const w = await wiki(`${d.title} ${d.year} film`, d.title, ctx, /film|movie/i);
    if (w) return { u: w };
    return { u: await itunes(d.title, 'movie', 'movie', x => similar(x.trackName, d.title), ctx) };
  },
  async tv(d, ctx) {
    const tm = await getJSON(`https://api.tvmaze.com/search/shows?q=${enc(d.title)}`, ctx);
    const show = tm?.map(x => x.show).find(s => s?.image && similar(s.name, d.title));
    if (show) {
      // Prefer the show's wide background art (true 16:9); fall back to its poster.
      const imgs = await getJSON(`https://api.tvmaze.com/shows/${show.id}/images`, ctx);
      const bg = imgs?.find(i => i.type === 'background' && i.main) || imgs?.find(i => i.type === 'background');
      const wide = bg?.resolutions?.medium?.url || bg?.resolutions?.original?.url;
      return { u: (wide || show.image.original || show.image.medium).replace(/^http:/, 'https:') };
    }
    return { u: await wiki(`${d.title} TV series`, d.title, ctx, /series|show|TV/i) };
  },
  async games(d, ctx) {
    const w = await wiki(`${d.title} video game`, d.title, ctx, /game/i);
    if (w) return { u: w };
    return { u: await itunes(d.title, 'software', 'software', x => similar(x.trackName, d.title), ctx) };
  },
  async streaming(d, ctx) {
    const svc = MC.matchService(d.title);
    if (svc) return logo(hostOf(svc.url));
    const w = await wiki(d.title, d.title, ctx, /service|channel|network|streaming/i);
    return w ? { u: w, f: 'contain' } : null;
  },
  async social(d, ctx) {
    const text = `${d.title} ${d.creator} ${d.hint}`;
    const platform = PLATFORMS.find(([re]) => re.test(text))?.[1];
    if (/^(r\/|@)/i.test(d.title.trim())) return platform ? logo(platform) : null;
    const w = await wiki(d.title, d.title, ctx, null);
    if (w) return { u: w };
    return platform ? logo(platform) : null;
  },
};

const inflight = new Map();
let active = 0; const waiting = [];
const slot = () => new Promise(r => { if (active < 4) { active++; r(); } else waiting.push(r); });
const release = () => { const next = waiting.shift(); if (next) next(); else active--; };

const resolveCover = (k, d) => {
  if (fresh(cache[k])) return Promise.resolve(cache[k]);
  if (!inflight.has(k)) inflight.set(k, (async () => {
    await slot();
    const ctx = { err: 0 };
    let hit = null;
    try { hit = await FIND[d.type]?.(d, ctx); } catch { ctx.err++; } finally { release(); }
    inflight.delete(k);
    const entry = { u: hit?.u || '', f: hit?.f || '', t: Date.now() };   // r (width/height) is added once the image loads
    if (entry.u || !ctx.err) { cache[k] = entry; persist(); }   // don't remember a miss caused by being offline
    return entry;
  })());
  return inflight.get(k);
};

const load = async el => {
  const k = el.dataset.k;
  const hit = await resolveCover(k, { ...el.dataset, title: el.dataset.title || '', creator: el.dataset.creator || '', year: el.dataset.year || '', hint: el.dataset.hint || '' });
  if (!hit?.u || !MC.coversOn()) return;
  document.querySelectorAll('.thumb[data-k]').forEach(th => {
    if (th.dataset.k !== k) return;
    th.removeAttribute('data-k');
    if (th.querySelector('.thumb-img')) return;
    th.classList.toggle('contain', !!hit.f);
    th.insertAdjacentHTML('beforeend', imgTag(hit.u, false));
  });
};

/* Look up thumbnails as they scroll into view, whatever rendered them (views, modals, AI results). */
const io = 'IntersectionObserver' in window
  ? new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) { io.unobserve(e.target); load(e.target); } }), { rootMargin: '300px' })
  : null;
const scan = () => document.querySelectorAll('.thumb[data-k]:not([data-seen])').forEach(el => { el.dataset.seen = '1'; io ? io.observe(el) : load(el); });
let queued = false;
new MutationObserver(() => { if (!queued) { queued = true; setTimeout(() => { queued = false; scan(); }, 30); } })
  .observe(document.documentElement, { childList: true, subtree: true });

/* ---------- trailers & clips ----------
   Where a title's trailer or clip comes from, in order:
   1. a link on the title itself (Claude's trailer_url, or one you pasted on a library item)
   2. Wikidata's official YouTube trailer for the film, show, game or album (found via Wikipedia)
   3. Apple previews: TV episode clips, 30-second song previews, audiobook samples
   4. trailers Claude found with web search (✨ Find with Claude in the player, or 🎬 Check trailers on the Calendar)
   Every YouTube link is checked first with YouTube's oEmbed (no key): deleted or private videos are skipped, videos that
   only play on YouTube become a "Watch on YouTube" deep link, and the next source is tried. Results are cached like covers. */
const CLIP_KEY = 'mediacopia.clips.v2';   // v2: every YouTube link is checked before use
let clips = {};
try { clips = JSON.parse(localStorage.getItem(CLIP_KEY) || '{}') || {}; localStorage.removeItem('mediacopia.clips.v1'); } catch { clips = {}; }
const saveClips = () => { try { localStorage.setItem(CLIP_KEY, JSON.stringify(clips)); } catch { /* ignore */ } };
// When the ranking changes, redo the picks but keep link checks (yt:) and Claude's finds (ai:), which cost time or money.
const CLIP_RANK = 2;
if (clips['#rank']?.c !== CLIP_RANK) {
  Object.keys(clips).forEach(k => { if (!/^(yt|ai):/.test(k)) delete clips[k]; });
  clips['#rank'] = { c: CLIP_RANK, t: Date.now() }; saveClips();
}

MC.clipFromUrl = u => {
  u = MC.safeUrl(u);
  if (!u) return null;
  const yt = u.match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/);
  if (yt) return { kind: 'youtube', id: yt[1], src: 'YouTube' };
  const vm = u.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vm) return { kind: 'vimeo', id: vm[1], src: 'Vimeo' };
  if (/\.(mp4|m4v|webm|mov)(\?|$)/i.test(u)) return { kind: 'video', url: u, src: hostOf(u) };
  if (/\.(mp3|m4a|aac|ogg|wav)(\?|$)/i.test(u)) return { kind: 'audio', url: u, src: hostOf(u) };
  return { kind: 'link', url: u, src: hostOf(u) };
};
/* Embed URL for a clip. muted previews loop without controls; the full player has sound and controls. */
MC.clipEmbed = (clip, { muted = false } = {}) => {
  // enablejsapi lets the player tell us when the owner blocks playback on other sites (then we link to YouTube instead).
  if (clip.kind === 'youtube') return `https://www.youtube.com/embed/${clip.id}?autoplay=1&playsinline=1&rel=0&modestbranding=1&enablejsapi=1&origin=${enc(location.origin)}${muted ? `&mute=1&controls=0&loop=1&playlist=${clip.id}` : ''}`;
  if (clip.kind === 'vimeo') return `https://player.vimeo.com/video/${clip.id}?autoplay=1${muted ? '&muted=1&background=1&loop=1' : ''}`;
  return '';
};

const wikiTrailer = async (query, title, ctx, prefer) => {
  const d = await getJSON(`https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrsearch=${enc(query)}&gsrlimit=5&prop=pageprops&ppprop=wikibase_item`, ctx);
  const pages = Object.values(d?.query?.pages || {}).sort((a, b) => a.index - b.index).filter(p => p.pageprops?.wikibase_item && similar(p.title, title));
  const p = (prefer && pages.find(p => prefer.test(p.title))) || pages[0];
  if (!p) return null;
  const c = await getJSON(`https://www.wikidata.org/w/api.php?action=wbgetclaims&format=json&origin=*&entity=${p.pageprops.wikibase_item}&property=P1651`, ctx);
  return (c?.claims?.P1651 || []).map(x => x.mainsnak?.datavalue?.value).filter(v => /^[\w-]{11}$/.test(v || ''))
    .map(id => ({ kind: 'youtube', id, src: 'YouTube · official trailer (via Wikidata)' }));
};
/* Each finder returns a list of candidates, best first. */
const CLIP_FIND = {
  movies: (d, ctx) => wikiTrailer(`${d.title} ${d.year} film`, d.title, ctx, /film|movie/i),
  games: (d, ctx) => wikiTrailer(`${d.title} video game`, d.title, ctx, /game/i),
  async tv(d, ctx) {
    const w = await wikiTrailer(`${d.title} TV series`, d.title, ctx, /series|show|TV/i);
    const ep = await itunesFind(d.title, 'tvShow', 'tvEpisode', x => x.previewUrl && similar(x.artistName, d.title), ctx);
    return [...w, ...(ep ? [{ kind: 'video', url: ep.previewUrl, src: `Apple TV · episode preview (${ep.trackName})` }] : [])];
  },
  async music(d, ctx) {
    const artist = !d.creator || similar(d.creator, d.title);
    const w = (await wikiTrailer(artist ? `${d.title} musician` : `${d.title} ${d.creator} album`, d.title, ctx, artist ? /band|singer|musician|rapper|group/i : /album|EP\)/i))
      .map(c => ({ ...c, src: 'YouTube (via Wikidata)' }));
    const song = await itunesFind(`${d.title} ${artist ? '' : d.creator}`.trim(), 'music', 'song',
      x => x.previewUrl && (similar(x.collectionName, d.title) || similar(x.artistName, d.title) || similar(x.trackName, d.title)), ctx);
    return [...w, ...(song ? [{ kind: 'audio', url: song.previewUrl, src: `Apple Music · 30-second preview of “${song.trackName}”` }] : [])];
  },
  async books(d, ctx) {
    const ab = await itunesFind(`${d.title} ${d.creator}`.trim(), 'audiobook', 'audiobook', x => x.previewUrl && similar(x.collectionName, d.title), ctx);
    return ab ? [{ kind: 'audio', url: ab.previewUrl, src: 'Apple Books · audiobook sample' }] : [];
  },
};

/* Is this YouTube video still there, and may it play inside MediaCopia? YouTube's oEmbed answers without a key.
   ok · noembed (plays on YouTube only) · missing (deleted, private or a bad id) · movie (a YouTube Movies listing, not a trailer) · unknown (offline) */
const YT_TTL = 3 * 864e5;
const ytInflight = new Map();
MC.ytCheck = id => {
  const k = 'yt:' + id, hit = clips[k];
  if (hit && Date.now() - hit.t < YT_TTL) return Promise.resolve(hit.c);
  if (!ytInflight.has(id)) ytInflight.set(id, (async () => {
    let r;
    try {
      const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${enc('https://www.youtube.com/watch?v=' + id)}`);
      if (res.ok) {
        const j = await res.json();
        r = { status: /^YouTube Movies/i.test(j.author_name || '') ? 'movie' : 'ok', title: j.title || '', author: j.author_name || '' };
      } else r = { status: res.status === 401 || res.status === 403 ? 'noembed' : 'missing' };
    } catch { r = { status: 'unknown' }; }
    ytInflight.delete(id);
    if (r.status !== 'unknown') { clips[k] = { c: r, t: Date.now() }; saveClips(); }
    return r;
  })());
  return ytInflight.get(id);
};
/* A candidate that's fine to offer: playable (maybe YouTube-only, then blocked: true), or null when it's gone. */
MC.vetClip = async c => {
  if (!c) return null;
  if (c.kind !== 'youtube') return c;
  const r = await MC.ytCheck(c.id);
  if (r.status === 'missing' || r.status === 'movie') return null;
  const named = r.title ? { title: r.title, author: r.author } : {};
  return { ...c, ...named, ...(r.status === 'noembed' || c.blocked ? { blocked: true } : {}) };
};
/* Try candidates in order: the first that plays here wins; else the first that plays on YouTube; else null.
   The rest that still work come back as backups (alts). */
const pickClip = async list => {
  let best = null, blocked = null;
  const alts = [];
  for (const c of list) {
    if (best && alts.length >= 4) break;
    const v = await MC.vetClip(c);
    if (!v) continue;
    // plain web pages (an article or network page with the trailer) are a fallback, like YouTube-only videos
    if (!best && !v.blocked && v.kind !== 'link') best = v;
    else if (!best && (!blocked || (blocked.kind === 'link' && v.kind !== 'link'))) { if (blocked) alts.push(blocked); blocked = v; }
    else alts.push(v);
  }
  const main = best || blocked;
  return main ? { ...main, alts: alts.filter(a => !(a.kind === main.kind && (a.id || a.url) === (main.id || main.url))) } : null;
};

const clipInflight = new Map();
const clipKey = rec => coverKey(MC.TYPE[rec.type] ? rec.type : 'streaming', rec.title, rec.creator);
MC.findClip = rec => {
  const own = MC.clipFromUrl(rec.trailer);
  const type = MC.TYPE[rec.type] ? rec.type : 'streaming';
  const k = clipKey(rec) + (own ? '|' + (own.id || own.url) : '');
  const hit = clips[k];
  if (hit && (hit.c || Date.now() - hit.t < MISS_TTL)) return Promise.resolve(hit.c || null);
  if (!clipInflight.has(k)) clipInflight.set(k, (async () => {
    const ctx = { err: 0 };
    let found = [];
    // "Blue Lights (Season 4)" → "Blue Lights" for the lookups
    const title = (rec.title || '').replace(/\s*\((?:season|series|part|volume|vol\.)[^)]*\)\s*$/i, '').trim();
    try { found = CLIP_FIND[type] ? await CLIP_FIND[type]({ title, creator: rec.creator || '', year: rec.year || '' }, ctx) : []; } catch { ctx.err++; }
    const ai = clips['ai:' + clipKey(rec)]?.c || [];
    // trailers first (your link, Wikidata, Claude's), then previews and samples as a last resort
    const isTrailer = c => c.kind === 'youtube' || c.kind === 'vimeo';
    const c = await pickClip([...(own ? [{ ...own, src: own.kind === 'youtube' ? 'YouTube · trailer link' : own.src }] : []),
      ...found.filter(isTrailer), ...ai, ...found.filter(c => !isTrailer(c))]);
    clipInflight.delete(k);
    if (c || !ctx.err) { clips[k] = { c, t: Date.now() }; saveClips(); }
    return c;
  })());
  return clipInflight.get(k);
};
/* Claude's candidates for a title: saved, then every cached result for that title is redone so they're used. */
MC.saveAiClips = (rec, list) => {
  const base = clipKey(rec);
  clips['ai:' + base] = { c: list, t: Date.now() };
  Object.keys(clips).forEach(k => { if (k === base || k.startsWith(base + '|')) delete clips[k]; });
  saveClips();
};
MC.pickClip = pickClip;
/* The video's owner doesn't allow it to play inside other sites: remember, so next time we go straight to a YouTube link. */
MC.clipBlocked = id => {
  Object.values(clips).forEach(e => { if (e.c?.id === id) e.c.blocked = true; });
  clips['yt:' + id] = { c: { status: 'noembed' }, t: Date.now() };
  saveClips();
};
MC.clearClips = () => { clips = {}; try { localStorage.removeItem(CLIP_KEY); } catch { /* ignore */ } };
})();
