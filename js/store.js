/* MediaCopia — app state, import/export. The state is stored encrypted on this device by js/vault.js (the same
   design as CatchAll); nothing is saved until the vault is unlocked. */
window.MC = window.MC || {};

MC.STORAGE_KEY = 'mediacopia.v1';

MC.defaultState = () => ({
  version: 1,
  library: [],          // {id,type,title,creator,year,status,rating,genres[],moods[],place,link,notes,releaseDate,addedAt,updatedAt,source}
  interests: {
    types: {},          // { books: 2, games: 1, ... }  (level per media type)
    picks: {},          // { 'books.genre.fantasy': 2, 'mood.cozy': 1, ... }
    about: '',          // free-text "in my own words"
    creators: '',       // comma separated favourite creators to track
    custom: {},         // { books: [{id,label,v}], mood: [...] } — the user's own interests per category
  },
  drops: [],            // {id,type,title,creator,date,dateConfidence,notes,link,origin,addedAt}
  asks: [],             // {id,query,at,intro,items[],usedWeb}
  dismissed: [],        // normalised title keys the user said "not for me" to
  servicePrices: null,  // last live price check: { at, region, items: { serviceId: { price, plans, deal, trial, url } } }
  searches: {},         // last AI-bar search per page: { 'library:books': {query,at,askId|offline}, calendar: {query,at,summary,items[],sources[]} }
  settings: { apiKey: '', model: 'claude-opus-5-5', webSearch: true, theme: 'auto', region: '', subs: [], covers: true },  // subs: ids from MC.SERVICES; covers: look up artwork
});

/* Country used for "where to watch" — from Settings, else the browser's language (en-GB → GB). */
MC.region = () => (MC.state.settings.region || (navigator.language || 'en-US').split('-')[1] || 'US').toUpperCase();
MC.uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
MC.titleKey = s => (s || '').toLowerCase().replace(/^(the|a|an)\s+/, '').replace(/[^a-z0-9]+/g, '');
MC.today = () => { const d = new Date(); return MC.isoDate(d); };
MC.isoDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
MC.parseDate = s => { const [y, m, d] = (s || '').split('-').map(Number); return y ? new Date(y, (m || 1) - 1, d || 1) : null; };

/* A stored (decrypted) state object → a complete state with defaults filled in. */
MC.fromJSON = s => {
  const base = MC.defaultState();
  if (!s || typeof s !== 'object') return base;
  const out = {
    ...base, ...s,
    interests: { ...base.interests, ...(s.interests || {}) },
    settings: { ...base.settings, ...(s.settings || {}) },
  };
  // First run with subscriptions: pre-tick the services already marked in Interests → "Services I use".
  if (!Array.isArray(s.settings?.subs)) out.settings.subs = MC.subsFromPicks(out.interests.picks);
  return out;
};
MC.subsFromPicks = picks => Object.entries(picks || {})
  .filter(([k, v]) => v > 0 && k.startsWith('streaming.service.'))
  .map(([k]) => MC.SUB_FROM_PICK?.[k.split('.')[2]]).filter(Boolean);

MC.state = MC.defaultState();   // empty until the vault is unlocked (js/lock.js)
MC.listeners = new Set();

MC.save = () => {
  // Encrypted on this device; never saved while locked, so a locked (empty) app can't overwrite your data.
  if (MC.vault?.isOpen()) MC.vault.write(MC.state);
  try { localStorage.setItem('mediacopia:theme', MC.state.settings.theme || 'auto'); } catch { /* private mode */ }
  MC.listeners.forEach(fn => fn());
};

MC.update = fn => { fn(MC.state); MC.save(); };

/* ---------- library ---------- */
MC.findInLibrary = (title, type) => {
  const k = MC.titleKey(title);
  return MC.state.library.find(i => MC.titleKey(i.title) === k && (!type || i.type === type));
};

MC.addItem = item => {
  const now = new Date().toISOString();
  const full = {
    id: MC.uid(), type: 'books', title: '', creator: '', year: '', status: 'want', rating: 0,
    genres: [], moods: [], place: '', link: '', notes: '', releaseDate: '',
    addedAt: now, updatedAt: now, source: 'manual', ...item,
  };
  MC.update(s => s.library.unshift(full));
  return full;
};

