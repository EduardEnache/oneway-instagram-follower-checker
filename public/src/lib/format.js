/**
 * ONE·WAY — shared pure formatters.
 *
 * FROZEN, owned by the integrator (not parser layer or B). Both the parser layer and
 * the UI layer import from here, so nothing in this file may depend on `lib/*`
 * or `ui/*`. Every function is pure and side-effect free.
 *
 * Deliberately does NOT include mojibake decoding — that lives in `lib/decode.js`
 * because it is parser-domain and has real edge cases.
 */

/** @type {Intl.NumberFormat} */
const NUM = new Intl.NumberFormat(undefined);

const DATE_MEDIUM = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
const DATE_SHORT = new Intl.DateTimeFormat(undefined, { year: '2-digit', month: 'numeric', day: 'numeric' });

/**
 * Convert a Unix-seconds timestamp to a Date, or null.
 * @param {number|null|undefined} ts  Unix SECONDS (not milliseconds).
 * @returns {Date|null}
 */
export function unixToDate(ts) {
  if (ts == null || !Number.isFinite(ts) || ts <= 0) return null;
  return new Date(ts * 1000);
}

/**
 * Format a Unix-seconds timestamp for display.
 * @param {number|null|undefined} ts
 * @param {('medium'|'short'|'iso'|'relative')} [style='medium']
 * @returns {string}  A dash ('—') when there is no usable date.
 */
export function formatDate(ts, style = 'medium') {
  const d = unixToDate(ts);
  if (!d) return '—';
  switch (style) {
    case 'iso':
      return d.toISOString().slice(0, 10);
    case 'short':
      return DATE_SHORT.format(d);
    case 'relative':
      return formatRelative(d);
    case 'medium':
    default:
      return DATE_MEDIUM.format(d);
  }
}

/**
 * Coarse relative time ("3 days ago", "in 2 months"). Buckets, not precision.
 * @param {Date} d
 * @returns {string}
 */
function formatRelative(d) {
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const deltaSec = Math.round((d.getTime() - Date.now()) / 1000);
  const abs = Math.abs(deltaSec);
  /** @type {[Intl.RelativeTimeFormatUnit, number][]} */
  const units = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  for (const [unit, secs] of units) {
    if (abs >= secs) return rtf.format(Math.round(deltaSec / secs), unit);
  }
  return rtf.format(deltaSec, 'second');
}

/**
 * Locale-aware integer/decimal formatting.
 * @param {number|null|undefined} n
 * @returns {string}  '—' when not finite.
 */
export function formatNumber(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  return NUM.format(n);
}

/**
 * Format a follower/following ratio to two decimals.
 * @param {number|null|undefined} n
 * @returns {string}  '—' when not finite.
 */
export function formatRatio(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toFixed(2);
}

/**
 * Pick a singular or plural word for a count. Does not include the number.
 * @param {number} n
 * @param {string} one
 * @param {string} many
 * @returns {string}
 */
export function pluralize(n, one, many) {
  return Math.abs(n) === 1 ? one : many;
}

/**
 * Canonical Instagram profile URL builder. Pass the DISPLAY username (original
 * casing); it is URI-encoded defensively.
 * @param {string} displayUsername
 * @returns {string}
 */
export function profileUrl(displayUsername) {
  return `https://www.instagram.com/${encodeURIComponent(String(displayUsername || '').replace(/^@/, ''))}`;
}

/**
 * Truncate a string in the middle with an ellipsis, preserving both ends.
 * @param {string} s
 * @param {number} max  Maximum output length including the ellipsis. Min 5.
 * @returns {string}
 */
export function truncateMiddle(s, max) {
  s = String(s ?? '');
  const cap = Math.max(5, max | 0);
  if (s.length <= cap) return s;
  const keep = cap - 1;
  const head = Math.ceil(keep / 2);
  const tail = Math.floor(keep / 2);
  return `${s.slice(0, head)}…${s.slice(s.length - tail)}`;
}
