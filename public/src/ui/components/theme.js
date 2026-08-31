/**
 * ONE·WAY — theme controller.
 *
 * Three states: 'light' | 'dark' | 'system'. Persists to
 * localStorage['oneway.theme']. In 'system' mode it removes <html data-theme>
 * and lets tokens.css follow the OS, and it re-emits `themechange` when the OS
 * preference flips. Every apply dispatches a `themechange` CustomEvent on
 * `document` with `detail: { mode, resolved }` (resolved is 'light' | 'dark').
 *
 * Idempotent with /theme-init.js (which does the pre-paint pass).
 *
 * @returns {{
 *   get: () => 'light' | 'dark' | 'system',
 *   set: (mode: 'light' | 'dark' | 'system') => void,
 *   toggle: () => void,
 * }}
 */

const KEY = 'oneway.theme';
const MODES = /** @type {const} */ (['light', 'dark', 'system']);

const mql =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

/** @returns {'light'|'dark'|'system'} */
function readStored() {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* storage disabled */
  }
  return 'system';
}

function writeStored(mode) {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* storage disabled — session-only is acceptable */
  }
}

/** @param {'light'|'dark'|'system'} mode */
function resolve(mode) {
  if (mode === 'light' || mode === 'dark') return mode;
  return mql && mql.matches ? 'dark' : 'light';
}

/** @param {'light'|'dark'|'system'} mode */
function apply(mode) {
  const el = document.documentElement;
  const resolved = resolve(mode);
  if (mode === 'system') el.removeAttribute('data-theme');
  else el.setAttribute('data-theme', mode);
  el.style.colorScheme = resolved;
  document.dispatchEvent(
    new CustomEvent('themechange', { detail: { mode, resolved } })
  );
}

export function initTheme() {
  let mode = readStored();

  // Keep 'system' honest when the OS preference changes.
  const onOSChange = () => {
    if (mode === 'system') apply('system');
  };
  if (mql) {
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', onOSChange);
    } else if (typeof mql.addListener === 'function') {
      mql.addListener(onOSChange); // Safari < 14
    }
  }

  // Emit an initial themechange so listeners (charts, toggle UI) sync now.
  apply(mode);

  return {
    get: () => mode,
    /** @param {'light'|'dark'|'system'} next */
    set(next) {
      if (!MODES.includes(next) || next === mode) {
        if (MODES.includes(next)) apply(next); // still re-sync listeners
        return;
      }
      mode = next;
      writeStored(next);
      apply(next);
    },
    toggle() {
      mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
      writeStored(mode);
      apply(mode);
    },
  };
}
