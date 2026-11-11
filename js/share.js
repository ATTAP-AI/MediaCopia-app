/* MediaCopia — import, export and share (the "Import & share" page, #/share).

   Share: a list (watchlist, library or upcoming calendar) travels inside a link, compressed into the part after
   the # — browsers never send that part to any server, so the list goes straight from you to whoever opens the
   link. Opening it (#/shared/…) shows the list, and lets them add what they like to their own MediaCopia.

   Export: a full backup (.json, restorable here), or a list as a spreadsheet (.csv), MediaCopia list (.json),
   plain text or a calendar file (.ics).

   Import: MediaCopia backups and lists, and CSV exports from Goodreads, Letterboxd and IMDb or any spreadsheet
   with a title column, or a plain list (one title per line). Imports merge into what you have: nothing of
   yours is overwritten, except by a newer copy of the same title from a MediaCopia file. A backup can instead
   replace everything.

   Anything that arrives in a link or a file is untrusted: it is checked and trimmed (sanitize) and always
   escaped when shown. */
window.MC = window.MC || {};
MC.share = (() => {
  const E = MC.esc;
  const MAX_ITEMS = 1000;           // per import or shared list
  const LONG_LINK = 8000;           // longer links get cut by some messaging apps
  const ui = () => (MC.ui.share ||= { what: 'watchlist', ratings: true, notes: false, pending: null, mode: 'merge', defType: '', defStatus: 'want', shared: null });
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const nowISO = () => new Date().toISOString();

  /* ------------------------------------------------------------------ CSV */
  function parseCSV(text) {
    text = text.replace(/^﻿/, '');
    const first = text.split(/\r?\n/, 1)[0];
    const count = ch => (first.match(new RegExp(ch === '\t' ? '\t' : `\\${ch}`, 'g')) || []).length;
    const delim = [',', ';', '\t'].sort((a, b) => count(b) - count(a))[0];
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"' && cell === '') q = true;
      else if (c === delim) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); cell = '';
        if (row.some(x => x.trim())) rows.push(row);
        row = [];
      } else cell += c;
    }
    row.push(cell); if (row.some(x => x.trim())) rows.push(row);
    return rows;
  }
  // A leading = + - @ makes spreadsheet apps run the cell as a formula; a ' in front keeps it as text.
  const csvCell = v => {
    let s = String(v ?? '');
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const toCSV = rows => '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

  /* ------------------------------------------------------------------ what's in a list */
  const typeOk = i => MC.ui.type === 'all' || i.type === MC.ui.type;
  const LISTS = {
    watchlist: { label: 'Watchlist', noun: 'watchlist', items: () => MC.state.library.filter(i => i.status === 'want' && typeOk(i)) },
    library:   { label: 'Library',   noun: 'library',   items: () => MC.state.library.filter(typeOk) },
    calendar:  { label: 'Calendar',  noun: 'upcoming releases', drops: () => MC.allEvents().filter(e => e.date >= MC.today() && typeOk(e)) },
  };
  const listItems = what => LISTS[what]?.items?.() || [];
  const listDrops = what => LISTS[what]?.drops?.() || [];
  const listCount = what => listItems(what).length + listDrops(what).length;
  const typeWord = () => MC.ui.type === 'all' ? '' : MC.TYPE[MC.ui.type].label + ' ';
  const listTitle = (what, from) => {
    const base = `${typeWord()}${LISTS[what].label}`.trim();
    return from ? `${from}’s ${base.toLowerCase()}` : base;
  };
  const statusLabel = i => MC.TYPE[i.type]?.status[i.status] || i.status;

  /* ------------------------------------------------------------------ export */
  const fileStamp = what => `mediacopia-${what}${MC.ui.type === 'all' ? '' : '-' + MC.ui.type}-${MC.today()}`;
  const itemCSV = items => toCSV([
    ['Type', 'Title', 'Creator', 'Year', 'Status', 'Rating', 'Genres', 'Moods', 'Where', 'Release date', 'Link', 'Notes', 'Added'],
    ...items.map(i => [MC.TYPE[i.type]?.label || i.type, i.title, i.creator, i.year, statusLabel(i), i.rating || '',
      (i.genres || []).map(g => MC.labelForAnyTag?.(g) || g).join('; '), (i.moods || []).map(m => MC.labelForAnyTag?.(m) || m).join('; '),
      i.place, i.releaseDate, i.link, i.notes, (i.addedAt || '').slice(0, 10)]),
  ]);
  const dropCSV = drops => toCSV([
    ['Date', 'Type', 'Title', 'Creator', 'Date is', 'Link', 'Notes'],
    ...drops.map(d => [d.date, MC.TYPE[d.type]?.label || d.type, d.title, d.creator, d.dateConfidence === 'estimated' ? 'Estimate' : 'Confirmed', d.link, d.notes]),
  ]);
  const itemLine = i => `${i.title}${i.creator ? ' — ' + i.creator : ''}${i.year ? ` (${i.year})` : ''}${i.rating ? ' ' + '★'.repeat(i.rating) : ''}`;
  const textList = (what, { ratings = true } = {}) => {
    const items = listItems(what), drops = listDrops(what);
    const out = [listTitle(what, MC.state.settings.shareName), ''];
    MC.TYPES.forEach(t => {
      const its = items.filter(i => i.type === t.key);
      if (its.length) out.push(`${t.icon} ${t.label}`, ...its.map(i => '• ' + itemLine(ratings ? i : { ...i, rating: 0 })), '');
    });
    drops.forEach(d => out.push(`• ${MC.fmtDate(d.date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} — ${d.title}${d.creator ? ' — ' + d.creator : ''} (${MC.TYPE[d.type]?.label || d.type})`));
    return out.join('\n').trim() + '\n';
  };
  // A MediaCopia list file: what you chose, in full (no ids), importable on any MediaCopia.
  const listFile = what => JSON.stringify({
    mediacopia: 'list', v: 1, title: listTitle(what, MC.state.settings.shareName), from: MC.state.settings.shareName || '', at: MC.today(),
    items: listItems(what).map(({ id, ...rest }) => rest),
    drops: listDrops(what).map(d => ({ type: d.type, title: d.title, creator: d.creator, date: d.date, dateConfidence: d.dateConfidence, link: d.link, notes: d.notes })),
  }, null, 2);

  function exportList(what, format) {
    const n = listCount(what);
    if (!n) { MC.toast(`Nothing in your ${typeWord().toLowerCase()}${LISTS[what].noun} to export yet.`); return; }
    const name = fileStamp(what);
    if (format === 'csv') MC.download(`${name}.csv`, what === 'calendar' ? dropCSV(listDrops(what)) : itemCSV(listItems(what)), 'text/csv');
    else if (format === 'json') MC.download(`${name}.json`, listFile(what));
    else if (format === 'txt') MC.download(`${name}.txt`, textList(what), 'text/plain');
    else if (format === 'ics') MC.download(`${name}.ics`, MC.buildICS(listDrops(what)), 'text/calendar');
    MC.toast(`Exported ${plural(n, what === 'calendar' ? 'release' : 'title')}`);
  }

  /* ------------------------------------------------------------------ share links */
  const b64url = bytes => MC.crypto.toB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unb64url = s => MC.crypto.fromB64(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const streamBytes = async (bytes, T) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(T)).arrayBuffer());
  async function pack(obj) {
    const raw = new TextEncoder().encode(JSON.stringify(obj));
    if ('CompressionStream' in window) return 'z' + b64url(await streamBytes(raw, new CompressionStream('deflate-raw')));
    return 'j' + b64url(raw);
  }
  async function unpack(s) {
    const damaged = 'This share link is incomplete or damaged. Ask for it again, or copy all of it.';
    if (!/^[zj][A-Za-z0-9_-]+$/.test(s || '') || s.length > 400_000) throw new Error(damaged);
    if (s[0] === 'z' && !('DecompressionStream' in window)) throw new Error('This browser is too old to open share links. Try an up-to-date Safari, Chrome, Edge or Firefox.');
    let bytes;
    try {
      bytes = unb64url(s.slice(1));
      if (s[0] === 'z') bytes = await streamBytes(bytes, new DecompressionStream('deflate-raw'));
    } catch { throw new Error(damaged); }
    if (bytes.length > 2_000_000) throw new Error('This shared list is too big to open.');
    try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new Error(damaged); }
  }
  // Share links always point at the public site, so they work for whoever you send them to.
  const shareBase = () => /^(127\.0\.0\.1|localhost|\[::1\]|.+\.ts\.net)$/.test(location.hostname) ? 'https://mediacopia.com/' : location.origin + location.pathname;

  // The compact form in a link: k type, t title, c creator, y year, r rating, l link, n notes, d date, e estimated.
  const toShare = (items, drops, { ratings, notes }) => ({
    m: 'mediacopia', v: 1,
    items: items.slice(0, MAX_ITEMS).map(i => ({ k: i.type, t: i.title, c: i.creator || undefined, y: i.year || undefined,
      r: ratings && i.rating ? i.rating : undefined, l: MC.safeUrl(i.link) || undefined, n: notes && i.notes ? i.notes.slice(0, 500) : undefined })),
    drops: drops.slice(0, MAX_ITEMS).map(d => ({ k: d.type, t: d.title, c: d.creator || undefined, d: d.date,
      e: d.dateConfidence === 'estimated' ? 1 : undefined, l: MC.safeUrl(d.link) || undefined, n: notes && d.notes ? d.notes.slice(0, 500) : undefined })),
  });
  async function makeLink(title, items, drops, opts) {
    const from = (MC.state.settings.shareName || '').trim();
    const payload = await pack({ ...toShare(items, drops, opts), title, from: from || undefined, at: MC.today() });
    return `${shareBase()}#/shared/${payload}`;
  }

  // Text from a link or file → a clean list. Unknown types, bad links and odd dates are dropped; text is trimmed.
  const str = (v, n) => typeof v === 'string' || typeof v === 'number' ? String(v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n) : '';
  const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
  function sanitizeShared(o) {
    if (!o || typeof o !== 'object' || o.m !== 'mediacopia') throw new Error('This isn’t a MediaCopia share link.');
    const items = (Array.isArray(o.items) ? o.items : []).slice(0, MAX_ITEMS)
      .map(x => ({ type: str(x?.k, 20), title: str(x?.t, 200), creator: str(x?.c, 120), year: str(x?.y, 10),
        rating: Math.max(0, Math.min(5, Math.round(+x?.r || 0))), link: MC.safeUrl(str(x?.l, 600)), notes: str(x?.n, 500) }))
      .filter(x => MC.TYPE[x.type] && x.title);
    const drops = (Array.isArray(o.drops) ? o.drops : []).slice(0, MAX_ITEMS)
      .map(x => ({ type: str(x?.k, 20), title: str(x?.t, 200), creator: str(x?.c, 120), date: str(x?.d, 10),
        dateConfidence: x?.e ? 'estimated' : 'confirmed', link: MC.safeUrl(str(x?.l, 600)), notes: str(x?.n, 500) }))
      .filter(x => MC.TYPE[x.type] && x.title && isDate(x.date));
    return { title: str(o.title, 120) || 'A shared list', from: str(o.from, 60), at: isDate(o.at) ? o.at : '', items, drops };
  }
  const decode = async payload => sanitizeShared(await unpack(payload));

  async function copy(text, what = 'Link') {
    try { await navigator.clipboard.writeText(text); MC.toast(`${what} copied`); return true; }
    catch {   // no clipboard permission: show it so it can be copied by hand
      MC.openModal(`<div class="modal-head"><h2>Copy this ${E(what.toLowerCase())}</h2><button class="btn ghost icon-btn" data-close aria-label="Close">✕</button></div>
        <div class="modal-body"><textarea rows="6" readonly>${E(text)}</textarea></div>`, m => {
        m.querySelector('[data-close]').onclick = MC.closeModal; const t = m.querySelector('textarea'); t.focus(); t.select();
      });
      return false;
    }
  }
  // Send with the phone's or computer's share sheet; falls back to copying the link.
  async function sendLink(title, url, text = '') {
    if (navigator.share) {
      try { await navigator.share({ title, text: text || title, url }); return; }
      catch (e) { if (e?.name === 'AbortError') return; }
    }
    await copy(url);
  }
  async function shareFile(what) {
    const name = fileStamp(what) + '.json', body = listFile(what);
    const file = new File([body], name, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: listTitle(what, MC.state.settings.shareName) }); return; }
      catch (e) { if (e?.name === 'AbortError') return; }
    }
    MC.download(name, body);
    MC.toast('List saved as a file. Send it, and they can bring it in with Import.');
  }

  // One library item, from its editor.
  async function shareItem(item) {
    const url = await makeLink(item.title, [item], [], { ratings: true, notes: false });
    await sendLink(item.title, url, `${item.title}${item.creator ? ' — ' + item.creator : ''}: have a look on MediaCopia`);
  }

  /* ------------------------------------------------------------------ import: reading files */
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const TYPE_WORDS = [
    ['books', /^(books?|novels?|ebooks?|audiobooks?|comics?|manga|graphicnovels?|reading)$/],
    ['music', /^(music|albums?|songs?|tracks?|artists?|singles?|eps?|records?|bands?|podcasts?)$/],
    ['movies', /^(movies?|films?|features?|shorts?|tvmovies?|documentar(y|ies)|videos?)$/],
    ['tv', /^(tv|tvshows?|shows?|series|tvseries|tvminiseries|miniseries|tvepisodes?|episodes?|tvspecials?|anime)$/],
    ['games', /^(games?|gaming|videogames?|vg)$/],
    ['streaming', /^(streaming|services?|streamingservices?|channels?|subscriptions?)$/],
    ['social', /^(social|socialmedia|accounts?|creators?|communities|community|youtubers?|handles?)$/],
  ];
  const typeFrom = v => {
    const n = norm(v); if (!n) return '';
    if (MC.TYPE[n]) return n;
    const t = MC.TYPES.find(t => norm(t.label) === n || norm(t.noun) === n);
    return t ? t.key : (TYPE_WORDS.find(([, re]) => re.test(n)) || [''])[0];
  };
  const STATUS_WORDS = {
    want: /^(want|wanttoread|toread|wanttowatch|towatch|watchlist|wanttohear|backlog|planned|plantowatch|plantoread|plantoplay|wishlist|considering|interested|queue|upnext|later)$/,
    active: /^(active|currentlyreading|reading|watching|playing|listening|inprogress|current|onrepeat|following|subscribed|ongoing)$/,
    done: /^(done|read|watched|seen|heard|finished|completed|complete|played|beaten|tried|followed)$/,
    dropped: /^(dropped|abandoned|didnotfinish|dnf|gaveup|shelved|onhold|cancelled|canceled|unfollowed|notforme)$/,
  };
  const statusFrom = (v, type) => {
    const n = norm(v); if (!n) return '';
    if (MC.STATUSES.includes(n)) return n;
    const own = MC.STATUSES.find(s => norm(MC.TYPE[type]?.status[s]) === n);
    if (own) return own;
    return MC.STATUSES.find(s => STATUS_WORDS[s].test(n)) || MC.STATUSES.find(s => MC.TYPES.some(t => norm(t.status[s]) === n)) || '';
  };
  const yearFrom = v => (String(v || '').match(/\b(1[5-9]\d\d|20\d\d|21\d\d)\b/) || [''])[0];
  const dateFrom = v => { const m = String(v || '').match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/); return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : ''; };

  // Column names (normalised) → the field they fill. First match wins.
  const COLS = {
    title: ['title', 'name', 'album', 'book', 'booktitle', 'film', 'movie', 'show', 'game', 'track', 'song'],
    creator: ['creator', 'author', 'authors', 'artist', 'artists', 'director', 'directors', 'developer', 'studio', 'by', 'channel', 'handle', 'owner', 'network', 'provider', 'albumartist'],
    year: ['year', 'releaseyear', 'originalpublicationyear', 'yearpublished', 'published'],
    rating: ['rating', 'myrating', 'yourrating', 'stars', 'score', 'myscore'],
    type: ['type', 'mediatype', 'media', 'category', 'kind', 'titletype', 'format'],
    status: ['status', 'shelf', 'exclusiveshelf', 'state', 'list', 'progress'],
    notes: ['notes', 'note', 'review', 'myreview', 'comment', 'comments', 'description'],
    link: ['link', 'url', 'uri', 'letterboxduri', 'website'],
    releaseDate: ['releasedate', 'release'],
    place: ['where', 'platform', 'service', 'location', 'place'],
    addedAt: ['added', 'dateadded', 'created', 'daterated'],
  };
  const sourceOf = (h, filename) => {
    const has = n => h.includes(n);
    if (has('exclusiveshelf') || (has('bookid') && has('author'))) return { key: 'goodreads', label: 'Goodreads' };
    if (has('letterboxduri')) return { key: 'letterboxd', label: 'Letterboxd', watchlist: /watchlist/i.test(filename) };
    if (has('const') && has('titletype')) return { key: 'imdb', label: 'IMDb', watchlist: /watchlist/i.test(filename) || (has('position') && !has('yourrating')) };
    if (has('type') && has('title') && has('status') && has('creator')) return { key: 'mediacopia', label: 'MediaCopia spreadsheet' };
    return { key: 'csv', label: 'Spreadsheet' };
  };

  function rowsToItems(rows, filename) {
    const head = rows[0].map(norm);
    const col = f => COLS[f].map(n => head.indexOf(n)).find(i => i >= 0) ?? -1;
    const at = Object.fromEntries(Object.keys(COLS).map(f => [f, col(f)]));
    if (at.title < 0) return null;   // no header row with a title: treat the file as a plain list
    const src = sourceOf(head, filename);
    // A ' in front of = + - @ was added on export to stop spreadsheets running it as a formula.
    const get = (r, f) => at[f] >= 0 ? (r[at[f]] || '').trim().replace(/^'(?=[=+\-@])/, '') : '';
    const body = rows.slice(1);
    // Ratings out of 10 (IMDb) or 100 become stars out of 5.
    const maxR = Math.max(0, ...body.map(r => parseFloat(get(r, 'rating')) || 0));
    const scale = maxR > 10 ? 20 : maxR > 5 ? 2 : 1;
    const items = body.map(r => {
      let type = typeFrom(get(r, 'type'));
      if (src.key === 'goodreads') type = 'books';
      if (src.key === 'letterboxd') type = 'movies';
      if (src.key === 'imdb') type = /tv(series|miniseries|episode|special)|^(series|miniseries)/.test(norm(get(r, 'type'))) ? 'tv' : /videogame/.test(norm(get(r, 'type'))) ? 'games' : 'movies';
      const rating = Math.max(0, Math.min(5, Math.round((parseFloat(get(r, 'rating')) || 0) / scale)));
      let status = statusFrom(get(r, 'status'), type);
      if (!status && (src.key === 'letterboxd' || src.key === 'imdb')) status = src.watchlist ? 'want' : 'done';
      if (!status && rating) status = 'done';
      let link = MC.safeUrl(get(r, 'link'));
      if (!link && src.key === 'goodreads' && head.includes('bookid')) { const id = (r[head.indexOf('bookid')] || '').trim(); if (/^\d+$/.test(id)) link = `https://www.goodreads.com/book/show/${id}`; }
      const added = dateFrom(get(r, 'addedAt'));
      return {
        type, status, title: get(r, 'title').slice(0, 200), creator: get(r, 'creator').replace(/\s+/g, ' ').slice(0, 120),
        year: yearFrom(get(r, 'year')) || yearFrom(r[head.indexOf('yearpublished')]), rating, link, notes: get(r, 'notes').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').slice(0, 2000),
        releaseDate: (d => d >= MC.today() ? d : '')(dateFrom(get(r, 'releaseDate'))), place:   // only upcoming dates go on the calendar
        get(r, 'place').slice(0, 120),
        addedAt: added ? new Date(added + 'T12:00:00').toISOString() : '', source: src.key,
      };
    }).filter(i => i.title);
    return { source: src, items };
  }
  // One title per line, optionally "Title — Creator". Bullets, numbering and headings are skipped.
  // MediaCopia's own text export ("• Title — Creator (2011) ★★★★" under "📚 Books" headings) keeps its types,
  // years and stars.
  function textToItems(text) {
    let lines = text.split(/\r?\n/);
    const bulleted = lines.some(l => /^\s*•/.test(l));
    let type = '';
    const out = [];
    lines.forEach(raw => {
      const head = raw.trim().match(/^[^\w\s]*\s*(books|music|movies|gaming|tv|streaming|social media)\s*:?$/i);
      if (head) { type = typeFrom(head[1]); return; }
      if (bulleted && !/^\s*•/.test(raw)) return;   // the list's title line
      let l = raw.replace(/^\s*(?:[-*•·◦▪]|\d+[.)])\s+/, '').trim();
      if (!l || /^#/.test(l)) return;
      const stars = (l.match(/\s(★{1,5})\s*$/) || ['', ''])[1].length;
      l = l.replace(/\s★{1,5}\s*$/, '');
      const year = (l.match(/\s\((\d{4})\)\s*$/) || ['', ''])[1];
      l = l.replace(/\s\(\d{4}\)\s*$/, '');
      const [title, creator = ''] = l.split(/\s+[—–-]\s+|\t/).map(x => x.trim());
      if (title) out.push({ type, status: '', title: title.slice(0, 200), creator: creator.slice(0, 120), year, rating: stars, link: '', notes: '', releaseDate: '', place: '', addedAt: '', source: 'list' });
    });
    return out;
  }

  // A full library item from something imported.
  const cleanItem = x => ({
    type: MC.TYPE[x.type] ? x.type : '', status: MC.STATUSES.includes(x.status) ? x.status : '',
    title: str(x.title, 200), creator: str(x.creator, 120), year: str(x.year, 10), rating: Math.max(0, Math.min(5, Math.round(+x.rating || 0))),
    genres: Array.isArray(x.genres) ? x.genres.filter(g => typeof g === 'string').slice(0, 30) : [],
    moods: Array.isArray(x.moods) ? x.moods.filter(g => typeof g === 'string').slice(0, 30) : [],
    place: str(x.place, 200), link: MC.safeUrl(str(x.link, 800)), image: MC.safeUrl(str(x.image, 800)), trailer: MC.safeUrl(str(x.trailer, 800)),
    notes: typeof x.notes === 'string' ? x.notes.slice(0, 4000) : '', releaseDate: isDate(x.releaseDate) ? x.releaseDate : '',
    addedAt: str(x.addedAt, 40), updatedAt: str(x.updatedAt, 40), source: str(x.source, 30) || 'import',
  });
  const cleanDrop = x => ({
    type: MC.TYPE[x?.type] ? x.type : 'movies', title: str(x?.title, 200), creator: str(x?.creator, 120), date: isDate(x?.date) ? x.date : '',
    dateConfidence: x?.dateConfidence === 'estimated' ? 'estimated' : 'confirmed', link: MC.safeUrl(str(x?.link, 800)), notes: str(x?.notes, 2000), origin: 'import',
  });

  /* What a pasted text or file holds, before anything is saved:
     { kind: 'backup'|'list'|'csv'|'text'|'link', label, items[], drops[], backup? } */
  function analyze(text, filename = '') {
    const t = text.trim();
    if (!t) throw new Error('That’s empty.');
    const link = t.match(/#\/shared\/([zj][A-Za-z0-9_-]+)/);
    if (link) return { kind: 'link', label: 'MediaCopia share link', payload: link[1], items: [], drops: [] };
    if (/^[[{]/.test(t)) {
      let data; try { data = JSON.parse(t); } catch { throw new Error('That .json file couldn’t be read.'); }
      if (data && Array.isArray(data.library)) return { kind: 'backup', label: 'MediaCopia backup', backup: data,
        items: data.library.slice(0, 20000).map(cleanItem).filter(i => i.title && i.type), drops: (data.drops || []).map(cleanDrop).filter(d => d.title && d.date) };
      if (data?.mediacopia === 'list') return { kind: 'list', label: data.title ? `MediaCopia list: ${str(data.title, 80)}` : 'MediaCopia list',
        items: (data.items || []).slice(0, MAX_ITEMS * 5).map(cleanItem).filter(i => i.title && i.type), drops: (data.drops || []).map(cleanDrop).filter(d => d.title && d.date) };
      if (data?.m === 'mediacopia') { const s = sanitizeShared(data); return { kind: 'list', label: s.title, items: s.items.map(cleanItem), drops: s.drops.map(cleanDrop) }; }
      throw new Error('That isn’t a MediaCopia file.');
    }
    if (/^BEGIN:VCALENDAR/i.test(t)) throw new Error('Calendar (.ics) files can’t be imported yet. Use a MediaCopia list or a spreadsheet instead.');
    const rows = parseCSV(t);
    const multiCol = rows.length > 1 && rows[0].length > 1;
    const csv = multiCol ? rowsToItems(rows, filename) : null;
    if (csv) return { kind: 'csv', label: csv.source.label, items: csv.items.slice(0, MAX_ITEMS * 10), drops: [] };
    return { kind: 'text', label: 'List of titles', items: textToItems(t).slice(0, MAX_ITEMS), drops: [] };
  }

  /* ------------------------------------------------------------------ import: merging */
  const libKey = (type, title) => type + ':' + MC.titleKey(title);
  // Fill in the type and status where the file didn't say, and drop repeats within the file.
  function resolve(p) {
    const u = ui(), seen = new Set();
    return p.items.map(i => {
      const type = i.type || u.defType;
      return { ...i, type, status: i.status || u.defStatus };
    }).filter(i => {
      if (!MC.TYPE[i.type]) return false;
      const k = libKey(i.type, i.title); if (seen.has(k)) return false; seen.add(k); return true;
    });
  }
  function preview(p) {
    const lib = new Set(MC.state.library.map(i => libKey(i.type, i.title)));
    const items = resolve(p);
    const fresh = items.filter(i => !lib.has(libKey(i.type, i.title)));
    const dropKeys = new Set(MC.state.drops.map(d => d.date + ':' + MC.titleKey(d.title)));
    const freshDrops = p.drops.filter(d => !dropKeys.has(d.date + ':' + MC.titleKey(d.title)));
    return { items, fresh, existing: items.length - fresh.length, freshDrops, untyped: p.items.filter(i => !i.type).length };
  }
  // Adds new titles; for one already in your library, a newer copy from a MediaCopia file replaces it, otherwise
  // only its blanks are filled in. Returns counts.
  function mergeItems(s, items, { newerWins = false } = {}) {
    let added = 0, updated = 0;
    const byKey = new Map(s.library.map(i => [libKey(i.type, i.title), i]));
    const now = nowISO();
    items.forEach(it => {
      const ex = byKey.get(libKey(it.type, it.title));
      if (!ex) {
        const full = MC.newItem({ ...it, addedAt: it.addedAt || now, updatedAt: it.updatedAt || now });
        s.library.unshift(full); byKey.set(libKey(full.type, full.title), full); added++;
        return;
      }
      if (newerWins && it.updatedAt && it.updatedAt > (ex.updatedAt || '')) { Object.assign(ex, { ...it, id: ex.id }); updated++; return; }
      let changed = false;
      ['creator', 'year', 'link', 'place', 'releaseDate', 'image', 'trailer', 'notes'].forEach(k => { if (!ex[k] && it[k]) { ex[k] = it[k]; changed = true; } });
      if (!ex.rating && it.rating) { ex.rating = it.rating; changed = true; }
      if (changed) { ex.updatedAt = now; updated++; }
    });
    return { added, updated };
  }
  function mergeDrops(s, drops) {
    const keys = new Set(s.drops.map(d => d.date + ':' + MC.titleKey(d.title)));
    let n = 0;
    drops.forEach(d => {
      const k = d.date + ':' + MC.titleKey(d.title);
      if (!d.title || !d.date || keys.has(k)) return;
      keys.add(k); s.drops.push({ ...d, id: MC.uid(), addedAt: nowISO() }); n++;
    });
    return n;
  }
  // A backup merged in: titles, calendar, interests (yours win), saved asks and "not for me" — never your settings.
  function mergeBackup(s, data, items, drops) {
    const r = mergeItems(s, items, { newerWins: true });
    r.drops = mergeDrops(s, drops);
    const inn = data.interests || {};
    Object.entries(inn.types || {}).forEach(([k, v]) => { if (MC.TYPE[k] && !s.interests.types[k] && +v) s.interests.types[k] = Math.min(3, +v); });
    Object.entries(inn.picks || {}).forEach(([k, v]) => { if (typeof k === 'string' && k.length < 120 && !(k in s.interests.picks) && +v) s.interests.picks[k] = Math.max(-1, Math.min(3, +v)); });
    Object.entries(inn.custom || {}).forEach(([cat, list]) => {
      if (!Array.isArray(list) || !(MC.TYPE[cat] || cat === 'mood')) return;
      const mine = (s.interests.custom[cat] ||= []);
      list.forEach(c => { const label = str(c?.label, 80); if (label && !mine.some(m => m.label.toLowerCase() === label.toLowerCase())) mine.push({ id: MC.uid(), label, v: Math.max(-1, Math.min(3, +c.v || 1)) }); });
      if (!mine.length) delete s.interests.custom[cat];
    });
    if (!s.interests.about && typeof inn.about === 'string') s.interests.about = inn.about.slice(0, 4000);
    if (!s.interests.creators && typeof inn.creators === 'string') s.interests.creators = inn.creators.slice(0, 4000);
    const askIds = new Set(s.asks.map(a => a.id));
    (Array.isArray(data.asks) ? data.asks : []).forEach(a => { if (a && typeof a.id === 'string' && !askIds.has(a.id)) { s.asks.push(a); askIds.add(a.id); } });
    (Array.isArray(data.dismissed) ? data.dismissed : []).forEach(k => { if (typeof k === 'string' && !s.dismissed.includes(k)) s.dismissed.push(k); });
    return r;
  }

  async function runImport() {
    const u = ui(), p = u.pending; if (!p) return;
    if (p.kind === 'backup' && u.mode === 'replace') {
      if (!(await MC.confirm('Replace everything?', `Your library, interests, calendar and saved asks${MC.sync.signedIn() ? ', here and on your synced devices,' : ''} will be replaced by the backup. Your settings and Claude key stay as they are only if the backup has none.`, 'Replace everything'))) return;
      try { MC.importJSON(JSON.stringify(p.backup)); } catch (e) { MC.toast(e.message, 'error'); return; }
      u.pending = null; MC.render(); MC.toast('Backup restored'); return;
    }
    const items = resolve(p);
    let r;
    MC.update(s => {
      if (p.kind === 'backup') r = mergeBackup(s, p.backup, items, p.drops);
      else { r = mergeItems(s, items, { newerWins: p.kind === 'list' }); r.drops = mergeDrops(s, p.drops); }
    });
    u.pending = null; MC.render();
    const parts = [r.added && `added ${plural(r.added, 'title')}`, r.updated && `updated ${r.updated}`, r.drops && `${plural(r.drops, 'release')} on your calendar`].filter(Boolean);
    MC.toast(parts.length ? parts.join(', ').replace(/^./, c => c.toUpperCase()) : 'Nothing new: you already had all of it');
  }

  async function readInput(text, filename) {
    const u = ui();
    try {
      const p = analyze(text, filename);
      if (p.kind === 'link') { location.hash = '#/shared/' + p.payload; return; }
      if (!p.items.length && !p.drops.length) throw new Error('No titles found in that.');
      p.filename = filename;
      u.pending = p; u.mode = 'merge';
      u.defType = MC.ui.type !== 'all' ? MC.ui.type : '';
      u.defStatus = 'want';
      MC.render();
      document.getElementById('import')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    } catch (e) { MC.toast(e.message, 'error'); }
  }

  /* ------------------------------------------------------------------ the page */
  const segBtn = (cur, val, label, n) => `<button type="button" class="${cur === val ? 'active' : ''}" data-action="share-what" data-what="${val}">${E(label)}${n !== undefined ? ` <span class="muted">${n}</span>` : ''}</button>`;
  const typeMix = (items, drops) => {
    const by = {}; [...items, ...drops].forEach(i => { by[i.type] = (by[i.type] || 0) + 1; });
    return MC.TYPES.filter(t => by[t.key]).map(t => `<span class="pill">${t.icon} ${by[t.key]}</span>`).join(' ');
  };
  const typeNote = () => MC.ui.type === 'all'
    ? '<span class="tiny muted">All media types. Pick a category at the top to share or export just that one.</span>'
    : `<span class="tiny muted">Only ${E(MC.TYPE[MC.ui.type].label)}. <button class="btn sm ghost" data-action="head-type" data-type="all">Use all types</button></span>`;

  function shareCard() {
    const u = ui(), what = u.what, items = listItems(what), drops = listDrops(what), n = items.length + drops.length;
    return `<div class="card" id="share">
      <h2>🔗 Share a list</h2>
      <p class="small muted">Send a friend your watchlist, your library or what’s coming out. They open the link and can add anything to their own MediaCopia. The list travels inside the link itself and never passes through MediaCopia’s server. Anyone you give the link to can see it.</p>
      <div class="tabs">${segBtn(what, 'watchlist', 'Watchlist', LISTS.watchlist.items().length)}${segBtn(what, 'library', 'Library', LISTS.library.items().length)}${segBtn(what, 'calendar', 'Calendar', LISTS.calendar.drops().length)}</div>
      ${typeNote()}
      <div class="row">${n ? typeMix(items, drops) : `<span class="muted small">Nothing in your ${E(typeWord().toLowerCase())}${E(LISTS[what].noun)} yet.</span>`}</div>
      <label class="field share-from">From <input type="text" data-share-name maxlength="60" value="${E(MC.state.settings.shareName || '')}" placeholder="Your name (optional)"></label>
      <div class="share-opts">
        <label class="switch"><input type="checkbox" data-share-opt="ratings" ${u.ratings ? 'checked' : ''}> Include my ratings</label>
        <label class="switch"><input type="checkbox" data-share-opt="notes" ${u.notes ? 'checked' : ''}> Include my notes</label>
      </div>
      <div class="row">
        <button class="btn primary" data-action="share-send" ${n ? '' : 'disabled'}>${navigator.share ? '📤 Share…' : '🔗 Copy link'}</button>
        ${navigator.share ? `<button class="btn" data-action="share-copy" ${n ? '' : 'disabled'}>🔗 Copy link</button>` : ''}
        <button class="btn" data-action="share-text" ${n ? '' : 'disabled'}>📋 Copy as text</button>
        <button class="btn" data-action="share-file" ${n ? '' : 'disabled'}>📄 Send as a file</button>
      </div>
      <div data-share-status class="tiny muted"></div>
    </div>`;
  }

  function exportCard() {
    const row = (what, formats) => {
      const n = listCount(what);
      return `<tr><th>${E(LISTS[what].label)} <span class="muted">${n}</span></th><td><div class="row">${formats.map(([f, l]) =>
        `<button class="btn sm" data-action="export-list" data-what="${what}" data-format="${f}" ${n ? '' : 'disabled'}>${l}</button>`).join('')}</div></td></tr>`;
    };
    const lists = [['csv', 'Spreadsheet (.csv)'], ['json', 'MediaCopia (.json)'], ['txt', 'Text']];
    return `<div class="card" id="export">
      <h2>⬇️ Export</h2>
      <p class="small muted">Download a list to open in Excel, Numbers or Google Sheets, keep as text, or bring into another MediaCopia. The calendar can also go to Apple, Google or Outlook Calendar.</p>
      ${typeNote()}
      <table class="export-table"><tbody>
        ${row('watchlist', lists)}${row('library', lists)}${row('calendar', [...lists, ['ics', 'Calendar (.ics)']])}
        <tr><th>Everything <span class="muted">backup</span></th><td><div class="row"><button class="btn sm primary" data-action="export-json">Full backup (.json)</button>
          <span class="tiny muted">Library, interests, calendar, saved asks and settings. Your Claude key is left out.</span></div></td></tr>
      </tbody></table>
    </div>`;
  }

  function importPreview() {
    const u = ui(), p = u.pending; if (!p) return '';
    const pv = preview(p);
    const typeSel = `<select data-imp-type><option value="">Choose…</option>${MC.TYPES.map(t => `<option value="${t.key}" ${u.defType === t.key ? 'selected' : ''}>${t.icon} ${E(t.label)}</option>`).join('')}</select>`;
    const st = MC.TYPE[u.defType] || MC.TYPE.movies;
    const statusSel = `<select data-imp-status>${MC.STATUSES.map(s => `<option value="${s}" ${u.defStatus === s ? 'selected' : ''}>${E(u.defType ? st.status[s] : { want: 'Want / watchlist', active: 'In progress', done: 'Finished', dropped: 'Dropped' }[s])}</option>`).join('')}</select>`;
    const sample = (pv.items.length ? pv.items : p.items).slice(0, 8);
    const needsType = pv.untyped && !u.defType;
    const nAdd = pv.fresh.length + pv.freshDrops.length;
    return `<div class="imp-preview">
      <div class="row" style="justify-content:space-between"><b>${E(p.label)}${p.filename ? ` <span class="muted">· ${E(p.filename)}</span>` : ''}</b>
        <button class="btn sm ghost" data-action="import-cancel">✕ Cancel</button></div>
      ${pv.untyped ? `<div class="notice">${plural(pv.untyped, 'title')} ${pv.untyped === 1 ? 'doesn’t' : 'don’t'} say what kind of media ${pv.untyped === 1 ? 'it is' : 'they are'}. Add ${pv.untyped === 1 ? 'it' : 'them'} as ${typeSel}</div>` : ''}
      ${p.items.some(i => !i.status) ? `<label class="field">Status for titles without one ${statusSel}</label>` : ''}
      <div class="row">${typeMix(pv.items, p.drops)}</div>
      <p class="small">${needsType ? `<b>${plural(p.items.length, 'title')}</b> found. Choose a media type above to see what’s new.`
        : `<b>${plural(pv.fresh.length, 'new title')}</b>${pv.existing ? `, ${pv.existing} already in your library` : ''}${p.drops.length ? `, ${plural(pv.freshDrops.length, 'new release')} for your calendar` : ''}.`}
        ${p.kind === 'backup' ? ' Merging also adds interests and saved asks you don’t have yet. Your settings stay as they are.' : ''}
        ${pv.existing ? ' Titles you already have keep your status and rating; only blanks are filled in' + (p.kind !== 'csv' && p.kind !== 'text' ? ', unless the file has a newer copy' : '') + '.' : ''}</p>
      <ul class="imp-sample">${sample.map(i => `<li>${MC.TYPE[i.type]?.icon || '•'} ${E(i.title)}${i.creator ? ` <span class="muted">— ${E(i.creator)}</span>` : ''}${i.rating ? ` <span class="stars">${'★'.repeat(i.rating)}</span>` : ''}</li>`).join('')}
        ${p.items.length > sample.length ? `<li class="muted">and ${p.items.length - sample.length} more…</li>` : ''}</ul>
      ${p.kind === 'backup' ? `<div class="imp-mode">
        <label class="check"><input type="radio" name="imp-mode" value="merge" ${u.mode !== 'replace' ? 'checked' : ''}><span>Merge into my MediaCopia<small>Adds what you don’t have. Recommended.</small></span></label>
        <label class="check"><input type="radio" name="imp-mode" value="replace" ${u.mode === 'replace' ? 'checked' : ''}><span>Replace everything<small>Makes this device${MC.sync.signedIn() ? ' and your synced devices' : ''} match the backup exactly.</small></span></label></div>` : ''}
      <div class="row"><button class="btn primary" data-action="import-run" ${(u.mode === 'replace' && p.kind === 'backup') || (nAdd && !needsType) || pv.existing ? '' : 'disabled'}>
        ${u.mode === 'replace' && p.kind === 'backup' ? 'Replace everything' : nAdd ? `Import ${plural(nAdd, p.drops.length && !pv.fresh.length ? 'release' : 'title')}` : 'Fill in blanks'}</button></div>
    </div>`;
  }

  function importCard() {
    return `<div class="card" id="import">
      <h2>⬆️ Import</h2>
      <p class="small muted">Bring in a MediaCopia backup or list, your exports from <b>Goodreads</b>, <b>Letterboxd</b> or <b>IMDb</b>, or any spreadsheet (.csv) with a title column. Nothing you already have is overwritten.</p>
      ${ui().pending ? importPreview() : `
      <label class="dropzone" data-dropzone>
        <input type="file" accept=".json,.csv,.tsv,.txt,application/json,text/csv,text/plain" data-import-file hidden>
        <span class="dz-icon">📥</span><b>Choose a file</b><span class="tiny muted">or drop it here · .json, .csv or .txt</span>
      </label>
      <details class="imp-paste"><summary class="small">…or paste a list, spreadsheet rows or a share link</summary>
        <textarea data-import-text rows="5" placeholder="Dune — Frank Herbert&#10;The Bear&#10;https://mediacopia.com/#/shared/…"></textarea>
        <div class="row"><button class="btn sm" data-action="import-paste">Check</button></div>
      </details>
      <details class="small muted imp-help"><summary>Where do I get those files?</summary>
        <ul>
          <li><b>Goodreads</b>: My Books → Import and export → Export Library.</li>
          <li><b>Letterboxd</b>: Settings → Data → Export your data. Import <code>watched.csv</code>, <code>ratings.csv</code> or <code>watchlist.csv</code> from the zip.</li>
          <li><b>IMDb</b>: Your Ratings or Your Watchlist → ⋯ → Export.</li>
          <li><b>Spreadsheets</b>: a first row naming the columns, such as Title, Author or Artist, Year, Rating, Type and Status.</li>
        </ul></details>`}
    </div>`;
  }

  MC.views.share = {
    render() {
      return `
      <div class="page-head"><div><h1>Import & share</h1><p class="muted">Share lists with friends, export your data, or bring in lists from other apps.</p></div></div>
      <div class="settings">${shareCard()}${exportCard()}${importCard()}</div>`;
    },
    mount(root, params) {
      if (params?.[0]) root.querySelector('#' + CSS.escape(params[0]))?.scrollIntoView({ block: 'start' });
      const u = ui();
      root.querySelectorAll('[data-share-opt]').forEach(cb => cb.onchange = () => { u[cb.dataset.shareOpt] = cb.checked; });
      root.querySelector('[data-share-name]')?.addEventListener('change', e => { MC.ui.skipRender = true; MC.update(s => { s.settings.shareName = e.target.value.trim().slice(0, 60); }); });
      const file = root.querySelector('[data-import-file]');
      if (file) file.onchange = async () => { const f = file.files[0]; if (f) readInput(await f.text(), f.name); };
      const dz = root.querySelector('[data-dropzone]');
      if (dz) {
        dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); });
        dz.addEventListener('dragleave', () => dz.classList.remove('over'));
        dz.addEventListener('drop', async e => { e.preventDefault(); dz.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) readInput(await f.text(), f.name); });
      }
      root.querySelector('[data-imp-type]')?.addEventListener('change', e => { u.defType = e.target.value; MC.render(); });
      root.querySelector('[data-imp-status]')?.addEventListener('change', e => { u.defStatus = e.target.value; MC.render(); });
      root.querySelectorAll('[name=imp-mode]').forEach(r => r.onchange = () => { u.mode = r.value; MC.render(); });
    },
  };

  /* ------------------------------------------------------------------ a list someone shared (#/shared/…) */
  const sharedCard = (it, i) => {
    const inLib = MC.findInLibrary(it.title, it.type);
    const t = MC.TYPE[it.type];
    return MC.cineCard({
      rec: it, sub: [it.creator, it.year].filter(Boolean).join(' · '), why: it.notes,
      badges: it.rating ? `<span class="tiny muted">their rating</span> ${MC.stars(it.rating)}` : '',
      actions: inLib ? '<span class="pill ok">In your library</span>'
        : `<button class="btn sm primary" data-action="shared-add" data-i="${i}">+ ${E(t.status.want)}</button>${it.link ? `<a class="btn sm ghost" href="${E(it.link)}" target="_blank" rel="noopener noreferrer">Link ↗</a>` : ''}`,
    });
  };
  const sharedDrop = (d, i) => {
    const has = MC.allEvents().some(e => e.date === d.date && MC.titleKey(e.title) === MC.titleKey(d.title));
    return MC.eventCard({ ...d, id: 'sh' + i }, { showDate: true, actions: has ? '<span class="pill ok">On your calendar</span>' : `<button class="btn sm primary" data-action="shared-add-drop" data-i="${i}">📅 Add to calendar</button>` });
  };
  const noteFor = (data, it) => [`Shared by ${data.from || 'a friend'}`, it.rating ? `their rating ${it.rating}/5` : '', it.notes].filter(Boolean).join(' · ');

  MC.views.shared = {
    render(params) {
      const u = ui(), payload = params[0] || '';
      if (!payload) return '<div class="empty"><h3>No shared list here</h3></div>';
      const sh = u.shared?.key === payload ? u.shared : null;
      if (!sh) return `<div class="page-head"><div><h1>A shared list</h1></div></div><div class="status-line"><div class="spinner"></div><span>Opening…</span></div>`;
      if (sh.error) return `<div class="page-head"><div><h1>A shared list</h1></div></div><div class="notice error">${E(sh.error)}</div>`;
      const d = sh.data;
      const newItems = d.items.filter(it => !MC.findInLibrary(it.title, it.type));
      const newDrops = d.drops.filter(x => !MC.allEvents().some(e => e.date === x.date && MC.titleKey(e.title) === MC.titleKey(x.title)));
      const total = d.items.length + d.drops.length;
      const groups = MC.TYPES.map(t => ({ t, list: d.items.map((it, i) => [it, i]).filter(([it]) => it.type === t.key) })).filter(g => g.list.length);
      return `
      <div class="page-head"><div><h1>📬 ${E(d.title)}</h1>
        <p class="muted">${d.from ? `From ${E(d.from)} · ` : ''}${d.at ? `${E(MC.fmtDate(d.at))} · ` : ''}${plural(total, 'title')}. Add whatever you like to your own MediaCopia.</p></div>
        <div class="row">${newItems.length ? `<button class="btn primary" data-action="shared-add-all">+ Add ${newItems.length === d.items.length ? 'all ' : ''}${plural(newItems.length, 'title')} to my watchlist</button>` : ''}
          ${newDrops.length ? `<button class="btn" data-action="shared-add-drops">📅 Add ${plural(newDrops.length, 'release')} to my calendar</button>` : ''}</div></div>
      ${groups.map(({ t, list }) => `<section class="section" ${MC.typeStyle(t.key)}><div class="section-head"><h2>${t.icon} ${E(t.label)} <span class="muted">· ${list.length}</span></h2></div>
        <div class="grid">${list.map(([it, i]) => sharedCard(it, i)).join('')}</div></section>`).join('')}
      ${d.drops.length ? `<section class="section"><div class="section-head"><h2>📅 Coming out <span class="muted">· ${d.drops.length}</span></h2></div>
        <div class="grid">${d.drops.map(sharedDrop).join('')}</div></section>` : ''}
      <p class="tiny muted">This list came inside the link. Nothing from it is saved until you add it.</p>`;
    },
    async mount(root, params) {
      const u = ui(), payload = params[0] || '';
      if (!payload || u.shared?.key === payload) return;
      try { u.shared = { key: payload, data: await decode(payload) }; }
      catch (e) { u.shared = { key: payload, error: e.message || 'This share link couldn’t be opened.' }; }
      if (MC.route().name === 'shared') MC.render();
    },
  };

  const sharedData = () => ui().shared?.data;
  const addShared = items => {
    const d = sharedData(); let n = 0;
    MC.update(s => { n = mergeItems(s, items.filter(it => !MC.findInLibrary(it.title, it.type)).map(it => ({ ...cleanItem(it), status: 'want', rating: 0, notes: noteFor(d, it), source: 'shared' }))).added; });
    return n;
  };

  /* ------------------------------------------------------------------ actions */
  Object.assign(MC.actions, {
    'share-what': el => { ui().what = el.dataset.what; MC.render(); },
    'share-list': el => { ui().what = el.dataset.what || 'watchlist'; location.hash = '#/share'; },
    'share-send': async el => {
      const u = ui(), what = u.what;
      el.disabled = true;
      try {
        const url = await makeLink(listTitle(what, MC.state.settings.shareName), listItems(what), listDrops(what), u);
        const status = document.querySelector('[data-share-status]');
        if (status) status.textContent = url.length > LONG_LINK ? `This link is long (${Math.round(url.length / 1000)} k characters) and some apps cut long links. If it doesn’t open for them, use “Send as a file”.` : '';
        await sendLink(listTitle(what, MC.state.settings.shareName), url);
      } finally { el.disabled = false; }
    },
    'share-copy': async () => {
      const u = ui();
      await copy(await makeLink(listTitle(u.what, MC.state.settings.shareName), listItems(u.what), listDrops(u.what), u));
    },
    'share-text': () => copy(textList(ui().what, ui()), 'List'),
    'share-file': () => shareFile(ui().what),
    'export-list': el => exportList(el.dataset.what, el.dataset.format),
    'import-paste': () => { const t = document.querySelector('[data-import-text]')?.value || ''; readInput(t, ''); },
    'import-cancel': () => { ui().pending = null; MC.render(); },
    'import-run': () => runImport(),
    'shared-add': el => {
      const it = sharedData()?.items[+el.dataset.i]; if (!it) return;
      if (addShared([it])) MC.toast(`Added “${it.title}” to your ${MC.TYPE[it.type].status.want.toLowerCase()}`);
    },
    'shared-add-all': () => { const d = sharedData(); if (!d) return; const n = addShared(d.items); MC.toast(`Added ${plural(n, 'title')}`); },
    'shared-add-drop': el => {
      const d = sharedData(), x = d?.drops[+el.dataset.i]; if (!x) return;
      MC.update(s => mergeDrops(s, [{ ...cleanDrop(x), notes: noteFor(d, x) }])); MC.toast(`“${x.title}” is on your calendar`);
    },
    'shared-add-drops': () => {
      const d = sharedData(); if (!d) return; let n = 0;
      MC.update(s => { n = mergeDrops(s, d.drops.map(x => ({ ...cleanDrop(x), notes: noteFor(d, x) }))); });
      MC.toast(`Added ${plural(n, 'release')} to your calendar`);
    },
  });

  return { parseCSV, toCSV, analyze, preview, decode, pack, unpack, makeLink, shareItem, textList, itemCSV, mergeItems, _ui: ui };
})();