MC.saveItem = item => MC.update(s => {
  const i = s.library.findIndex(x => x.id === item.id);
  item.updatedAt = new Date().toISOString();
  if (i >= 0) s.library[i] = item; else s.library.unshift(item);
});

MC.removeItem = id => MC.update(s => { s.library = s.library.filter(x => x.id !== id); });

/* ---------- drops (calendar) ---------- */
MC.addDrop = drop => {
  const exists = MC.state.drops.find(d => MC.titleKey(d.title) === MC.titleKey(drop.title) && d.date === drop.date);
  if (exists) return exists;
  const full = { id: MC.uid(), type: 'movies', title: '', creator: '', date: MC.today(), dateConfidence: 'confirmed',
    notes: '', link: '', origin: 'manual', addedAt: new Date().toISOString(), ...drop };
  MC.update(s => s.drops.push(full));
  return full;
};
MC.removeDrop = id => MC.update(s => { s.drops = s.drops.filter(d => d.id !== id); });

/* All calendar events: explicit drops + library items with a release date. */
MC.allEvents = () => {
  const ev = MC.state.drops.map(d => ({ ...d, kind: 'drop' }));
  MC.state.library.filter(i => i.releaseDate).forEach(i => {
    if (!ev.some(e => e.date === i.releaseDate && MC.titleKey(e.title) === MC.titleKey(i.title))) {
      ev.push({ id: 'lib-' + i.id, itemId: i.id, type: i.type, title: i.title, creator: i.creator,
        date: i.releaseDate, dateConfidence: 'confirmed', notes: i.notes, link: i.link, image: i.image || '', trailer: i.trailer || '', origin: 'library', kind: 'library' });
    }
  });
  return ev.sort((a, b) => a.date.localeCompare(b.date));
};

/* ---------- interests ---------- */
MC.getPick = key => MC.state.interests.picks[key] || 0;
MC.setPick = (key, v) => MC.update(s => { if (v) s.interests.picks[key] = v; else delete s.interests.picks[key]; });
MC.getTypeLevel = t => MC.state.interests.types[t] || 0;
MC.setTypeLevel = (t, v) => MC.update(s => { if (v) s.interests.types[t] = v; else delete s.interests.types[t]; });

/* Your own interests: free-text entries per category (a media type key, or 'mood'), each with a level. */
MC.customFor = t => MC.state.interests.custom?.[t] || [];
MC.customCount = () => Object.values(MC.state.interests.custom || {}).reduce((n, l) => n + l.length, 0);
MC.addCustom = (t, labels) => {
  let added = 0;
  MC.update(s => {
    const list = (s.interests.custom[t] ||= []);
    labels.map(l => l.trim().slice(0, 80)).filter(Boolean).forEach(label => {
      if (list.some(c => c.label.toLowerCase() === label.toLowerCase())) return;
      list.push({ id: MC.uid(), label, v: 1 }); added++;
    });
  });
  return added;
};
MC.setCustomLevel = (t, id, v) => MC.update(s => { const c = (s.interests.custom[t] || []).find(c => c.id === id); if (c) c.v = v; });
MC.removeCustom = (t, id) => MC.update(s => {
  s.interests.custom[t] = (s.interests.custom[t] || []).filter(c => c.id !== id);
  if (!s.interests.custom[t].length) delete s.interests.custom[t];
});

MC.dismiss = title => MC.update(s => { const k = MC.titleKey(title); if (!s.dismissed.includes(k)) s.dismissed.push(k); });
MC.isDismissed = title => MC.state.dismissed.includes(MC.titleKey(title));

/* ---------- import / export ---------- */
MC.exportJSON = (includeKey = false) => {
  const copy = JSON.parse(JSON.stringify(MC.state));
  if (!includeKey) copy.settings.apiKey = '';
  delete copy.settings.guide;   // the full TV guide's Schedules Direct sign-in never goes into a backup file
  return JSON.stringify(copy, null, 2);
};

MC.importJSON = text => {
  const data = JSON.parse(text);
  if (!data || !Array.isArray(data.library)) throw new Error('That file is not a MediaCopia backup.');
  const keepKey = MC.state.settings.apiKey, keepGuide = MC.state.settings.guide;
  MC.state = MC.fromJSON(data);
  if (!MC.state.settings.apiKey) MC.state.settings.apiKey = keepKey;
  if (keepGuide && !MC.state.settings.guide) MC.state.settings.guide = keepGuide;
  MC.save();
};

