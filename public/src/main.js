/**
 * ONE·WAY — bootstrap.
 * Wires the store, the hash router, the app shell, and the view modules.
 */

import { store } from './state/store.js';
import { createRouter } from './router.js';
import { createAppShell } from './ui/app-shell.js';
import { h } from './state/dom.js';
import { emptyState } from './ui/components/empty-state.js';
import { emitAppEvent } from './emit.js';

import * as landing from './ui/views/landing.js';
import * as dashboard from './ui/views/dashboard.js';
import * as listView from './ui/views/list-view.js';
import * as hashtagsView from './ui/views/hashtags-view.js';
import * as contactsView from './ui/views/contacts-view.js';
import * as snapshotsView from './ui/views/snapshots-view.js';
import * as aboutView from './ui/views/about-view.js';

const VIEWS = {
  landing,
  dashboard,
  list: listView,
  hashtags: hashtagsView,
  contacts: contactsView,
  snapshots: snapshotsView,
  about: aboutView,
};

function boot() {
  const appRoot = document.getElementById('app');
  if (!appRoot) throw new Error('#app missing');

  store.init();

  let router;
  const shell = createAppShell({ store, navigate: (hh) => router.navigate(hh) });
  appRoot.replaceChildren(shell.el);

  let renderToken = 0;

  async function renderRoute(route) {
    const hasData = store.hasData();

    // Redirects.
    if (route.name === 'landing' && hasData) {
      router.navigate('#/dashboard');
      return;
    }
    if (!hasData && route.name !== 'landing' && route.name !== 'about') {
      router.navigate('#/');
      return;
    }

    shell.setActive(route);
    store.setPref('lastRoute', route.hash ? `#${route.hash}` : '#/');

    if (route.name === 'notfound') {
      shell.setView(
        h(
          'div',
          { class: 'ow-view ow-view--narrow' },
          emptyState({
            title: 'Page not found',
            body: `Nothing is routed at "${route.params.path || route.hash}".`,
            action: h('a', { class: 'ow-btn ow-btn--primary', href: '#/dashboard' }, 'Go to dashboard'),
          }),
        ),
      );
      emitAppEvent('view_opened', { view: 'notfound', listId: '' });
      return;
    }

    const mod = VIEWS[route.name];
    if (!mod || typeof mod.render !== 'function') {
      shell.setView(h('div', { class: 'ow-view' }, emptyState({ title: 'This view failed to load' })));
      return;
    }

    const token = ++renderToken;
    try {
      const node = await mod.render({ store, route, navigate: (hh) => router.navigate(hh) });
      if (token !== renderToken) return; // superseded
      shell.setView(node);
      emitAppEvent('view_opened', {
        view: route.name,
        listId: route.params.valid === '1' ? route.params.listId : '',
      });
      window.scrollTo(0, 0);
    } catch (e) {
      console.error('view render failed', e);
      if (token !== renderToken) return;
      shell.setView(
        h(
          'div',
          { class: 'ow-view ow-view--narrow' },
          emptyState({
            title: 'This view hit an error',
            body: String((e && e.message) || e),
            action: h('a', { class: 'ow-btn ow-btn--primary', href: '#/dashboard' }, 'Back to dashboard'),
          }),
        ),
      );
    }
  }

  router = createRouter({ onRoute: renderRoute });

  // Re-render the current route when data appears or disappears.
  let lastHasData = store.hasData();
  store.subscribe(() => {
    shell.refreshCounts();
    const now = store.hasData();
    if (now !== lastHasData) {
      lastHasData = now;
      renderRoute(router.current);
    }
  });

  shell.refreshCounts();
  router.start();

  emitAppEvent('app_loaded', {
    mock: new URLSearchParams(location.search).has('mock') ? '1' : '0',
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
