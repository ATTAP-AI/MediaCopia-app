/* MediaCopia — router, rendering and global event wiring. */
window.MC = window.MC || {};

MC.route = () => {
  const parts = (location.hash.replace(/^#\/?/, '') || 'home').split('/').filter(Boolean);
  const name = MC.views[parts[0]] ? parts[0] : 'home';
  return { name, params: parts.slice(1) };
};

MC.render = () => {
  const { name, params } = MC.route();
  const root = document.getElementById('view');
  const view = MC.views[name];
  const scroll = window.scrollY;
  const same = root.dataset.view === name;
  MC.detailCache = {}; MC.playCache = {}; MC.watchCache = {};   // card lookups are rebuilt on every render
  MC.closePreview?.();
  const body = view.render(params);   // runs first: the Library route can change the media type
  // Results of the header's Ask bar sit at the top of every page, right under the header.
  root.innerHTML = `<div data-aipanel>${MC.aiBarResults(MC.headScope())}</div>${body}`;
  root.dataset.view = name;
  MC.renderHeader(name);
  view.mount?.(root, params);
  if (same) window.scrollTo(0, scroll);
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('active', a.dataset.route === name));
  const lib = MC.state.library.length;
  const up = MC.allEvents().filter(e => e.date >= MC.today()).length;
  document.getElementById('count-library').textContent = lib || '';
  document.getElementById('count-calendar').textContent = up || '';
  document.getElementById('count-watchlist').textContent = MC.state.library.filter(i => i.status === 'want').length || '';
  document.getElementById('count-interests').textContent = MC.typeInterests('all').length || '';   // same total as the All tile
  document.title = name === 'home' ? 'MediaCopia' : `${name[0].toUpperCase() + name.slice(1)} · MediaCopia`;
};

const darkQuery = matchMedia('(prefers-color-scheme: dark)');
// While locked, the theme comes from the last one used (kept unencrypted for this), so the lock screen matches.
const themePref = () => MC.vault?.isOpen() ? MC.state.settings.theme : (() => { try { return localStorage.getItem('mediacopia:theme') || 'auto'; } catch { return 'auto'; } })();
MC.effectiveTheme = () => {
  const t = themePref();
  return t === 'light' || t === 'dark' ? t : (darkQuery.matches ? 'dark' : 'light');
};
MC.applyTheme = () => {
  const t = themePref(), root = document.documentElement;
  if (t === 'light' || t === 'dark') root.dataset.theme = t;
  else delete root.dataset.theme;
  const mode = MC.effectiveTheme();
  root.dataset.mode = mode;   // drives the sun/moon icon
  const label = `Switch to ${mode === 'dark' ? 'light' : 'dark'} mode`;
  document.querySelectorAll('.theme-toggle').forEach(b => {
    b.setAttribute('aria-label', label); b.title = label;
    const l = b.querySelector('.theme-label'); if (l) l.textContent = mode === 'dark' ? 'Light mode' : 'Dark mode';
  });
};
darkQuery.addEventListener('change', MC.applyTheme);   // follow the system while on "Match system"
MC.actions['toggle-theme'] = () => {
  const next = MC.effectiveTheme() === 'dark' ? 'light' : 'dark';
  MC.ui.skipRender = true;   // only the header's toggle needs redrawing, not the page
  MC.update(s => { s.settings.theme = next; });
  MC.applyTheme();
};

// Re-render whenever state is saved (unless an action already patched the DOM in place).
MC.listeners.add(() => {
  if (MC.ui.skipRender) { MC.ui.skipRender = false; return; }
  MC.render();
});

// Global click delegation for data-action buttons.
document.addEventListener('click', e => {
  // closest() returns the innermost match, so a button inside a clickable card wins over the card.
  const el = e.target.closest('[data-action]');
  const fn = el && MC.actions[el.dataset.action];
  if (!fn) return;
  e.preventDefault();
  fn(el, e);
});
document.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('article.clickable[data-action]')) {
    e.preventDefault(); MC.actions[e.target.dataset.action]?.(e.target, e);
  }
});

// Other open tabs reload after a save: see js/vault.js.

// Expose the header's height so things below it (day badges on the Calendar) can stick just under it.
const apphead = document.getElementById('apphead');
// --head-h: how far pages scroll under the header. --cat-w: one category tile's width, so the Home logo matches it.
if (apphead && 'ResizeObserver' in window) new ResizeObserver(() => {
  const root = document.documentElement.style;
  root.setProperty('--head-h', apphead.offsetHeight + 'px');
  const chip = apphead.querySelector('.cat-chip:not(.all)');
  if (chip?.offsetWidth) root.setProperty('--cat-w', chip.offsetWidth + 'px');
}).observe(apphead);

window.addEventListener('hashchange', () => { MC.render(); window.scrollTo(0, 0); });
MC.applyTheme();
MC.render();
MC.lock.boot();   // the lock screen, then your encrypted data and sync (js/lock.js)
