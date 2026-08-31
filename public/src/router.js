/**
 * ONE·WAY — hash router.
 *
 * Routes:
 *   #/                 landing (dropzone) when no data; redirect to #/dashboard when data present
 *   #/dashboard
 *   #/list/<listId>    all 12 ListId values
 *   #/hashtags #/contacts #/snapshots #/about
 */

import { LIST_IDS } from './contracts/types.js';

/** @typedef {{ name: string, params: Record<string,string>, hash: string }} Route */

/**
 * Pure hash → route parser. Exposed for tests.
 * @param {string} hash  e.g. "#/list/nonFollowers"
 * @returns {Route}
 */
export function parseHash(hash) {
  const raw = String(hash || '').replace(/^#/, '');
  const [path] = raw.split('?');
  const segs = path.split('/').filter(Boolean);
  const mk = (name, params = {}) => ({ name, params, hash: raw || '/' });

  if (segs.length === 0) return mk('landing');
  switch (segs[0]) {
    case 'dashboard':
      return mk('dashboard');
    case 'list': {
      const listId = segs[1] || '';
      return mk('list', { listId, valid: LIST_IDS.includes(listId) ? '1' : '' });
    }
    case 'hashtags':
      return mk('hashtags');
    case 'contacts':
      return mk('contacts');
    case 'snapshots':
      return mk('snapshots');
    case 'about':
      return mk('about');
    default:
      return mk('notfound', { path });
  }
}

/**
 * @param {{ onRoute: (route: Route) => void }} opts
 */
export function createRouter({ onRoute }) {
  let current = parseHash(location.hash);

  function handle() {
    current = parseHash(location.hash);
    onRoute(current);
  }

  function navigate(to) {
    const next = to.startsWith('#') ? to : `#${to}`;
    if (location.hash === next) {
      // Same hash — hashchange won't fire; dispatch manually.
      handle();
    } else {
      location.hash = next;
    }
  }

  return {
    start() {
      window.addEventListener('hashchange', handle);
      if (!location.hash) {
        location.replace('#/');
      }
      handle();
    },
    stop() {
      window.removeEventListener('hashchange', handle);
    },
    navigate,
    get current() {
      return current;
    },
  };
}
