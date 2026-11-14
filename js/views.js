/* MediaCopia — page views. Each view: { render(params) → html, mount(root, params) }. */
window.MC = window.MC || {};

MC.ui = {
  type: 'all',   // the media type picked in the header; filters every page
  lib: { status: 'all', q: '', sort: 'updated' },
  disc: { tab: 'local', localQ: '' },
  cal: { view: '', at: '', past: false, finding: false, status: '', error: '', result: '', trailers: false, tStatus: '' },
  interests: { collapsed: {} },
  skipRender: false,
};
const E = MC.esc;

const spinnerLine = msg => `<div class="status-line"><div class="spinner"></div><span>${E(msg)}</span></div>`;

/* =================================================================== AI SEARCH BAR
   A sticky "Ask anything re your interests" bar on every Library category and on the Calendar.
   The last search per page (query + results) is saved in state.searches, so it's still there when you come back. */
MC.ui.aibar = {};   // scope → { loading, status, error, hidden }
/* The sticky wrapper is a direct child of the page, so it stays pinned while the whole page scrolls; results flow below it. */
const barUi = scope => (MC.ui.aibar[scope] ||= { loading: false, status: '', error: '', hidden: false });
const scopeType = scope => scope.startsWith('library:') ? scope.split(':')[1] : MC.ui.type;
/* The header's Ask bar searches upcoming drops on the Calendar and asks for recommendations everywhere else. */
MC.headScope = () => MC.route().name === 'calendar' ? 'calendar' : 'library:' + MC.ui.type;

const AIBAR_HINTS = {
  all: '“what should I start next?”, “something like my 5-star favourites”',
  books: '“a short sci-fi novel”, “what should I read next?”',
  music: '“albums like Discovery”, “new jazz worth hearing”',
  movies: '“a mind-bending film for tonight”, “best of this year so far”',
  games: '“a co-op game for two”, “something like Slay the Spire”',
  tv: '“a comedy with short episodes”, “what to watch after The Expanse”',
  streaming: '“which service has the shows I like?”, “is there a cheaper option?”',
  social: '“communities for sci-fi readers”, “creators who review games”',
  calendar: '“new Nintendo games this spring”, “when is the next Dune book?”',
};

MC.aiBar = scope => {
  const u = barUi(scope);
  const isCal = scope === 'calendar';
  const t = scopeType(scope);
  const what = isCal ? (t === 'all' ? 'upcoming drops' : `upcoming ${MC.TYPE[t].label.toLowerCase()}`) : (t === 'all' ? 'anything in your media' : MC.TYPE[t].label.toLowerCase());
  const saved = MC.state.searches[scope];
  return `<div class="aibar" data-aibar="${scope}">
    <form class="aibar-form" data-aibar-form="${scope}">
      <span class="aibar-ic" aria-hidden="true">✨</span>
      <input type="search" name="q" value="${E(u.draft ?? (saved?.recommend ? '' : saved?.query) ?? '')}" placeholder="Ask anything re your interests: ${E(AIBAR_HINTS[isCal ? 'calendar' : t] || '')}" aria-label="Ask anything re your interests (${E(what)})" ${u.loading ? 'disabled' : ''}>
      <button class="btn primary sm" ${u.loading ? 'disabled' : ''}>${u.loading ? `Asking… <span class="aibar-btnclock" data-aibar-clock="${scope}">${elapsed(u)}</span>` : 'Ask'}</button>
    </form></div>`;
};

