/**
 * ONE·WAY — application shell.
 * Persistent left rail (grouped nav + per-list counts), a mobile top bar, the
 * theme control, and the <main> region the router paints views into.
 */

import { h, clear } from '../state/dom.js';
import { NAV_GROUPS } from '../state/list-meta.js';
import { formatNumber } from '../lib/format.js';

/**
 * @param {{ store: import('../state/store.js').store, navigate: (hash:string) => void }} ctx
 */
export function createAppShell({ store, navigate }) {
  const themeApi = resolveThemeApi();
  const themeToggleA = createThemeToggle(themeApi);
  const themeToggleB = createThemeToggle(themeApi);

  // ---- sidebar ----------------------------------------------------
  const scroll = h('div', { class: 'ow-sidebar__scroll' });
  /** @type {Map<string,{ link:HTMLElement, countEl:HTMLElement|null }>} */
  const navIndex = new Map();

  for (const group of NAV_GROUPS) {
    const groupEl = h('div', { class: 'ow-sidebar__group' }, h('div', { class: 'ow-sidebar__title' }, group.title));
    for (const item of group.items) {
      const hash = item.listId ? `#/list/${item.listId}` : item.route;
      const countEl = item.listId || item.countKey ? h('span', { class: 'ow-sidebar__link-count' }, '') : null;
      const link = h(
        'a',
        { class: 'ow-sidebar__link', href: hash, onClick: () => closeNav() },
        h('span', {}, item.label),
        countEl,
      );
      navIndex.set(hash, { link, countEl });
      groupEl.appendChild(link);
    }
    scroll.appendChild(groupEl);
  }

  const brand = () =>
    h(
      'span',
      { class: 'ow-brand' },
      'ONE',
      h('span', { class: 'ow-brand__dot' }, '·'),
      'WAY',
    );

  const closeBtn = h(
    'button',
    {
      class: 'ow-sidebar__close ow-btn ow-btn--icon ow-btn--sm',
      type: 'button',
      'aria-label': 'Close menu',
      onClick: () => closeNav(),
    },
    h('span', { 'aria-hidden': 'true' }, '✕'),
  );

  const privacyBadge = h(
    'a',
    { class: 'ow-privacy-badge', href: '#/about' },
    h('span', { class: 'ow-privacy-badge__dot', 'aria-hidden': 'true' }),
    'Runs in your browser. Verify in DevTools',
  );

  const sidebar = h(
    'aside',
    { class: 'ow-sidebar', id: 'ow-sidebar', 'aria-label': 'Primary' },
    h('div', { class: 'ow-sidebar__brand' }, h('a', { href: '#/dashboard', 'aria-label': 'ONE·WAY dashboard', style: { textDecoration: 'none' } }, brand()), closeBtn),
    scroll,
    h('div', { class: 'ow-sidebar__foot' }, themeToggleA.el, privacyBadge),
  );

  const backdrop = h('div', { class: 'ow-sidebar__backdrop', 'aria-hidden': 'true', onClick: () => closeNav() });

  // ---- topbar (mobile) + main --------------------------------
  const menuBtn = h(
    'button',
    {
      class: 'ow-topbar__menu ow-btn ow-btn--icon ow-btn--sm',
      type: 'button',
      'aria-expanded': 'false',
      'aria-controls': 'ow-sidebar',
      'aria-label': 'Open menu',
      onClick: () => toggleNav(),
    },
    h('span', { 'aria-hidden': 'true' }, '☰'),
  );

  const topbar = h(
    'header',
    { class: 'ow-topbar' },
    menuBtn,
    h('span', { class: 'ow-topbar__brand' }, brand()),
    h('div', { class: 'ow-topbar__tools' }, themeToggleB.el),
  );

  const viewHost = h('div', { class: 'ow-viewhost' });
  const main = h('main', { class: 'ow-main', id: 'ow-main', tabindex: '-1' }, topbar, viewHost);

  const skipLink = h(
    'a',
    {
      href: '#ow-main',
      class: 'ow-skip-link ow-visually-hidden',
      style: {
        // becomes visible on focus; kept minimal so it works even before C styles it
        position: 'fixed',
        zIndex: '999',
      },
      onFocus: (e) => e.target.classList.remove('ow-visually-hidden'),
      onBlur: (e) => e.target.classList.add('ow-visually-hidden'),
      onClick: () => {
        closeNav();
        try {
          main.focus();
        } catch {
          /* ignore */
        }
      },
    },
    'Skip to content',
  );

  const el = h('div', { class: 'ow-app' }, skipLink, sidebar, backdrop, main);

  // ---- slide-over ------------------------------------------
  function toggleNav() {
    const open = el.classList.toggle('is-nav-open');
    menuBtn.setAttribute('aria-expanded', String(open));
  }
  function closeNav() {
    el.classList.remove('is-nav-open');
    menuBtn.setAttribute('aria-expanded', 'false');
  }
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && el.classList.contains('is-nav-open')) closeNav();
  });

  // ---- counts + active state ----------------------------
  function refreshCounts() {
    const result = store.getResult();
    for (const [hash, entry] of navIndex) {
      if (!entry.countEl) continue;
      if (!result) {
        entry.countEl.textContent = '';
        continue;
      }
      let n = null;
      const m = hash.match(/^#\/list\/(.+)$/);
      if (m) n = result.stats.listCounts[m[1]] ?? (result.lists[m[1]] || []).length;
      else if (hash === '#/hashtags') n = result.hashtags.length;
      else if (hash === '#/contacts') n = result.contacts.length;
      entry.countEl.textContent = n == null ? '' : formatNumber(n);
    }
  }

  function setActive(route) {
    const active =
      route.name === 'dashboard'
        ? '#/dashboard'
        : route.name === 'list'
        ? `#/list/${route.params.listId}`
        : route.name === 'hashtags'
        ? '#/hashtags'
        : route.name === 'contacts'
        ? '#/contacts'
        : route.name === 'snapshots'
        ? '#/snapshots'
        : route.name === 'about'
        ? '#/about'
        : null;
    for (const [hash, entry] of navIndex) {
      const on = hash === active;
      entry.link.classList.toggle('is-active', on);
      if (on) entry.link.setAttribute('aria-current', 'page');
      else entry.link.removeAttribute('aria-current');
    }
  }

  function setView(node) {
    clear(viewHost);
    viewHost.appendChild(node);
    try {
      main.focus({ preventScroll: true });
    } catch {
      main.focus();
    }
  }

  return { el, refreshCounts, setActive, setView, closeNav };
}