MC.resetAll = () => { MC.state = MC.defaultState(); MC.save(); };

MC.download = (filename, text, mime = 'application/json') => {
  const blob = new Blob([text], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

/* ---------- sample data ---------- */
MC.loadSample = () => MC.update(s => {
  const add = (type, title, creator, year, status, rating, genres, moods = []) => {
    if (s.library.some(i => MC.titleKey(i.title) === MC.titleKey(title))) return;
    const now = new Date().toISOString();
    s.library.push({ id: MC.uid(), type, title, creator, year: String(year), status, rating, genres, moods,
      place: '', link: '', notes: '', releaseDate: '', addedAt: now, updatedAt: now, source: 'sample' });
  };
  add('books', 'The Martian', 'Andy Weir', 2011, 'done', 5, ['science-fiction'], ['funny', 'inspiring']);
  add('books', 'The Hobbit', 'J.R.R. Tolkien', 1937, 'done', 4, ['fantasy', 'classics'], ['cozy', 'epic']);
  add('books', 'The Girl with the Dragon Tattoo', 'Stieg Larsson', 2005, 'want', 0, ['mystery-thriller'], ['dark']);
  add('music', 'Abbey Road', 'The Beatles', 1969, 'done', 5, ['rock', 'pop'], ['nostalgic']);
  add('music', 'Discovery', 'Daft Punk', 2001, 'active', 4, ['electronic'], ['feel-good']);
  add('movies', 'Blade Runner 2049', 'Denis Villeneuve', 2017, 'done', 5, ['sci-fi'], ['thought-provoking']);
  add('movies', 'The Grand Budapest Hotel', 'Wes Anderson', 2014, 'done', 4, ['comedy', 'indie-arthouse'], ['funny']);
  add('games', 'The Legend of Zelda: Tears of the Kingdom', 'Nintendo', 2023, 'active', 5, ['adventure', 'open-world'], ['epic']);
  add('games', 'Slay the Spire', 'Mega Crit', 2019, 'done', 4, ['roguelike', 'strategy', 'indie']);
  add('tv', 'The Expanse', 'Mark Fergus & Hawk Ostby', 2015, 'done', 5, ['sci-fi', 'drama'], ['epic', 'suspenseful']);
  add('tv', 'Parks and Recreation', 'Greg Daniels & Michael Schur', 2009, 'done', 4, ['comedy'], ['feel-good', 'funny']);
  add('streaming', 'Netflix', 'Netflix', '', 'active', 0, ['netflix']);
  add('streaming', 'Spotify', 'Spotify', '', 'active', 0, ['spotify']);
  add('social', 'r/printSF', 'Reddit community', '', 'active', 0, ['reddit', 'fan-communities']);
  Object.assign(s.interests.types, { books: 2, movies: 2, games: 2, tv: 1, music: 1, streaming: 1, social: 1 });
  Object.assign(s.interests.picks, {
    'books.genre.science-fiction': 2, 'books.genre.fantasy': 1, 'books.genre.romance': -1,
    'movies.genre.sci-fi': 2, 'movies.genre.horror': -1, 'movies.genre.indie-arthouse': 1,
    'games.genre.rpg': 2, 'games.genre.roguelike': 1, 'games.platform.nintendo-switch': 1, 'games.platform.pc': 1,
    'tv.genre.sci-fi': 2, 'tv.genre.comedy': 1, 'music.genre.electronic': 1, 'music.genre.rock': 1,
    'streaming.service.netflix': 1, 'streaming.service.spotify': 1,
    'mood.thought-provoking': 2, 'mood.funny': 1, 'mood.epic': 1,
  });
  if (!s.interests.about) s.interests.about = 'I love smart, optimistic science fiction and big worlds to explore. Not into gore.';
  s.settings.subs = [...new Set([...(s.settings.subs || []), 'netflix', 'spotify', 'switch-online', 'libby'])];
  if (!s.interests.creators) s.interests.creators = 'Andy Weir, Denis Villeneuve, Nintendo, Daft Punk';
});