/* Elapsed time of a running search, as m:ss. */
const elapsed = u => { const t = Math.max(0, Math.floor((Date.now() - (u.started || Date.now())) / 1000)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
/* What Claude has written so far. An item shows once its title, type and reason are in; its links and trailer follow when it's complete. */
const partialResults = scope => {
  const p = barUi(scope).partial;
  if (!p || typeof p !== 'object') return { intro: '', items: [], sig: '' };
  const isCal = scope === 'calendar';
  const list = Array.isArray(p.items) ? p.items : [];
  const items = list.map((i, idx) => {
    if (!i || typeof i !== 'object' || !i.title || !MC.TYPE[i.type] || !((isCal ? 'source_url' : 'tags') in i || idx < list.length - 1)) return null;
    const done = 'trailer_url' in i || idx < list.length - 1;
    return { ...i, done, why: MC.stripCites(i.why), where: done && Array.isArray(i.where) ? i.where : [], tags: done && Array.isArray(i.tags) ? i.tags : [], trailer_url: done ? i.trailer_url || '' : '' };
  }).filter(Boolean);
  const intro = MC.stripCites(isCal ? p.summary : p.intro);
  return { intro, items, sig: intro + '|' + items.map(i => i.title + (i.done ? '+' : '')).join('|') };
};
const loadingPanel = scope => {
  const u = barUi(scope), isCal = scope === 'calendar';
  const { intro, items } = partialResults(scope);
  const cards = !items.length ? '' : isCal
    ? `<div class="cal-items">${MC.cleanDrops(items).map(d => MC.eventCard(d, { showDate: true, actions: '' })).join('')}</div>`
    : `<div class="grid wide">${items.map((i, idx) => MC.recCard({ ...i, trailer: i.trailer_url, id: `${u.run}-${idx}`, source: 'ai' })).join('')}</div>`;
  const n = items.length;
  return `<div class="aibar-panel"><div class="status-line"><div class="spinner"></div>
      <span data-aibar-status="${scope}">${E(u.status)}</span>
      ${n ? `<span class="small muted">· ${n} ${isCal ? (n === 1 ? 'date' : 'dates') : (n === 1 ? 'pick' : 'picks')} so far</span>` : ''}
      <span class="aibar-clock" data-aibar-clock="${scope}" title="Time since the search started">${elapsed(u)}</span></div>
    ${intro || cards ? `<div class="aibar-live">${intro ? `<p class="intro">${E(intro)}</p>` : ''}${cards}</div>` : ''}</div>`;
};

MC.aiBarResults = scope => {
  const u = barUi(scope);
  const saved = MC.state.searches[scope];
  if (u.loading) return loadingPanel(scope);
  if (u.error) return `<div class="aibar-panel"><div class="notice error">${E(u.error)} <button class="btn sm ghost" data-action="aibar-dismiss" data-scope="${scope}">Dismiss</button></div></div>`;
  if (!saved) return '';
  const head = `<div class="aibar-head">
    <span class="small muted grow">${saved.recommend ? `★ ${saved.offline ? 'Offline recommendations' : 'Claude’s recommendations'} for you` : `${saved.offline ? 'Offline results' : 'Claude'} for “${E(saved.query)}”`} · ${E(new Date(saved.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}${saved.secs ? ` · took ${saved.secs < 60 ? saved.secs + 's' : `${Math.floor(saved.secs / 60)}m ${saved.secs % 60}s`}` : ''}</span>
    <button class="btn sm ghost" data-action="aibar-toggle" data-scope="${scope}">${u.hidden ? 'Show' : 'Hide'}</button>
    <button class="btn sm ghost" data-action="aibar-clear" data-scope="${scope}">Clear</button></div>`;
  if (u.hidden) return `<div class="aibar-panel">${head}</div>`;
  let body = '';
  if (scope === 'calendar') {
    if (saved.offline) {
      const words = saved.query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      const hits = MC.allEvents().filter(e => saved.recommend
        ? e.date >= MC.today() && (MC.ui.type === 'all' || e.type === MC.ui.type)
        : words.some(w => `${e.title} ${e.creator} ${e.notes}`.toLowerCase().includes(w)));
      body = `<div class="notice" style="margin-bottom:10px">No Claude API key, so this only searched what’s already on your calendar. <a href="#/settings">Add a key</a> to search the web for new drops.</div>
        ${hits.length ? `<div class="cal-items">${hits.map(e => MC.eventCard(e, { showDate: true })).join('')}</div>` : '<p class="small muted">Nothing on your calendar matches.</p>'}`;
    } else {
      const missing = saved.items.filter(d => !onCalendar(d));
      body = `${saved.summary ? `<p class="intro">${E(saved.summary)}</p>` : ''}
        ${saved.items.length ? `<div class="cal-items">${saved.items.map((d, i) => calResultRow(scope, d, i)).join('')}</div>
          ${missing.length > 1 ? `<button class="btn sm" style="margin-top:10px" data-action="aibar-add-all" data-scope="${scope}">+ Add all ${missing.length} to calendar</button>` : ''}`
          : '<p class="small muted">No upcoming dates found for that.</p>'}
        ${sourcesLine(saved.sources)}`;
    }
  } else if (saved.offline) {
    const o = { text: saved.query, ...MC.localRecommend({ query: saved.recommend ? '' : saved.query, type: scopeType(scope), limit: 8 }) };
    body = `<div class="notice" style="margin-bottom:10px">No Claude API key, so these come from the offline catalog. <a href="#/settings">Add a key</a> for open-ended, up-to-date answers.</div>${MC.renderLocalGrid(o.results)}`;
  } else {
    const ask = MC.state.asks.find(a => a.id === saved.askId);
    body = ask ? `${ask.intro ? `<p class="intro">${E(ask.intro)}</p>` : ''}
      ${ask.items.length ? `<div class="grid wide">${ask.items.map(i => MC.recCard({ ...i, source: 'ai' })).join('')}</div>` : ''}
      ${sourcesLine(ask.sources)}` : '<p class="small muted">These results were deleted from your Discover history.</p>';
  }
  return `<div class="aibar-panel">${head}${body}</div>`;
};

const sourcesLine = sources => sources?.length
  ? `<div class="sources">Sources: ${sources.map(s => MC.safeUrl(s.url) ? `<a href="${E(s.url)}" target="_blank" rel="noopener">${E((s.title || s.url).slice(0, 60))}</a>` : '').join('')}</div>` : '';
const onCalendar = d => MC.allEvents().some(e => e.date === d.date && MC.titleKey(e.title) === MC.titleKey(d.title));
const calResultRow = (scope, d, i) => MC.eventCard(d, { showDate: true, actions: onCalendar(d)
  ? '<span class="pill ok">✓ On your calendar</span>'
  : `<button class="btn sm primary" data-action="aibar-add-drop" data-scope="${scope}" data-i="${i}">+ Add to calendar</button>${MC.safeUrl(d.link) ? `<a class="btn sm ghost" href="${E(d.link)}" target="_blank" rel="noopener">Source ↗</a>` : ''}` });

MC.runAiBar = async (scope, query, { recommend = false } = {}) => {
  const u = barUi(scope);
  if (u.loading || !query) return;
  const type = scopeType(scope);
  Object.assign(u, { error: '', hidden: false, draft: recommend ? '' : query });
  if (!MC.hasKey()) {
    u.draft = undefined;
    MC.update(s => { s.searches[scope] = { query, at: new Date().toISOString(), offline: true, recommend }; });
    return;
  }
  Object.assign(u, { loading: true, status: 'Starting…', started: Date.now(), partial: null, run: MC.uid() }); MC.render(); window.scrollTo(0, 0);
  const onStatus = msg => { u.status = msg; const el = document.querySelector(`[data-aibar-status="${scope}"]`); if (el) el.textContent = msg; };
  // Running clock, in the status line and on the Ask button.
  const clock = setInterval(() => document.querySelectorAll(`[data-aibar-clock="${scope}"]`).forEach(el => { el.textContent = elapsed(u); }), 1000);
  // Show results as Claude writes them: redraw only the results panel, at most a few times a second, and only when something new is ready.
  let pending = 0, shown = '';
  const onPartial = snap => {
    u.partial = snap;
    if (pending) return;
    pending = setTimeout(() => {
      pending = 0;
      if (!u.loading) return;
      const { sig } = partialResults(scope);
      const panel = document.querySelector('[data-aipanel]');
      if (sig === shown || !panel || MC.headScope() !== scope) return;
      shown = sig; panel.innerHTML = MC.aiBarResults(scope);
    }, 250);
  };
  const secs = () => Math.round((Date.now() - u.started) / 1000);
  const finish = () => { clearInterval(clock); clearTimeout(pending); pending = 0; u.partial = null; };
  try {
    if (scope === 'calendar') {
      const r = await MC.aiSearchDrops(query, { type, onStatus, onPartial, quick: !recommend });
      finish(); Object.assign(u, { loading: false, draft: undefined });
      MC.update(s => { s.searches[scope] = { query, at: new Date().toISOString(), recommend, secs: secs(), ...r }; });
    } else {
      const context = type === 'all' ? 'I am browsing all my media.' : `I am browsing ${MC.TYPE[type].label}.`;
      const ask = await MC.aiRecommend(query, { type, onStatus, onPartial, context, quick: !recommend });
      finish(); Object.assign(u, { loading: false, draft: undefined });
      MC.update(s => { s.searches[scope] = { query, at: new Date().toISOString(), askId: ask.id, recommend, secs: secs() }; });
    }
  } catch (e) {
    finish(); Object.assign(u, { loading: false, error: e.message || String(e) }); MC.render();
  }
};

MC.mountAiBar = root => root.querySelectorAll('[data-aibar-form]').forEach(f => f.onsubmit = e => {
  e.preventDefault();
  MC.runAiBar(f.dataset.aibarForm, f.elements.q.value.trim());
});
MC.actions['aibar-clear'] = el => {
  const scope = el.dataset.scope; Object.assign(barUi(scope), { error: '', hidden: false, draft: undefined });
  MC.update(s => { delete s.searches[scope]; });
};
MC.actions['aibar-dismiss'] = el => { barUi(el.dataset.scope).error = ''; MC.render(); };
MC.actions['aibar-toggle'] = el => { const u = barUi(el.dataset.scope); u.hidden = !u.hidden; MC.render(); };
MC.actions['aibar-add-drop'] = el => {
  const d = MC.state.searches[el.dataset.scope]?.items?.[+el.dataset.i]; if (!d) return;
  MC.addDrop({ ...d, origin: 'ai' }); MC.toast(`Added “${d.title}” to your calendar`);
};
MC.actions['aibar-add-all'] = el => {
  const items = (MC.state.searches[el.dataset.scope]?.items || []).filter(d => !onCalendar(d));
  items.forEach(d => MC.addDrop({ ...d, origin: 'ai' }));
  MC.toast(`Added ${items.length} drops to your calendar`);
};

/* =================================================================== HEADER
   One sticky header on every page: media-type chips (shared by all pages), the page's buttons, the theme switch and the Ask bar.
   Pages scroll under it; the sidebar stays put. */
MC.pageActions = name => {
  const share = what => `<button class="btn" data-action="share-list" data-what="${what}" title="Share or export this list">Share</button>`;
  if (name === 'library' || name === 'watchlist') return `${share(name)}<button class="btn" data-action="bulk-add">Quick add list</button><button class="btn primary" data-action="add-item">+ Add</button>`;
  if (name === 'home') return `<button class="btn" data-action="bulk-add">Quick add list</button><button class="btn primary" data-action="add-item">+ Add</button>`;
  if (name === 'calendar') {
    const c = MC.ui.cal;
    return `${share('calendar')}<button class="btn" data-action="export-ics">Export .ics</button><button class="btn" data-action="add-drop">+ Add drop</button>
      <button class="btn primary" data-action="find-drops" ${c.finding ? 'disabled' : ''}>${c.finding ? 'Searching…' : '✨ Find upcoming drops'}</button>`;
  }
  if (name === 'discover') {
    const d = MC.ui.disc;
    return `<div class="tabs"><button class="${d.tab !== 'history' ? 'active' : ''}" data-action="disc-tab" data-tab="local">For you</button><button class="${d.tab === 'history' ? 'active' : ''}" data-action="disc-tab" data-tab="history">History <span class="muted">${MC.state.asks.length || ''}</span></button></div>`;
  }
  return '';
};
const themeToggle = () => {
  const dark = MC.effectiveTheme() === 'dark';
  const label = `Switch to ${dark ? 'light' : 'dark'} mode`;
  return `<button class="theme-toggle" data-action="toggle-theme" type="button" aria-label="${label}" title="${label}">
    <svg class="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
    <svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 1.5v2.5M12 20v2.5M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M1.5 12H4M20 12h2.5M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8"/></svg>
    <span class="theme-label">${dark ? 'Light mode' : 'Dark mode'}</span></button>`;
};
/* What you've configured per media type: interests ticked (incl. your own), subscriptions, saved items. Used by the header tiles. */
const STREAM_GROUPS = ['video', 'cable', 'music', 'free', 'library'];
MC.typeSubs = key => key === 'all' ? MC.mySubs()
  : key === 'streaming' ? MC.SERVICE_GROUPS.filter(g => STREAM_GROUPS.includes(g.key)).flatMap(g => g.services).filter(sv => MC.hasSub(sv.id))
  : MC.mySubs().filter(sv => sv.types.includes(key));
MC.typeInterests = key => {
  const picks = Object.entries(MC.state.interests.picks).filter(([k, v]) => v > 0 && (key === 'all' || k.startsWith(key + '.')))
    .map(([k, v]) => { const [t, g, o] = k.split('.'); return { label: t === 'mood' ? MC.optionLabel('', 'mood', g) : MC.optionLabel(t, g, o), v, type: t }; });
  const custom = Object.entries(MC.state.interests.custom || {}).filter(([cat]) => key === 'all' || cat === key)
    .flatMap(([cat, list]) => (list || []).filter(c => c.v > 0).map(c => ({ label: c.label, v: c.v, own: true, type: cat })));
  return [...picks, ...custom];
};
MC.typeCounts = key => ({
  interests: MC.typeInterests(key).length,
  subs: MC.typeSubs(key).length,
  saved: MC.state.library.filter(i => key === 'all' || i.type === key).length,
});
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const ALL_TYPE = { key: 'all', label: 'All', icon: '✦' };
/* The category tiles in the persistent header. Clicking one filters the page you're on. */
const catStrip = current => `<div class="cat-strip${current !== 'all' ? ' has-on' : ''}">
  ${[ALL_TYPE, ...MC.TYPES].map(t => {
    const n = MC.typeCounts(t.key);
    const meta = [n.subs ? plural(n.subs, 'sub') : '', n.saved ? `${n.saved} saved` : ''].filter(Boolean).join(' · ') || (t.key === 'all' ? 'everything' : 'nothing set yet');
    const tip = `${t.label}: ${plural(n.interests, 'interest')} ticked, ${plural(n.subs, 'subscription')}, ${n.saved} saved`;
    return `<button class="cat-chip${current === t.key ? ' on' : ''}${t.key === 'all' ? ' all' : ''}" type="button" data-action="head-type" data-type="${t.key}" ${t.key === 'all' ? '' : MC.typeStyle(t.key)} aria-pressed="${current === t.key}" title="${E(tip)}">
      ${t.key === 'all' ? '' : MC.typeArt(t.key)}<span class="cc-top"><b class="cc-num">${n.interests}</b><span class="cc-lbl">${t.icon} ${E(t.label)}</span></span><span class="cc-meta">${E(meta)}</span></button>`;
  }).join('')}</div>`;
/* On narrow screens the category tiles scroll sideways: a mouse wheel scrolls them too, faded edges show there's more,
   and the scroll position survives the header being redrawn (the picked tile is brought into view). */
const mountCatStrip = el => {
  const strip = el.querySelector('.cat-strip');
  if (!strip) return;
  const fades = () => {
    const more = strip.scrollWidth - strip.clientWidth > 2;
    strip.classList.toggle('fade-l', more && strip.scrollLeft > 8);
    strip.classList.toggle('fade-r', more && strip.scrollLeft < strip.scrollWidth - strip.clientWidth - 8);
  };
  const ui = MC.ui;
  strip.scrollLeft = ui.catScroll || 0;
  if (ui.catTypeShown !== ui.type) {
    ui.catTypeShown = ui.type;
    const on = strip.querySelector('.cat-chip.on');
    if (on && strip.scrollWidth > strip.clientWidth) {
      const l = on.offsetLeft - strip.offsetLeft, r = l + on.offsetWidth;
      if (l < strip.scrollLeft || r > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = Math.max(0, l - (strip.clientWidth - on.offsetWidth) / 2);
    }
  }
  strip.addEventListener('scroll', () => { ui.catScroll = strip.scrollLeft; fades(); }, { passive: true });
  strip.addEventListener('wheel', e => {
    if (strip.scrollWidth <= strip.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    const max = strip.scrollWidth - strip.clientWidth;
    if ((e.deltaY < 0 && strip.scrollLeft <= 0) || (e.deltaY > 0 && strip.scrollLeft >= max)) return;   // at the end: let the page scroll
    e.preventDefault();
    strip.scrollLeft += e.deltaY;
  }, { passive: false });
  fades();
  requestAnimationFrame(fades);
};
MC.renderHeader = name => {
  const el = document.getElementById('apphead');
  if (!el) return;
  // Keep whatever is being typed in the Ask bar across re-renders.
  const old = el.querySelector('[data-aibar-form] input');
  const typing = old && document.activeElement === old ? { v: old.value, a: old.selectionStart, b: old.selectionEnd } : null;
  el.innerHTML = `<div class="apphead-in">
    <a class="hero-brand" href="#/home" aria-label="MediaCopia home">
      <img class="hero-logo" src="assets/logo.svg?v=2" alt="" width="133" height="133">
      <span class="hero-words"><span class="wordmark">MediaCopia</span><span class="tagline">My Media My Way</span></span>
    </a>
    <div class="apphead-row">
      ${catStrip(MC.ui.type)}
      <button class="sync-btn" data-action="open-sync" type="button" data-state="off" aria-label="Sync"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 18h10a4.5 4.5 0 0 0 .5-8.97A6 6 0 0 0 6.1 10.6 3.75 3.75 0 0 0 7 18z"/></svg><i class="sync-dot"></i></button>
      ${themeToggle()}
    </div>
    <div class="apphead-ask">
      ${MC.aiBar(MC.headScope())}
      <button class="btn recommend-btn" data-action="recommend" ${barUi(MC.headScope()).loading ? 'disabled' : ''} title="Personal picks from your interests, subscriptions and library" aria-label="Recommend">★<span class="reco-label"> Recommend</span></button>
      ${MC.pageActions(name) ? `<div class="apphead-actions desk-only">${MC.pageActions(name)}</div>` : ''}
    </div>
  </div>`;
  MC.mountAiBar(el);
  mountCatStrip(el);
  MC.lock?.paint();   // the sync button's state
  const chip = el.querySelector('.cat-chip:not(.all)');   // the header logo is as wide as one category tile
  if (chip?.offsetWidth) document.documentElement.style.setProperty('--cat-w', chip.offsetWidth + 'px');
  const input = el.querySelector('[data-aibar-form] input');
  if (typing && input && !input.disabled) { input.value = typing.v; input.focus(); input.setSelectionRange(typing.a, typing.b); }
};
/* ★ Recommend: personal picks for the chosen media type, no typing needed. On the Calendar: upcoming releases you'd love. */
const RECO_WHAT = { all: '', books: 'books', music: 'music', movies: 'movies', games: 'games', tv: 'TV shows', streaming: 'streaming services and channels', social: 'creators, accounts and communities' };
MC.actions.recommend = () => {
  const scope = MC.headScope(), what = RECO_WHAT[scopeType(scope)] || '';
  const query = scope === 'calendar'
    ? `What upcoming ${what || 'releases'} coming out in the next few months would I love? Use my interests, favourite creators and subscriptions.`
    : `Recommend ${what || 'things across my media'} I’ll love right now, based on my interests, subscriptions, ratings and library. Mix sure bets with a few discoveries.`;
  MC.runAiBar(scope, query, { recommend: true });
};
MC.actions['head-type'] = el => {
  MC.ui.type = el.dataset.type; MC.ui.lib.status = 'all';
  // A header tile clicked in Settings leaves Settings for the page you came from, showing that type.
  if (MC.route().name === 'settings' && el.classList.contains('cat-chip')) {
    const back = MC.ui.beforeSettings || '#/home';
    location.hash = back.startsWith('#/library') ? '#/library/' + el.dataset.type : back;
  } else if (MC.route().name === 'library') location.hash = '#/library/' + el.dataset.type; else MC.render();
};
/* =================================================================== HOME */
MC.views = {};
/* Home, with a category tile picked: what you've set up for it, so the number on the tile has something to show. */
/* Summary of what's set up for a media type (or All). Shown at the top of the Interests page, not on Home. */
MC.typeOverview = key => {
  const all = key === 'all', t = all ? { label: 'MediaCopia' } : MC.TYPE[key];
  const ints = MC.typeInterests(key), subs = MC.typeSubs(key), saved = MC.state.library.filter(i => all || i.type === key).length;
  const heart = v => v === 2 ? ' ♥♥' : ' ♥';
  const chips = list => `<div class="chips">${list.map(i => `<span class="chip sm${i.v === 2 ? ' love' : ''}${i.own ? ' own' : ''}">${E(i.label)}<span class="lvl">${heart(i.v)}</span></span>`).join('')}</div>`;
  // With All picked, the interests are grouped by category so the total on the All tile adds up visibly.
  const groups = all ? [{ key: 'mood', label: 'Moods & themes', icon: '✨' }, ...MC.TYPES]
    .map(g => ({ g, list: ints.filter(i => i.type === g.key) })).filter(x => x.list.length) : [];
  const interests = !ints.length ? `<p class="muted small">None ticked yet. <a href="#/interests">Open the checklist</a> to add some.</p>`
    : all ? `<div class="to-groups">${groups.map(({ g, list }) => `<div class="to-group" ${g.key === 'mood' ? '' : MC.typeStyle(g.key)}>
        <div class="to-glabel">${g.icon} ${E(g.label)} <span class="muted">${list.length}</span></div>${chips(list)}</div>`).join('')}</div>`
    : chips(ints);
  return `<div class="section card type-overview${all ? ' all' : ''}" ${all ? '' : MC.typeStyle(key)}>
    <div class="to-head">${all ? '<img class="to-logo" src="assets/favicon.svg?v=1" alt="">' : MC.typeArt(key)}<div><h2>${all ? 'Everything you’ve set up' : `Your ${E(t.label)}`}</h2>
      <p class="muted small">${plural(ints.length, 'interest')} · ${plural(subs.length, 'subscription')} · ${saved} saved</p></div>
      <div class="row to-links">${all ? '<a class="btn sm" href="#/settings">Subscriptions</a>' : ''}<a class="btn sm" href="#/library${all ? '' : '/' + key}">Library${saved ? ` (${saved})` : ''} →</a></div></div>
    <div class="to-block"><h4>Interests</h4>${interests}</div>
    <div class="to-block"><h4>Subscriptions</h4>${subs.length
      ? `<div class="to-subs">${subs.map(sv => `<a class="to-sub" href="${E(sv.url)}" target="_blank" rel="noopener" title="Open ${E(sv.name)}">${MC.logoTile({ svc: sv, size: 'sm' })}<span>${E(sv.name)}</span></a>`).join('')}</div>`
      : `<p class="muted small">No ${all ? '' : E(t.label.toLowerCase()) + ' '}services ticked. <a href="#/settings">Add them in Settings</a>.</p>`}</div>
  </div>`;
};
MC.views.home = {
  render() {
    const s = MC.state;
    const hour = new Date().getHours();
    const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const ty = MC.ui.type, ofType = x => ty === 'all' || x.type === ty;
    const upcoming = MC.allEvents().filter(e => e.date >= MC.today() && ofType(e)).slice(0, 6);
    const active = s.library.filter(i => i.status === 'active' && ofType(i) && (ty !== 'all' || !['streaming', 'social'].includes(i.type))).slice(0, 6);
    const recs = MC.localRecommend({ limit: 6, type: ty }).results;
    const hasPicks = Object.keys(s.interests.picks).length > 0 || MC.customCount() > 0;
    const steps = [
      { done: hasPicks, href: '#/interests', label: 'Tick what you’re into on the interest checklist' },
      { done: s.library.length > 0, href: '#/library', label: 'Add a few favourites to your library (and rate them)' },
      { done: MC.hasKey(), href: '#/settings', label: 'Optional: add a Claude API key for live, AI picks' },
      { done: s.drops.length > 0, href: '#/calendar', label: 'Find upcoming drops for your calendar' },
    ];
    const showOnboard = steps.filter(x => x.done).length < 3;
    return `
    <div class="page-head"><div class="home-head"><h1>${greet}</h1><p class="muted">${E(new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }))} · Everything you want to watch, read, hear, play and follow.</p></div>
      <div class="row phone-only">${MC.pageActions('home')}</div></div>

    ${ty === 'tv' ? MC.liveTV() : ''}

    ${showOnboard ? `<div class="section card pad onboard">
      <div class="section-head" style="margin:0"><h2>Get MediaCopia set up</h2>${s.library.length ? '' : '<button class="btn sm" data-action="load-sample">Load sample data</button>'}</div>
      ${steps.map((x, i) => `<a class="step ${x.done ? 'done' : ''}" href="${x.href}"><span class="n">${x.done ? '✓' : i + 1}</span><span>${E(x.label)}</span></a>`).join('')}
    </div>` : ''}

    <div class="section">
      <div class="section-head"><h2>Coming up</h2><a class="btn sm ghost" href="#/calendar">Calendar →</a></div>
      ${upcoming.length ? `<div class="agenda cols">${upcoming.map(MC.eventRow).join('')}</div>`
        : `<div class="empty" style="padding:22px"><div>No drops tracked yet.</div><a class="btn sm" href="#/calendar">Find upcoming releases</a></div>`}
    </div>

    ${active.length ? `<div class="section"><div class="section-head"><h2>In progress</h2><a class="btn sm ghost" href="#/library">Library →</a></div>
      <div class="grid">${active.map(MC.itemCard).join('')}</div></div>` : ''}

    <div class="section"><div class="section-head"><h2>Picked for you</h2><a class="btn sm ghost" href="#/discover">More picks →</a></div>
      ${recs.length ? `<div class="grid">${recs.map(r => MC.recCard({ ...r.item, reasons: r.reasons, source: 'offline' })).join('')}</div>`
        : `<div class="empty"><div class="big">✨</div><h3>Tell us what you like</h3><p>Tick a few genres and moods and picks appear here.</p><a class="btn primary" href="#/interests">Open the checklist</a></div>`}
    </div>`;
  },
  mount(root) { if (MC.ui.type === 'tv') MC.liveTVMount(root); },   // 📡 On Live TV Now (js/livetv.js)
};
MC.actions['add-item'] = el => MC.openItemEditor(MC.newItem({ type: el.dataset.type || (MC.ui.type !== 'all' ? MC.ui.type : 'books') }), { isNew: true });
MC.actions['bulk-add'] = () => MC.openBulkAdd(MC.ui.type !== 'all' ? MC.ui.type : 'books');
MC.actions['load-sample'] = () => { MC.loadSample(); MC.toast('Sample data loaded — explore away.'); };

/* =================================================================== LIBRARY */
MC.libraryResults = () => {
  const u = MC.ui.lib;
  const q = u.q.toLowerCase();
  let list = MC.state.library.filter(i => (MC.ui.type === 'all' || i.type === MC.ui.type) && (u.status === 'all' || i.status === u.status) &&
    (!q || [i.title, i.creator, i.notes, i.place, ...(i.genres || []).map(MC.labelForAnyTag)].join(' ').toLowerCase().includes(q)));
  const sorters = {
    updated: (a, b) => (b.updatedAt || b.addedAt).localeCompare(a.updatedAt || a.addedAt),
    title: (a, b) => a.title.localeCompare(b.title),
    rating: (a, b) => b.rating - a.rating || a.title.localeCompare(b.title),
    year: (a, b) => (b.year || '').localeCompare(a.year || ''),
  };
  return list.sort(sorters[u.sort] || sorters.updated);
};
MC.renderLibraryGrid = () => {
  const list = MC.libraryResults();
  if (!MC.state.library.length) return `<div class="empty"><div class="big">🗂️</div><h3>Your library is empty</h3>
    <p>Add the books, albums, films, games, shows, services and accounts you love — or have on your list.</p>
    <div class="row" style="justify-content:center"><button class="btn primary" data-action="add-item">+ Add something</button><button class="btn" data-action="bulk-add">Quick add a list</button><button class="btn ghost" data-action="load-sample">Load sample data</button></div></div>`;
  if (!list.length) return `<div class="empty"><h3>Nothing matches</h3><p>Try another filter or search.</p></div>`;
  return `<div class="grid">${list.map(MC.itemCard).join('')}</div>`;
};
MC.views.library = {
  render(params) {
    if (params[0] && (MC.TYPE[params[0]] || params[0] === 'all')) MC.ui.type = params[0];
    const u = MC.ui.lib, ty = MC.ui.type;
    const statusLabels = ty !== 'all' ? MC.TYPE[ty].status : { want: 'Want / backlog', active: 'In progress / following', done: 'Finished', dropped: 'Dropped' };
    return `
    <div class="page-head"><div><h1>Library</h1><p class="muted">Everything in one place. Click any card to edit, rate or tag it.</p></div>
      <div class="row phone-only">${MC.pageActions('library')}</div></div>
    ${MC.categoryBanner(ty)}
    <div class="toolbar">
      <input class="search" type="search" placeholder="Filter your library — titles, creators, tags…" value="${E(u.q)}" data-lib-search>
      <select data-lib-status><option value="all">Any status</option>${MC.STATUSES.map(s => `<option value="${s}" ${u.status === s ? 'selected' : ''}>${E(statusLabels[s])}</option>`).join('')}</select>
      <select data-lib-sort>${[['updated', 'Recently updated'], ['title', 'Title A–Z'], ['rating', 'Highest rated'], ['year', 'Newest']].map(([v, l]) => `<option value="${v}" ${u.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
    </div>
    <div data-lib-results>${MC.renderLibraryGrid()}</div>`;
  },
  mount(root) {
    const refresh = () => { root.querySelector('[data-lib-results]').innerHTML = MC.renderLibraryGrid(); };
    root.querySelector('[data-lib-search]').oninput = e => { MC.ui.lib.q = e.target.value; refresh(); };
    root.querySelector('[data-lib-status]').onchange = e => { MC.ui.lib.status = e.target.value; refresh(); };
    root.querySelector('[data-lib-sort]').onchange = e => { MC.ui.lib.sort = e.target.value; refresh(); };
  },
};
/* =================================================================== WATCHLIST
   Everything on your list to watch, read, hear or play: library items with the first status (Watchlist, Want to read, Backlog…),
   newest first, grouped by media type. Follows the header's category tiles. */
MC.views.watchlist = {
  render() {
    const ty = MC.ui.type;
    const list = MC.state.library.filter(i => i.status === 'want' && (ty === 'all' || i.type === ty))
      .sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''));
    const groups = MC.TYPES.map(t => ({ t, items: list.filter(i => i.type === t.key) })).filter(g => g.items.length);
    const what = ty === 'all' ? '' : ` ${MC.TYPE[ty].label.toLowerCase()}`;
    const body = !list.length
      ? `<div class="empty"><div class="big">🔖</div><h3>Nothing${E(what)} on your watchlist yet</h3>
          <p>Press <b>+ Watchlist</b> on any recommendation, or add something and set its status to Watchlist, Want to read, Want to hear or Backlog.</p>
          <div class="row" style="justify-content:center"><button class="btn primary" data-action="recommend">★ Get recommendations</button><button class="btn" data-action="add-item">+ Add</button></div></div>`
      : groups.map(({ t, items }) => `<section class="section wl-group" ${MC.typeStyle(t.key)}>
          <div class="section-head"><h2>${t.icon} ${E(t.label)} <span class="muted">· ${E(t.status.want)} · ${items.length}</span></h2>
            <a class="btn sm ghost" href="#/library/${t.key}">Open in Library →</a></div>
          <div class="grid">${items.map(MC.itemCard).join('')}</div></section>`).join('');
    return `
    <div class="page-head"><div><h1>Watchlist</h1><p class="muted">${list.length ? `${list.length} ${list.length === 1 ? 'thing' : 'things'}` : 'Things'} you want to watch, read, hear or play next. Click a card to start it, rate it or move it along.</p></div>
      <div class="row phone-only">${MC.pageActions('watchlist')}</div></div>
    ${body}`;
  },
};

/* Category banner: the type's artwork and colour, a status summary and a shelf of recent covers. */
MC.categoryBanner = type => {
  const all = type === 'all';
  const t = MC.TYPE[type];
  const items = MC.state.library.filter(i => all || i.type === type);
  const recent = [...items].sort((a, b) => (b.updatedAt || b.addedAt).localeCompare(a.updatedAt || a.addedAt)).slice(0, 7);
  const summary = all
    ? MC.TYPES.map(x => [x, MC.state.library.filter(i => i.type === x.key).length]).filter(([, n]) => n).map(([x, n]) => `${x.icon} ${n}`).join(' · ')
    : MC.STATUSES.map(st => [st, items.filter(i => i.status === st).length]).filter(([, n]) => n).map(([st, n]) => `${n} ${E(t.status[st].toLowerCase())}`).join(' · ');
  return `<div class="cat-banner${all ? ' all' : ''}" ${all ? '' : MC.typeStyle(type)}>
    ${all ? `<div class="cat-arts">${MC.TYPES.map(x => `<span ${MC.typeStyle(x.key)}>${MC.typeArt(x.key)}</span>`).join('')}</div>` : MC.typeArt(type, 'big')}
    <div class="cat-text">
      <div class="cat-kicker">${all ? 'Your whole library' : 'Library'}</div>
      <h2>${all ? 'All media' : `${t.icon} ${E(t.label)}`}</h2>
      <p>${items.length} ${items.length === 1 ? 'item' : 'items'}${summary ? ` · ${summary}` : ''}</p>
    </div>
    ${recent.length ? `<div class="cat-shelf">${recent.map(i => `<button class="shelf-item" data-action="edit-item" data-id="${i.id}" title="${E(i.title)}">${MC.thumb(i, 'sm')}</button>`).join('')}</div>` : ''}
  </div>`;
};

/* =================================================================== INTERESTS */
const levelSeg = (current, attrs) => `<div class="level-seg" role="group">
  ${[[-1, 'Not for me'], [0, '—'], [1, 'Into it'], [2, 'Obsessed']].map(([v, l]) => `<button class="${current === v ? 'active' : ''}" data-v="${v}" ${attrs}>${l}</button>`).join('')}</div>`;
const pickChip = (key, label) => {
  const v = MC.getPick(key);
  const lv = MC.LEVELS.find(l => l.v === v);
  return `<button class="chip" data-action="pick" data-key="${key}" data-level="${v}" title="${E(lv.label)} — click to change">${E(label)}${lv.short ? ` <span class="lvl">${lv.short}</span>` : ''}</button>`;
};
/* "Your own" row: the user's specific interests for a category, as cyclable chips plus an add box. */
MC.CUSTOM_HINTS = {
  mood: 'e.g. found family, underdog stories, rainy-day vibes',
  books: 'e.g. Discworld, cozy Japanese mysteries, Cormac McCarthy',
  music: 'e.g. 70s Laurel Canyon folk, city pop, Radiohead side projects',
  movies: 'e.g. A24 horror, heist films, Studio Ghibli',
  games: 'e.g. Soulslikes, Zelda series, cozy farming sims',
  tv: 'e.g. Taskmaster, prestige crime dramas, Star Trek',
  streaming: 'e.g. Criterion Channel, NTS Radio, Twitch speedruns',
  social: 'e.g. r/booksuggestions, BookTok, Bluesky science accounts',
};
const customChip = (cat, c) => {
  const lv = MC.LEVELS.find(l => l.v === c.v) || MC.LEVELS[1];
  return `<button class="chip custom" data-action="custom-pick" data-cat="${cat}" data-id="${c.id}" data-level="${c.v}" title="${E(lv.label)}. Click to change, × or Delete to remove">${E(c.label)}${lv.short ? ` <span class="lvl">${lv.short}</span>` : ''}<span class="chip-x" data-action="custom-remove" data-cat="${cat}" data-id="${c.id}" aria-hidden="true">×</span></button>`;
};
const customGroup = (cat, label) => {
  const list = MC.customFor(cat);
  return `<div class="group custom-group"><h4>Your own ${E(label)}</h4>
    ${list.length ? `<div class="chips" style="margin-bottom:8px">${list.map(c => customChip(cat, c)).join('')}</div>` : ''}
    <form class="custom-add" data-custom-form="${cat}">
      <input type="text" data-custom-input="${cat}" maxlength="400" placeholder="${E(MC.CUSTOM_HINTS[cat] || 'Add something specific')}" aria-label="Add your own ${E(label)}">
      <button class="btn sm" type="submit">Add</button>
    </form></div>`;
};

MC.views.interests = {
  render() {
    const s = MC.state;
    const n = Object.keys(s.interests.picks).length + MC.customCount();
    return `
    <div class="page-head"><div><h1>Interests</h1><p class="muted">Your taste checklist. Click a tag to cycle: like → love → avoid → clear. Add anything specific under “Your own”. ${n ? `<b>${n}</b> picked.` : ''}</p></div>
      <div class="legend"><span class="chip" data-level="1">Like ♥</span><span class="chip" data-level="2">Love ♥♥</span><span class="chip" data-level="-1">Avoid ✕</span></div></div>

    ${n ? MC.typeOverview(MC.ui.type) : ''}

    <div class="card pad" style="display:grid;gap:12px">
      <h2>In your own words</h2>
      <label class="field">What do you love, what are you in the mood for, what do you never want to see?
        <textarea data-about rows="3" placeholder="e.g. I love clever heist stories and big-world RPGs. Lately I’m into 70s soul. No gore, please.">${E(s.interests.about)}</textarea></label>
      <label class="field">Creators to track for new drops (comma separated)
        <input type="text" data-creators value="${E(s.interests.creators)}" placeholder="e.g. Christopher Nolan, Taylor Swift, FromSoftware, Brandon Sanderson"></label>
    </div>

    <div class="section card type-section">
      <div class="type-head"><div class="cat-ic" style="--type:var(--accent)">${MC.typeArt('social')}<span>🎭</span></div><h2>Moods & themes <span class="small muted">(all media)</span></h2></div>
      <div class="group"><div class="chips">${MC.MOODS.map(o => pickChip(MC.moodKey(o.key), o.label)).join('')}</div></div>
      ${customGroup('mood', 'moods & themes')}
    </div>

    <div class="section">${MC.TYPES.filter(t => MC.ui.type === 'all' || t.key === MC.ui.type).map(t => {
      const lvl = MC.getTypeLevel(t.key);
      const collapsed = MC.ui.interests.collapsed[t.key] ?? lvl === -1;
      const groupCount = Object.keys(s.interests.picks).filter(k => k.startsWith(t.key + '.')).length + MC.customFor(t.key).length;
      return `<div class="card type-section ${collapsed ? 'collapsed' : ''}" ${MC.typeStyle(t.key)}>
        <div class="type-head">
          <div class="cat-ic">${MC.typeArt(t.key)}<span>${t.icon}</span></div>
          <h2>${t.label} ${groupCount ? `<span class="pill accent">${groupCount}</span>` : ''}</h2>
          ${levelSeg(lvl, `data-action="type-level" data-type="${t.key}"`)}
          <button class="btn sm ghost" data-action="toggle-type" data-type="${t.key}">${collapsed ? 'Show' : 'Hide'}</button>
        </div>
        ${(MC.TAXONOMY[t.key] || []).map(g => `<div class="group"><h4>${E(g.label)}${t.key === 'streaming' && g.key === 'service' ? ' <a class="tiny" style="text-transform:none;letter-spacing:0" href="#/settings">· tick paid subscriptions in Settings</a>' : ''}</h4><div class="chips">${g.options.map(o => pickChip(MC.pickKey(t.key, g.key, o.key), o.label)).join('')}</div></div>`).join('')}
        ${customGroup(t.key, t.label.toLowerCase() + ' interests')}
      </div>`;
    }).join('')}</div>`;
  },
  mount(root) {
    root.querySelector('[data-about]').onchange = e => MC.update(s => { s.interests.about = e.target.value; });
    root.querySelector('[data-creators]').onchange = e => MC.update(s => { s.interests.creators = e.target.value; });
    root.querySelectorAll('[data-custom-form]').forEach(form => form.onsubmit = e => {
      e.preventDefault();
      const cat = form.dataset.customForm;
      const input = form.querySelector('input');
      const labels = input.value.split(/[,;\n]+/);
      if (!input.value.trim()) return;
      MC.ui.interests.focus = cat;   // keep typing in the same box after the re-render
      if (!MC.addCustom(cat, labels)) { input.value = ''; MC.toast('Already on your list.'); }
    });
    root.querySelectorAll('.chip.custom').forEach(chip => chip.onkeydown = e => {
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); MC.actions['custom-remove'](chip); }
    });
    const f = MC.ui.interests.focus;
    if (f) { MC.ui.interests.focus = null; root.querySelector(`[data-custom-input="${f}"]`)?.focus(); }
  },
};
MC.actions['custom-pick'] = el => {
  const c = MC.customFor(el.dataset.cat).find(c => c.id === el.dataset.id);
  if (!c) return;
  const v = ({ 1: 2, 2: -1, '-1': 1 })[c.v] ?? 1;   // like → love → avoid → like (× removes)
  MC.ui.skipRender = true; MC.setCustomLevel(el.dataset.cat, c.id, v);
  const lv = MC.LEVELS.find(l => l.v === v);
  el.dataset.level = v; el.title = `${lv.label}. Click to change, × or Delete to remove`;
  el.querySelector('.lvl')?.remove();
  el.querySelector('.chip-x').insertAdjacentHTML('beforebegin', ` <span class="lvl">${lv.short}</span>`);
};
MC.actions['custom-remove'] = el => MC.removeCustom(el.dataset.cat, el.dataset.id);
MC.actions.pick = el => {
  const v = MC.nextLevel(MC.getPick(el.dataset.key));
  MC.ui.skipRender = true; MC.setPick(el.dataset.key, v);
  const lv = MC.LEVELS.find(l => l.v === v);
  el.dataset.level = v; el.title = `${lv.label} — click to change`;
  el.querySelector('.lvl')?.remove();
  if (lv.short) el.insertAdjacentHTML('beforeend', ` <span class="lvl">${lv.short}</span>`);
};
MC.actions['type-level'] = el => { MC.setTypeLevel(el.dataset.type, +el.dataset.v); };
MC.actions['toggle-type'] = el => {
  const t = el.dataset.type; const cur = MC.ui.interests.collapsed[t] ?? MC.getTypeLevel(t) === -1;
  MC.ui.interests.collapsed[t] = !cur; MC.render();
};

/* =================================================================== DISCOVER */
MC.views.discover = {
  render() {
    const d = MC.ui.disc, ty = MC.ui.type;
    let body = '';
    if (d.tab !== 'history') {
      const { results, profile } = MC.localRecommend({ type: ty, query: d.localQ, limit: 30 });
      body = `
      <div class="section-head" style="margin-top:22px"><h2>For you${ty !== 'all' ? ` · ${E(MC.TYPE[ty].label)}` : ''}</h2></div>
      <div class="toolbar"><input class="search" type="search" placeholder="Filter by mood or genre — e.g. cozy, sci-fi, horror" value="${E(d.localQ)}" data-local-q></div>
      ${profile ? '' : `<div class="notice" style="margin-bottom:14px">These are general picks. <a href="#/interests">Fill in your interest checklist</a> and rate things in your library to personalise them.</div>`}
      <div data-local-results>${MC.renderLocalGrid(results)}</div>
      <p class="tiny muted" style="margin-top:16px">“For you” works offline: it scores a built-in catalog of well-known titles against your checklist, ratings and favourite creators. Ask in the ✨ bar for anything new or niche.</p>`;
    } else {
      const asks = MC.state.asks.filter(a => ty === 'all' || a.type === ty || a.items.some(i => i.type === ty));
      body = asks.length ? `<div class="card pad list" style="margin-top:22px">${asks.map(a => `
        <div class="history-item" data-action="open-ask" data-id="${a.id}">
          ${a.items.length ? MC.thumbStack(a.items, 'xs', 4) : '<span>✨</span>'}<div class="grow"><div style="font-weight:600">${E(a.query)}</div><div class="tiny muted">${E(new Date(a.at).toLocaleString())} · ${a.items.length} picks${a.type && a.type !== 'all' ? ' · ' + MC.TYPE[a.type].label : ''}</div></div>
          <button class="btn sm ghost" data-action="delete-ask" data-id="${a.id}" aria-label="Delete">✕</button></div>`).join('')}</div>`
        : `<div class="empty" style="margin-top:22px"><h3>No asks yet${ty !== 'all' ? ` for ${E(MC.TYPE[ty].label)}` : ''}</h3><p>Your past questions and Claude’s picks are saved here. Click one to show it again.</p></div>`;
    }
    return `<div class="page-head"><div><h1>Discover</h1><p class="muted">Recommendations from your checklist, your library and what you ask for.</p></div><div class="phone-only">${MC.pageActions('discover')}</div></div>
      ${body}`;
  },
  mount(root) {
    const lq = root.querySelector('[data-local-q]');
    if (lq) lq.oninput = e => {
      MC.ui.disc.localQ = e.target.value;
      root.querySelector('[data-local-results]').innerHTML = MC.renderLocalGrid(MC.localRecommend({ type: MC.ui.type, query: MC.ui.disc.localQ, limit: 30 }).results);
    };
  },
};
MC.renderLocalGrid = results => results.length
  ? `<div class="grid">${results.map(r => MC.recCard({ ...r.item, reasons: r.reasons, source: 'offline' })).join('')}</div>`
  : `<div class="empty"><h3>No matches in the offline catalog</h3><p>Try a different filter${MC.hasKey() ? ', or ask Claude' : ''}.</p></div>`;
MC.actions['disc-tab'] = el => { MC.ui.disc.tab = el.dataset.tab; MC.render(); };
/* Show a past ask in the header's results panel again. */
MC.actions['open-ask'] = (el, e) => {
  if (e.target.closest('[data-action="delete-ask"]')) return;
  const a = MC.state.asks.find(x => x.id === el.dataset.id); if (!a) return;
  MC.ui.type = MC.TYPE[a.type] ? a.type : 'all';
  const scope = 'library:' + MC.ui.type;
  Object.assign(barUi(scope), { error: '', hidden: false, draft: undefined });
  MC.update(s => { s.searches[scope] = { query: a.query, at: a.at, askId: a.id }; });
  window.scrollTo(0, 0);
};
MC.actions['delete-ask'] = el => MC.update(s => { s.asks = s.asks.filter(a => a.id !== el.dataset.id); });

/* =================================================================== CALENDAR
   No empty grid: one section per month, listing only the days that have drops or releases, each with large cards. */
MC.views.calendar = {
  render() {
    const c = MC.ui.cal;
    const today = MC.today();
    const all = MC.allEvents().filter(e => MC.ui.type === 'all' || e.type === MC.ui.type);   // sorted by date
    const view = calView();
    if (view !== 'list') return calHead(c) + calToolbar(view, '') + calPeriod(view, c.at || today, all, today);
    const pastCount = all.filter(e => e.date < today).length;
    const events = c.past ? all : all.filter(e => e.date >= today);
    const months = [];
    events.forEach(e => {
      let m = months[months.length - 1];
      if (!m || m.key !== e.date.slice(0, 7)) months.push(m = { key: e.date.slice(0, 7), days: [], n: 0 });
      let d = m.days[m.days.length - 1];
      if (!d || d.date !== e.date) m.days.push(d = { date: e.date, evs: [] });
      d.evs.push(e); m.n++;
    });
    const monthLabel = (key, opts) => MC.fmtDate(key + '-01', opts);
    const what = MC.ui.type === 'all' ? 'drops' : MC.TYPE[MC.ui.type].label.toLowerCase();
    const body = months.length ? months.map(m => `
      <section class="cal-month" id="cal-m-${m.key}">
        <div class="cal-month-head">
          <h2>${E(monthLabel(m.key, { month: 'long' }))} <span class="muted">${m.key.slice(0, 4)}</span></h2>
          <span class="pill">${m.n} ${m.n === 1 ? 'release' : 'releases'} · ${m.days.length} ${m.days.length === 1 ? 'day' : 'days'}</span>
        </div>
        ${m.days.map(d => `<div class="cal-dayblock${d.date === today ? ' today' : ''}${d.date < today ? ' past' : ''}" id="cal-d-${d.date}" data-day="${d.date}">
          <div class="cal-date">
            <span class="dow">${E(MC.fmtDate(d.date, { weekday: 'short' }))}</span>
            <span class="dnum">${+d.date.slice(8)}</span>
            <span class="mon">${E(MC.fmtDate(d.date, { month: 'short' }))}</span>
            <span class="countdown">${E(MC.countdownLabel(d.date))}</span>
            <button class="btn sm ghost add-day" data-action="add-drop" data-date="${d.date}" title="Add a drop on this day" aria-label="Add a drop on ${E(MC.fmtDate(d.date))}">+</button>
          </div>
          <div class="cal-items">${d.evs.map(e => MC.eventCard(e)).join('')}</div>
        </div>`).join('')}
      </section>`).join('')
      : `<div class="empty" style="padding:40px 24px"><div class="big">📅</div><h3>No upcoming ${E(what)} yet</h3>
          <p class="small">Add release dates yourself, set one on any library item, or let Claude find what’s coming for your interests.</p>
          <div class="row" style="justify-content:center"><button class="btn" data-action="add-drop">+ Add drop</button><button class="btn primary" data-action="find-drops">✨ Find upcoming drops</button></div></div>`;
    return `${calHead(c)}
    ${calToolbar('list', pastCount ? `<button class="btn sm ghost" data-action="cal-past">${c.past ? 'Hide past' : `Show ${pastCount} past`}</button>` : '', !months.length)}
    ${months.length ? `<nav class="cal-rail" aria-label="Jump to a date">${months.map(m => `<button class="rail-month" data-action="cal-jump" data-m="${m.key}" title="${m.n} ${m.n === 1 ? 'release' : 'releases'}">${E(monthLabel(m.key, { month: 'short' }))}${m.key.slice(0, 4) !== today.slice(0, 4) ? ` ’${m.key.slice(2, 4)}` : ''}</button>${m.days.map(d => `<button class="rail-day${d.date === today ? ' today' : ''}${d.date < today ? ' past' : ''}" data-action="cal-jump-day" data-d="${d.date}" aria-label="${E(MC.fmtDate(d.date, { weekday: 'long', month: 'long', day: 'numeric' }))}: ${d.evs.length} ${d.evs.length === 1 ? 'release' : 'releases'}"><span>${E(MC.fmtDate(d.date, { weekday: 'short' }))}</span><b>${+d.date.slice(8)}</b><i>${'•'.repeat(Math.min(d.evs.length, 4))}</i></button>`).join('')}`).join('')}</nav>` : ''}
    ${body}
    ${months.length ? '<p class="tiny muted">Dashed cards have an estimated date. Library items with a release date show here automatically.</p>' : ''}`;
  },
};
/* The page title, progress and messages, shared by every view. */
const calHead = c => `
    <div class="page-head"><div><h1>Calendar</h1><p class="muted">Only the days with something coming out, with the newest releases you follow and the picks you’re tracking.</p></div>
      <div class="row phone-only">${MC.pageActions('calendar')}</div></div>
    ${c.finding ? `<div class="status-line"><div class="spinner"></div><span data-cal-status>${E(c.status)}</span></div>` : ''}
    ${c.error ? `<div class="notice error" style="margin-bottom:14px">${E(c.error)}</div>` : ''}
    ${c.result ? `<div class="notice" style="margin-bottom:14px">${E(c.result)} <button class="btn sm ghost" data-action="cal-dismiss-result">OK</button></div>` : ''}
    ${c.trailers ? `<div class="status-line"><div class="spinner"></div><span data-trailer-status>${E(c.tStatus)}</span></div>` : ''}`;

/* ---------- Views: List (every release day, below), Day, Week or Month ----------
   The view picked in the dropdown is a setting, so it's how the Calendar opens next time (and on your other devices).
   Clicking a day in Week or Month opens it in Day view for this visit only, with a way back. */
const CAL_VIEWS = { list: 'List', day: 'Day', week: 'Week', month: 'Month' };
const calView = () => MC.ui.cal.view || (CAL_VIEWS[MC.state.settings.calView] ? MC.state.settings.calView : 'list');
const addDays = (iso, n) => { const d = MC.parseDate(iso); d.setDate(d.getDate() + n); return MC.isoDate(d); };
// Weeks start on the locale's first day (Sunday in the US, Monday in most of Europe).
const WEEK_START = (() => { try { const l = new Intl.Locale(navigator.language); const f = (l.getWeekInfo?.() || l.weekInfo)?.firstDay; return f ? f % 7 : 0; } catch { return 0; } })();
const weekStart = iso => { const d = MC.parseDate(iso); return addDays(iso, -((d.getDay() - WEEK_START + 7) % 7)); };
const calToolbar = (view, extra, empty = false) => `<div class="cal-toolbar">
      <div class="row">
        <label class="cal-view-pick"><span>View</span><select data-cal-view aria-label="Calendar view">${Object.entries(CAL_VIEWS).map(([k, l]) => `<option value="${k}"${k === view ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
        ${extra}
      </div>
      ${empty ? '' : `<button class="btn sm" data-action="check-trailers" ${MC.ui.cal.trailers ? 'disabled' : ''} title="Check every trailer link still works, and find working ones (with backups) for the rest">${MC.ui.cal.trailers ? 'Checking trailers…' : '🎬 Check trailers'}</button>`}
    </div>`;
const evChip = e => `<button class="cal-chip${e.dateConfidence === 'estimated' ? ' est' : ''}" ${MC.typeStyle(e.type)} data-action="ev-details" data-did="${MC.evDid(e)}" title="${E(e.title)}${e.creator ? ' — ' + E(e.creator) : ''}"><i aria-hidden="true">${MC.TYPE[e.type]?.icon || '📅'}</i><span>${E(e.title)}</span></button>`;
const evTile = e => `<button class="cal-tile${e.dateConfidence === 'estimated' ? ' est' : ''}" ${MC.typeStyle(e.type)} data-action="ev-details" data-did="${MC.evDid(e)}">
      ${MC.thumb(e, 'tile')}<b>${E(e.title)}</b>${e.creator ? `<small>${E(e.creator)}</small>` : ''}</button>`;
const dayLong = d => MC.fmtDate(d, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

const calPeriod = (view, at, all, today) => {
  const byDate = {};
  all.forEach(e => (byDate[e.date] ||= []).push(e));
  const cls = d => `${d === today ? ' today' : ''}${d < today ? ' past' : ''}`;
  const count = n => `${n} ${n === 1 ? 'release' : 'releases'}`;
  let title, body;
  if (view === 'day') {
    const evs = byDate[at] || [];
    const prev = [...all].reverse().find(e => e.date < at)?.date, next = all.find(e => e.date > at)?.date;
    title = `${E(dayLong(at))} <span class="countdown">${E(MC.countdownLabel(at))}</span>`;
    body = `<div class="cal-dayview">
      ${evs.length ? `<div class="cal-items">${evs.map(e => MC.eventCard(e)).join('')}</div>`
        : `<div class="empty" style="padding:32px 24px"><div class="big">📅</div><h3>Nothing coming out this day</h3></div>`}
      <div class="row cal-dayjump">
        ${prev ? `<button class="btn sm ghost" data-action="cal-goto" data-d="${prev}">‹ ${E(MC.fmtDate(prev, { month: 'short', day: 'numeric' }))}</button>` : ''}
        <button class="btn sm" data-action="add-drop" data-date="${at}">+ Add drop on this day</button>
        ${next ? `<button class="btn sm ghost" data-action="cal-goto" data-d="${next}">Next release: ${E(MC.fmtDate(next, { month: 'short', day: 'numeric' }))} ›</button>` : ''}
      </div></div>`;
  } else if (view === 'week') {
    const start = weekStart(at), days = Array.from({ length: 7 }, (_, i) => addDays(start, i)), end = days[6];
    const n = days.reduce((t, d) => t + (byDate[d]?.length || 0), 0);
    const range = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).formatRange(MC.parseDate(start), MC.parseDate(end));   // "Nov 15 – 21, 2026"
    title = `${E(range)} <span class="pill">${count(n)}</span>`;
    body = `<div class="cal-week">${days.map(d => `<div class="cal-wcol${cls(d)}">
        <button class="cal-whead" data-action="cal-open-day" data-d="${d}" aria-label="${E(dayLong(d))}: ${count(byDate[d]?.length || 0)}"><span>${E(MC.fmtDate(d, { weekday: 'short' }))}</span><b>${+d.slice(8)}</b></button>
        <div class="cal-wlist">${(byDate[d] || []).map(evTile).join('')}</div>
        <button class="btn sm ghost add-day" data-action="add-drop" data-date="${d}" title="Add a drop on this day" aria-label="Add a drop on ${E(MC.fmtDate(d))}">+</button>
      </div>`).join('')}</div>`;
  } else {
    const first = at.slice(0, 8) + '01', month = at.slice(0, 7);
    const start = weekStart(first);
    let last = MC.parseDate(first); last.setMonth(last.getMonth() + 1); last.setDate(0); last = MC.isoDate(last);
    const cells = [];
    for (let d = start; d <= last || cells.length % 7; d = addDays(d, 1)) cells.push(d);
    const n = all.filter(e => e.date.startsWith(month)).length;
    title = `${E(MC.fmtDate(first, { month: 'long', year: 'numeric' }))} <span class="pill">${count(n)}</span>`;
    const SHOW = 3;
    body = `<div class="cal-monthgrid">
      ${cells.slice(0, 7).map(d => `<div class="cal-mdow">${E(MC.fmtDate(d, { weekday: 'short' }))}</div>`).join('')}
      ${cells.map(d => { const evs = byDate[d] || []; return `<div class="cal-mcell${cls(d)}${d.startsWith(month) ? '' : ' out'}${evs.length ? ' has' : ''}">
        <button class="cal-mday" data-action="cal-open-day" data-d="${d}" aria-label="${E(dayLong(d))}: ${count(evs.length)}">${+d.slice(8)}</button>
        ${evs.slice(0, SHOW).map(evChip).join('')}
        ${evs.length > SHOW ? `<button class="cal-more" data-action="cal-open-day" data-d="${d}">+${evs.length - SHOW} more</button>` : ''}
      </div>`; }).join('')}
    </div>`;
  }
  const unit = { day: 'day', week: 'week', month: 'month' }[view];
  const drilled = MC.ui.cal.view === 'day' && ['week', 'month'].includes(MC.state.settings.calView);
  return `<div class="cal-nav">
      <button class="btn sm icon-btn" data-action="cal-step" data-n="-1" aria-label="Previous ${unit}" title="Previous ${unit}">‹</button>
      <button class="btn sm" data-action="cal-today" ${at === today ? 'disabled' : ''}>Today</button>
      <button class="btn sm icon-btn" data-action="cal-step" data-n="1" aria-label="Next ${unit}" title="Next ${unit}">›</button>
      <h2>${title}</h2>
      ${drilled ? `<button class="btn sm ghost" data-action="cal-back">← Back to ${CAL_VIEWS[MC.state.settings.calView]}</button>` : ''}
    </div>
    ${body}
    <p class="tiny muted">Dashed entries have an estimated date. Library items with a release date show here automatically.</p>`;
};
MC.actions['cal-step'] = el => {
  const c = MC.ui.cal, at = c.at || MC.today(), n = +el.dataset.n, v = calView();
  if (v === 'day') c.at = addDays(at, n);
  else if (v === 'week') c.at = addDays(at, 7 * n);
  else { const d = MC.parseDate(at.slice(0, 8) + '01'); d.setMonth(d.getMonth() + n); c.at = MC.isoDate(d); }
  MC.render();
};
MC.actions['cal-today'] = () => { MC.ui.cal.at = ''; MC.render(); };
MC.actions['cal-goto'] = el => { MC.ui.cal.at = el.dataset.d; MC.render(); };
MC.actions['cal-open-day'] = el => { Object.assign(MC.ui.cal, { view: 'day', at: el.dataset.d }); MC.render(); window.scrollTo(0, 0); };
MC.actions['cal-back'] = () => { MC.ui.cal.view = ''; MC.render(); };

/* The date strip pinned under the header: every release day, grouped by month. Tap to jump; while scrolling, the day
   you're on is highlighted and kept in view. */
const calOffset = () => (document.getElementById('apphead')?.offsetHeight || 0) + (document.querySelector('.cal-rail')?.offsetHeight || 0) + 10;
const calScrollTo = el => el && window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - calOffset(), behavior: 'smooth' });
MC.actions['cal-jump'] = el => calScrollTo(document.getElementById('cal-m-' + el.dataset.m));
MC.actions['cal-jump-day'] = el => calScrollTo(document.getElementById('cal-d-' + el.dataset.d));
let calSpy = null;
MC.views.calendar.mount = root => {
  if (calSpy) window.removeEventListener('scroll', calSpy);
  root.querySelector('[data-cal-view]')?.addEventListener('change', e => {
    const v = e.target.value;
    MC.ui.cal.view = '';
    MC.update(s => { s.settings.calView = v; });
  });
  const rail = root.querySelector('.cal-rail');
  if (!rail) return;
  const doc = document.documentElement.style;
  doc.setProperty('--head-h', (document.getElementById('apphead')?.offsetHeight || 0) + 'px');
  doc.setProperty('--rail-h', rail.offsetHeight + 'px');
  const days = [...root.querySelectorAll('.cal-dayblock[data-day]')];
  let shown = '', queued = false;
  const update = () => {
    queued = false;
    if (!rail.isConnected) return;
    const line = calOffset() + 30;
    let cur = days[0];
    for (const d of days) { if (d.getBoundingClientRect().top <= line) cur = d; else break; }
    const date = cur?.dataset.day || '';
    if (date === shown) return;
    shown = date;
    rail.querySelectorAll('.rail-day.active').forEach(b => b.classList.remove('active'));
    const btn = rail.querySelector(`[data-d="${date}"]`);
    if (btn) { btn.classList.add('active'); rail.scrollTo({ left: btn.offsetLeft - rail.clientWidth / 2 + btn.offsetWidth / 2, behavior: 'smooth' }); }
  };
  calSpy = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
  window.addEventListener('scroll', calSpy, { passive: true });
  update();
};
MC.actions['cal-past'] = () => { MC.ui.cal.past = !MC.ui.cal.past; MC.render(); };
/* 🎬 Check trailers: every upcoming drop shown gets a working trailer if one exists. Links are checked with YouTube,
   dead ones are replaced by backups (Wikidata, Apple), and with a key Claude searches for the rest. Working links are saved. */
MC.actions['check-trailers'] = async () => {
  const c = MC.ui.cal;
  if (c.trailers) return;
  const ty = MC.ui.type;
  const evs = MC.allEvents().filter(e => (c.past || e.date >= MC.today()) && (ty === 'all' || e.type === ty));
  if (!evs.length) return;
  const useClaude = MC.hasKey();
  Object.assign(c, { trailers: true, tStatus: `Checking ${evs.length} trailers…`, result: '', error: '' }); MC.render();
  const status = m => { c.tStatus = m; const el = document.querySelector('[data-trailer-status]'); if (el) el.textContent = m; };
  const tally = { here: 0, ytOnly: 0, sample: 0, claude: 0, fixed: 0, none: [] };
  let done = 0, next = 0;
  const one = async ev => {
    const had = MC.clipFromUrl(ev.trailer);
    let clip = await MC.findClip(ev);
    const video = x => x && ['youtube', 'vimeo', 'video'].includes(x.kind);
    // ask Claude unless there's already a trailer that plays here (or a song/audiobook sample, which is what those get)
    const good = clip && ((['youtube', 'vimeo'].includes(clip.kind) && !clip.blocked) || clip.kind === 'audio');
    if (!good && useClaude) {
      try { const r = await MC.aiFindTrailer(ev); if (r.clip) { clip = r.clip; tally.claude++; } } catch { /* keep what we had */ }
    }
    if (video(clip) || clip?.kind === 'audio') {
      if (clip.kind === 'audio') tally.sample++; else if (clip.blocked) tally.ytOnly++; else tally.here++;
      if (['youtube', 'vimeo'].includes(clip.kind) && (clip.id !== had?.id)) { if (MC.saveTrailer(ev, clip) && had) tally.fixed++; }
    } else tally.none.push(ev.title);
    done++; status(`Checked ${done} of ${evs.length} trailers${useClaude ? ' (Claude is searching for the missing ones)' : ''}…`);
  };
  await Promise.all(Array.from({ length: Math.min(2, evs.length) }, async () => { while (next < evs.length) await one(evs[next++]); }));
  const parts = [`Checked ${evs.length} releases: ${tally.here} play here`];
  if (tally.ytOnly) parts.push(`${tally.ytOnly} play on YouTube only (a "Watch on YouTube" link)`);
  if (tally.sample) parts.push(`${tally.sample} have an audio sample`);
  let msg = parts.join(', ') + '.';
  if (tally.claude) msg += ` Claude found ${tally.claude}.`;
  if (tally.fixed) msg += ` ${tally.fixed} broken link${tally.fixed === 1 ? ' was' : 's were'} replaced.`;
  if (tally.none.length) msg += ` No trailer yet for ${tally.none.length}: ${tally.none.slice(0, 6).join(', ')}${tally.none.length > 6 ? '…' : ''}.`;
  if (!useClaude && tally.none.length) msg += ' Add a Claude key in Settings to search the web for those.';
  Object.assign(c, { trailers: false, result: msg }); MC.render();
};
MC.actions['cal-dismiss-result'] = () => { MC.ui.cal.result = ''; MC.render(); };
MC.actions['add-drop'] = el => MC.openDropEditor({ type: MC.ui.type !== 'all' ? MC.ui.type : 'movies', title: '', creator: '', date: el.dataset.date || MC.today(), dateConfidence: 'confirmed', notes: '', link: '', origin: 'manual' }, true);
MC.actions['export-ics'] = () => {
  const evs = MC.allEvents().filter(e => e.date >= MC.today());
  if (!evs.length) { MC.toast('No upcoming drops to export yet.'); return; }
  MC.download('mediacopia-drops.ics', MC.buildICS(evs), 'text/calendar');
  MC.toast(`Exported ${evs.length} drops`);
};
MC.actions['find-drops'] = async () => {
  const c = MC.ui.cal;
  if (!MC.hasKey()) { MC.toast('Add a Claude API key in Settings to search for upcoming drops.', 'error'); location.hash = '#/settings'; return; }
  if (!MC.state.settings.webSearch) MC.toast('Web search is off in Settings — dates may be less reliable.');
  Object.assign(c, { finding: true, error: '', result: '', status: 'Starting…' }); MC.render();
  try {
    const r = await MC.aiFindDrops({ months: 4, onStatus: msg => { c.status = msg; const el = document.querySelector('[data-cal-status]'); if (el) el.textContent = msg; } });
    c.result = `${r.summary} Added ${r.added.length} new drop${r.added.length === 1 ? '' : 's'}${r.found > r.added.length ? ` (${r.found - r.added.length} already on your calendar)` : ''}.`;
  } catch (e) { c.error = e.message || String(e); }
  c.finding = false; MC.render();
};

/* =================================================================== SETTINGS */
/* Subscription tiles: logo, name, price; DEAL / TRIAL flags from the latest live check. */
MC.ui.prices = { loading: false, status: '', error: '', summary: '' };
const forType = sv => (MC.ui.type === 'all' || sv.types.includes(MC.ui.type)) && MC.serviceInRegion(sv);
const shownServices = () => MC.SERVICES.filter(forType);
const subTile = sv => {
  const p = MC.servicePrice(sv.id);
  const tip = [sv.name, p.plans || p.price, p.deal && `Deal: ${p.deal}`, p.trial && `Free trial: ${p.trial}`, p.live ? '' : (p.price && p.price !== 'Free' ? `(${MC.PRICES_NOTE})` : '')].filter(Boolean).join('\n');
  return `<label class="svc-pick" title="${E(tip)}">
    <input type="checkbox" data-sub="${sv.id}" ${MC.hasSub(sv.id) ? 'checked' : ''}>
    <span class="logo-wrap">${MC.logoTile({ svc: sv })}<span class="svc-check" aria-hidden="true">✓</span>${p.deal ? '<span class="svc-flag deal">DEAL</span>' : p.trial ? '<span class="svc-flag trial">TRIAL</span>' : ''}</span>
    <span class="svc-name">${E(sv.name)}</span>
    <span class="svc-price${p.live ? '' : ' est'}">${E(p.price || '—')}</span>
  </label>`;
};
const priceBar = () => {
  const sp = MC.state.servicePrices, u = MC.ui.prices;
  const when = sp?.at ? new Date(sp.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  return `<div class="price-bar">
      <span class="small muted grow">${sp?.at ? `Prices, deals and trials checked ${E(when)} for ${E(sp.region)}. Services not in that check show approximate US list prices.` : 'Prices shown are approximate US list prices and may be out of date. Check for current prices, deals and free trials in your country.'}</span>
      <button class="btn sm primary" data-action="check-prices" ${u.loading ? 'disabled' : ''}>${u.loading ? 'Checking…' : '💲 Check prices & deals'}</button>
    </div>
    ${u.loading ? `<div class="status-line" style="padding:4px"><div class="spinner"></div><span data-price-status>${E(u.status)}</span></div>` : ''}
    ${u.error ? `<div class="notice error">${E(u.error)}</div>` : ''}
    ${u.summary && !u.loading ? `<div class="notice">${E(u.summary)}</div>` : ''}`;
};
const dealsList = list => {
  const rows = list.map(sv => ({ sv, p: MC.servicePrice(sv.id) })).filter(x => x.p.live && (x.p.deal || x.p.trial));
  if (!rows.length) return '';
  return `<div class="group"><h4>🔥 Deals & free trials right now</h4><div class="deal-list">${rows.map(({ sv, p }) => `
    <div class="deal-row">${MC.logoTile({ svc: sv, size: 'sm' })}
      <div class="grow"><div><b>${E(sv.name)}</b> ${p.deal ? '<span class="svc-flag deal inline">DEAL</span>' : ''}${p.trial ? '<span class="svc-flag trial inline">TRIAL</span>' : ''} <span class="muted small">${E(p.price)}</span></div>
        ${p.deal ? `<div class="small">${E(p.deal)}</div>` : ''}${p.trial ? `<div class="small muted">${E(p.trial)}</div>` : ''}</div>
      <a class="btn sm" href="${E(p.url || sv.url)}" target="_blank" rel="noopener">Get it ↗</a>
    </div>`).join('')}</div></div>`;
};
MC.actions['check-prices'] = async () => {
  const u = MC.ui.prices;
  if (u.loading) return;
  if (!MC.hasKey()) { MC.toast('Add a Claude API key above to check current prices and deals.', 'error'); return; }
  if (!MC.state.settings.webSearch) MC.toast('Web search is off, so prices may be out of date.');
  Object.assign(u, { loading: true, error: '', summary: '', status: 'Starting…' }); MC.render();
  try {
    const r = await MC.aiCheckPrices({ ids: [...shownServices()].sort((a, b) => MC.hasSub(b.id) - MC.hasSub(a.id)).map(sv => sv.id), onStatus: m => { u.status = m; const el = document.querySelector('[data-price-status]'); if (el) el.textContent = m; } });
    u.summary = r.summary;
  } catch (e) { u.error = e.message || String(e); }
  u.loading = false; MC.render();
};
/* Settings → AI usage on this device: what each Claude feature actually costs (logged in js/ai.js, never synced). */
const usageMoney = n => n >= 1 ? `$${n.toFixed(2)}` : n >= 0.01 ? `$${n.toFixed(3)}` : n > 0 ? `$${n.toFixed(4)}` : '$0';
const usageTok = n => n >= 1000 ? `${(n / 1000).toFixed(n >= 1e4 ? 0 : 1)}k` : String(Math.round(n));
MC.usageCard = () => {
  const u = MC.state.usage, log = u?.log || [];
  const rows = Object.values(log.reduce((acc, e) => {
    const model = (e.models || [])[0] || '', label = MC.MODELS.find(m => model.startsWith(m.id))?.label.replace(/^Claude | \(.*$/g, '') || model;
    const r = acc[`${e.action}|${label}`] ||= { action: e.action, model: label, n: 0, in: 0, out: 0, cache: 0, searches: 0, cost: 0, ms: 0, fast: 0, failed: 0 };
    r.n++; r.in += e.in; r.out += e.out; r.cache += (e.cacheRead || 0) + (e.cacheWrite || 0); r.searches += e.searches; r.cost += e.cost; r.ms += e.ms;
    if (e.fast) r.fast++; if (!e.ok) r.failed++;
    return acc;
  }, {})).sort((a, b) => b.cost - a.cost);
  const total = rows.reduce((t, r) => t + r.cost, 0), n = rows.reduce((t, r) => t + r.n, 0);
  const anyFast = rows.some(r => r.fast);
  const since = u?.since ? new Date(u.since).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  return `<div class="card" id="usage">
    <div class="row" style="justify-content:space-between"><h2>AI usage on this device</h2>${n ? `<span class="pill accent">${usageMoney(total)} · ${n} action${n === 1 ? '' : 's'}</span>` : ''}</div>
    <p class="small muted">What each Claude feature costs, from the token and web-search counts Claude reports on every answer, at Anthropic’s list prices (${E(MC.PRICES_AS_OF)}). It’s kept on this device only and never synced. Your Anthropic console shows the exact bill.</p>
    ${n ? `<div class="usage-scroll"><table class="usage-table">
      <thead><tr><th>Feature</th><th>Model</th><th>Times</th><th>Avg cost</th><th>Avg tokens in / out</th><th>Avg searches</th><th>Avg time</th><th>Total</th></tr></thead>
      <tbody>${rows.map(r => `<tr><td>${E(r.action)}${r.failed ? ` <span class="tiny muted">(${r.failed} failed)</span>` : ''}${r.fast ? ' <span class="tiny muted">⚡</span>' : ''}</td><td>${E(r.model)}</td><td>${r.n}</td><td><b>${usageMoney(r.cost / r.n)}</b></td>
        <td>${usageTok(r.in / r.n)} / ${usageTok(r.out / r.n)}${r.cache ? ` <span class="tiny muted">+${usageTok(r.cache / r.n)} cached</span>` : ''}</td><td>${(r.searches / r.n).toFixed(1)}</td><td>${(r.ms / r.n / 1000).toFixed(1)}s</td><td>${usageMoney(r.cost)}</td></tr>`).join('')}</tbody>
    </table></div>
    <p class="tiny muted">Since ${E(since)}. Includes failed attempts, which are still billed.${anyFast ? ' ⚡ = fast mode, which Anthropic bills at a premium not included in these estimates.' : ''}</p>
    <div class="row"><button class="btn sm" data-action="usage-csv">Download CSV</button><button class="btn sm ghost" data-action="usage-reset">Reset</button></div>`
    : `<p class="small">Nothing yet. Use Ask, Recommend, How to watch or the other ✨ features with your key, and each one’s cost appears here.</p>`}
  </div>`;
};
MC.actions['usage-reset'] = async () => {
  if (!(await MC.confirm('Reset AI usage?', 'This clears the usage log on this device. Your Anthropic bill is unaffected.', 'Reset'))) return;
  MC.update(s => { s.usage = { since: new Date().toISOString(), log: [] }; });
};
MC.actions['usage-csv'] = () => {
  const cols = ['at', 'action', 'ok', 'cost', 'in', 'out', 'cacheWrite', 'cacheRead', 'searches', 'calls', 'ms', 'fast', 'models'];
  const lines = [cols.join(','), ...(MC.state.usage?.log || []).map(e => cols.map(c => JSON.stringify(Array.isArray(e[c]) ? e[c].join(' ') : e[c] ?? '')).join(','))];
  MC.download(`mediacopia-ai-usage-${MC.today()}.csv`, lines.join('\n'), 'text/csv');
};
/* Settings → Lock & sync: the same controls as CatchAll's menu (see js/lock.js, js/vault.js, js/sync.js). */
MC.syncCard = () => {
  const signed = MC.sync.signedIn(), remembered = MC.vault.isRemembered(), auto = String(MC.lock.autoLock());
  return `<div class="card" id="sync"><h2>🔒 Lock &amp; sync</h2>
    <p class="small muted">Everything in MediaCopia is encrypted on this device with your passphrase, and synced encrypted across your devices: the server only ever stores ciphertext.</p>
    <div class="sync-status"><span>☁️ <span data-sync-line>${E(MC.lock.syncLabel())}</span></span>${signed ? `<span class="muted small">${E(MC.sync.account())}</span>` : ''}</div>
    <div class="row">
      <button class="btn ${signed ? '' : 'primary'}" data-action="open-sync">${signed ? 'Sync now or sign out' : 'Turn on sync'}</button>
      <button class="btn" data-action="change-passphrase">Change passphrase</button>
      <button class="btn" data-action="lock-now">${remembered ? '🔒 Lock and forget this device' : '🔒 Lock now'}</button>
    </div>
    <div class="row" style="margin-top:10px">
      ${remembered ? '<span class="small">✓ Remembered on this device: it opens without your passphrase.</span>' : '<button class="btn sm" data-action="toggle-remember">Remember on this device</button>'}
      <label class="small" title="${remembered ? 'Auto-lock is off while this device is remembered' : ''}">Lock automatically
        <select data-autolock ${remembered ? 'disabled' : ''}>${[['5', 'after 5 min'], ['15', 'after 15 min'], ['60', 'after 1 hour'], ['0', 'never']].map(([v, l]) => `<option value="${v}" ${auto === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    </div>
  </div>`;
};

/* Close (✕ at the top, a button at the bottom) goes back to the page you opened Settings from. */
window.addEventListener('hashchange', e => { const from = new URL(e.oldURL).hash; if (!from.startsWith('#/settings')) MC.ui.beforeSettings = from; });
MC.actions['close-settings'] = () => { location.hash = MC.ui.beforeSettings || '#/home'; };
MC.views.settings = {
  render() {
    const st = MC.state.settings;
    return `
    <div class="page-head"><div><h1>Settings</h1><p class="muted">AI, subscriptions, appearance and your data.</p></div>
      <button class="btn ghost icon-btn settings-close" data-action="close-settings" aria-label="Close settings" title="Close settings">✕</button></div>
    <div class="settings">
      <div class="card">
        <h2>Claude AI</h2>
        <p class="small muted">MediaCopia uses Claude for open-ended recommendations and to search the web for upcoming drops. Get a key at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com</a>. The key is stored only in this browser and sent only to api.anthropic.com. Usage is billed to your Anthropic account.</p>
        <label class="field">API key
          <div class="key-row"><input type="password" data-key value="${E(st.apiKey)}" placeholder="sk-ant-…" autocomplete="off" spellcheck="false">
          <button class="btn" data-action="toggle-key">Show</button><button class="btn" data-action="test-key">Test</button></div></label>
        <label class="field">Model
          <select data-model>${MC.MODELS.map(m => `<option value="${m.id}" ${st.model === m.id ? 'selected' : ''}>${E(m.label)}</option>`).join('')}</select></label>
        <label class="switch"><input type="checkbox" data-web ${st.webSearch ? 'checked' : ''}> Let Claude search the web (needed for current releases and accurate dates)</label>
        <div data-key-status class="small"></div>
      </div>
      ${MC.usageCard()}
      <div class="card" id="subscriptions">
        <div class="row" style="justify-content:space-between"><h2>My subscriptions</h2><span class="pill accent" data-sub-count>${(st.subs || []).length} ticked</span></div>
        <p class="small muted">Tick the services you have. Recommendations and drops then show “✓ On your subscriptions” with a direct link when something is included, and Claude checks these first.</p>
        ${MC.ui.type !== 'all' ? `<div class="notice">Showing services for ${E(MC.TYPE[MC.ui.type].label)}. <button class="btn sm ghost" data-action="head-type" data-type="all">Show all</button></div>` : ''}
        ${priceBar()}
        ${dealsList(shownServices())}
        ${MC.SERVICE_GROUPS.map(g => ({ ...g, services: g.services.filter(forType) })).filter(g => g.services.length)
          .map(g => `<div class="group"><h4>${g.icon} ${E(g.label)}</h4>${g.key === 'cable' ? `<p class="small muted">Tick your TV provider and anything on cable channels (live, on demand, or in a network’s app when you sign in with your provider) counts as yours. Showing providers for ${E(MC.region())}.</p>` : ''}<div class="svc-grid">${g.services.map(subTile).join('')}</div></div>`).join('')}
        <label class="field">Country (availability differs by country) <input type="text" data-region maxlength="2" style="text-transform:uppercase;max-width:220px" value="${E(st.region)}" placeholder="${E(MC.region())} (from your browser)"></label>
      </div>
      <div class="card">
        <h2>Appearance</h2>
        <label class="field">Theme <select data-theme-sel>${[['auto', 'Match system'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => `<option value="${v}" ${st.theme === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="switch"><input type="checkbox" data-covers ${st.covers !== false ? 'checked' : ''}> Show real covers, posters, album art and logos</label>
        <p class="small muted">Artwork is looked up by title from Open Library, TVMaze, Wikipedia and Apple, and service logos come from Google’s favicon service. Only titles and site names are sent, never your key or notes. When off, every title gets generated cover art instead. You can set your own image on any library item.</p>
        <div class="row"><button class="btn sm" data-action="refresh-covers">Refresh artwork</button></div>
      </div>
      ${MC.syncCard()}
      <div class="card">
        <h2>Your data</h2>
        <p class="small muted">Everything is stored encrypted in this browser: ${MC.state.library.length} library items, ${MC.state.drops.length} drops, ${Object.keys(MC.state.interests.picks).length} interest picks, ${MC.state.asks.length} saved asks. Export a backup regularly, or to move to another browser.</p>
        <div class="row">
          <button class="btn" data-action="export-json">Export backup (.json)</button>
          <a class="btn" href="#/share/import">Import…</a>
          <a class="btn" href="#/share">Share & export lists →</a>
          <button class="btn" data-action="load-sample">Load sample data</button>
          <button class="btn danger" data-action="reset-all">Erase everything</button>
        </div>
      </div>
      <div class="row settings-foot"><p class="tiny muted grow">MediaCopia · a single-page app · no tracking · synced data is encrypted on your device.</p>
        <button class="btn" data-action="close-settings">✕ Close settings</button></div>
    </div>`;
  },
  mount(root, params) {
    if (params?.[0] === 'sync') root.querySelector('#sync')?.scrollIntoView({ block: 'center' });
    root.querySelector('[data-autolock]')?.addEventListener('change', e => MC.lock.setAutoLock(e.target.value));
    root.querySelector('[data-key]').onchange = e => MC.update(s => { s.settings.apiKey = e.target.value.trim(); });
    root.querySelector('[data-model]').onchange = e => MC.update(s => { s.settings.model = e.target.value; });
    root.querySelector('[data-web]').onchange = e => MC.update(s => { s.settings.webSearch = e.target.checked; });
    root.querySelector('[data-region]').onchange = e => MC.update(s => { s.settings.region = e.target.value.trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2); });
    root.querySelector('[data-covers]').onchange = e => MC.update(s => { s.settings.covers = e.target.checked; });
    root.querySelector('[data-theme-sel]').onchange = e => { MC.update(s => { s.settings.theme = e.target.value; }); MC.applyTheme(); };
    root.querySelectorAll('[data-sub]').forEach(cb => cb.onchange = () => {
      MC.ui.skipRender = true;   // patch in place so the page doesn't jump
      MC.update(s => {
        const set = new Set(s.settings.subs || []);
        cb.checked ? set.add(cb.dataset.sub) : set.delete(cb.dataset.sub);
        s.settings.subs = MC.SERVICES.map(x => x.id).filter(id => set.has(id));
      });
      root.querySelector('[data-sub-count]').textContent = `${MC.state.settings.subs.length} ticked`;
    });
  },
};
MC.actions['toggle-key'] = el => { const i = document.querySelector('[data-key]'); i.type = i.type === 'password' ? 'text' : 'password'; el.textContent = i.type === 'password' ? 'Show' : 'Hide'; };
MC.actions['test-key'] = async () => {
  const input = document.querySelector('[data-key]'); const out = document.querySelector('[data-key-status]');
  MC.ui.skipRender = true; MC.update(s => { s.settings.apiKey = input.value.trim(); });
  if (!MC.hasKey()) { out.innerHTML = '<span style="color:var(--danger)">Enter a key first.</span>'; return; }
  out.innerHTML = '<span class="muted">Checking…</span>';
  try {
    const Anthropic = await MC.loadSDK();
    const client = new Anthropic({ apiKey: MC.state.settings.apiKey, dangerouslyAllowBrowser: true });
    const m = await client.models.retrieve(MC.state.settings.model);
    out.innerHTML = `<span style="color:var(--ok)">✓ Key works — ${E(m.display_name || m.id)} is available.</span>`;
  } catch (e) {
    const Anthropic = await MC.loadSDK().catch(() => null);
    out.innerHTML = `<span style="color:var(--danger)">${E(MC.friendlyError(e, Anthropic).message)}</span>`;
  }
};
MC.actions['refresh-covers'] = () => { MC.clearCovers(); MC.toast('Artwork cache cleared. Covers are looked up again as you browse.'); };
MC.actions['export-json'] = () => { MC.download(`mediacopia-backup-${MC.today()}.json`, MC.exportJSON(false)); MC.toast('Backup downloaded (API key not included)'); };
MC.actions['reset-all'] = async () => {
  if (await MC.confirm('Erase everything?', `This deletes your library, interests, calendar, saved asks and settings${MC.sync.signedIn() ? ', here and on your other synced devices' : ' from this browser'}. Export a backup first if you might want it back.`, 'Erase everything')) {
    MC.resetAll(); MC.clearCovers(); MC.applyTheme(); MC.toast('All data erased');
  }
};