// ---------------------------------------------------------------

function createThemeToggle(themeApi) {
  const modes = [
    ['light', '☀', 'Light'],
    ['dark', '☾', 'Dark'],
    ['system', '◐', 'Match system'],
  ];
  const group = h('div', { class: 'ow-theme-toggle ow-btn-group', role: 'group', 'aria-label': 'Colour theme' });
  const btns = modes.map(([val, glyph, label]) => {
    const b = h(
      'button',
      {
        class: 'ow-btn ow-btn--icon ow-btn--sm',
        type: 'button',
        'data-theme-value': val,
        'aria-label': label,
        title: label,
        onClick: () => themeApi.set(val),
      },
      h('span', { 'aria-hidden': 'true' }, glyph),
    );
    group.appendChild(b);
    return b;
  });
  const sync = () => {
    const cur = themeApi.get();
    for (const b of btns) b.setAttribute('aria-pressed', String(b.dataset.themeValue === cur));
  };
  sync();
  document.addEventListener('themechange', sync);
  return { el: group, sync };
}

/**
 * Prefer the styles layer's `theme.js`. If it is not importable yet, fall back to an
 * equivalent inline implementation writing the same `oneway.theme` key and
 * dispatching the same `themechange` event. TEMPORARY — remove the fallback at
 * integration once `theme.js` is guaranteed present.
 */
function resolveThemeApi() {
  const api = {
    _mode: readMode(),
    get() {
      return this._mode;
    },
    set(mode) {
      this._mode = mode === 'light' || mode === 'dark' ? mode : 'system';
      try {
        localStorage.setItem('oneway.theme', this._mode);
      } catch {
        /* ignore */
      }
      applyMode(this._mode);
    },
    toggle() {
      this.set(this._mode === 'light' ? 'dark' : this._mode === 'dark' ? 'system' : 'light');
    },
  };
  applyMode(api._mode);

  // Upgrade to the real module the moment it is available.
  import('./components/theme.js')
    .then((mod) => {
      if (mod && typeof mod.initTheme === 'function') {
        const real = mod.initTheme();
        api.get = () => real.get();
        api.set = (m) => real.set(m);
        api.toggle = () => real.toggle();
        document.dispatchEvent(new CustomEvent('themechange', { detail: { mode: real.get() } }));
      }
    })
    .catch(() => {
      /* keep the fallback */
    });

  return api;

  function readMode() {
    try {
      const v = localStorage.getItem('oneway.theme');
      return v === 'light' || v === 'dark' ? v : 'system';
    } catch {
      return 'system';
    }
  }
  function applyMode(mode) {
    if (mode === 'light' || mode === 'dark') document.documentElement.setAttribute('data-theme', mode);
    else document.documentElement.removeAttribute('data-theme');
    const resolved =
      mode === 'system'
        ? window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : mode;
    try {
      document.documentElement.style.colorScheme = resolved;
    } catch {
      /* ignore */
    }
    document.dispatchEvent(new CustomEvent('themechange', { detail: { mode, resolved } }));
  }
}
