/**
 * ONE·WAY — account view-model helpers.
 * Rendering + the search predicate + the four sort comparators, all pure and
 * unit-testable.
 */

import { h } from './dom.js';
import { profileUrl } from '../lib/format.js';

/** Primary label: display name, falling back to the handle. */
export function accountLabel(acc) {
  return acc && acc.name ? acc.name : acc ? acc.displayUsername : '';
}

/**
 * Case-insensitive substring match over name + handle. `q` is trimmed by caller.
 * @param {import('../contracts/types.js').Account} acc
 * @param {string} q  already lower-cased
 * @returns {boolean}
 */
export function accountMatchesQuery(acc, q) {
  if (!q) return true;
  const name = (acc.name || '').toLowerCase();
  const handle = (acc.displayUsername || acc.username || '').toLowerCase();
  return name.includes(q) || handle.includes(q) || ('@' + handle).includes(q);
}

/**
 * The four sort orders. Null timestamps always sort last regardless of
 * direction (a stable "no date" bucket), then `username` ascending as tiebreak.
 * @type {Record<'az'|'za'|'newest'|'oldest', (a:any, b:any) => number>}
 */
export const comparators = {
  az: (a, b) =>
    accountLabel(a).localeCompare(accountLabel(b), undefined, { sensitivity: 'base' }) ||
    a.username.localeCompare(b.username),
  za: (a, b) =>
    accountLabel(b).localeCompare(accountLabel(a), undefined, { sensitivity: 'base' }) ||
    a.username.localeCompare(b.username),
  newest: (a, b) => {
    const ta = a.timestamp;
    const tb = b.timestamp;
    if (ta == null && tb == null) return a.username.localeCompare(b.username);
    if (ta == null) return 1;
    if (tb == null) return -1;
    return tb - ta || a.username.localeCompare(b.username);
  },
  oldest: (a, b) => {
    const ta = a.timestamp;
    const tb = b.timestamp;
    if (ta == null && tb == null) return a.username.localeCompare(b.username);
    if (ta == null) return 1;
    if (tb == null) return -1;
    return ta - tb || a.username.localeCompare(b.username);
  },
};

export const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'az', label: 'Name A-Z' },
  { value: 'za', label: 'Name Z-A' },
];

/**
 * @param {any[]} list
 * @param {string} query   raw (will be trimmed + lower-cased here)
 * @param {'az'|'za'|'newest'|'oldest'} sortKey
 * @returns {any[]}
 */
export function filterAndSort(list, query, sortKey) {
  const q = String(query || '').trim().toLowerCase();
  const filtered = q ? list.filter((a) => accountMatchesQuery(a, q)) : list.slice();
  filtered.sort(comparators[sortKey] || comparators.newest);
  return filtered;
}

/**
 * Render an account identity cell: name (or handle), the handle as a link, and a
 * separate external-link affordance. All outbound links are safe-rel.
 * @param {import('../contracts/types.js').Account} acc
 * @param {{ maybeGone?: boolean }} [opts]
 * @returns {HTMLElement}
 */
export function renderAccount(acc, opts = {}) {
  const url = acc.profileUrl || profileUrl(acc.displayUsername || acc.username);
  const hasName = !!acc.name;
  const linkTitle = opts.maybeGone
    ? 'Open on Instagram (this profile may no longer exist)'
    : 'Open profile on Instagram in a new tab';
  return h(
    'span',
    { class: 'ow-account' },
    h('span', { class: 'ow-account__mark', 'aria-hidden': 'true' }, initials(acc)),
    h(
      'span',
      { class: 'ow-account__name', translate: 'no' },
      hasName ? acc.name : acc.displayUsername,
    ),
    h('span', { class: 'ow-account__handle', translate: 'no' }, '@' + acc.displayUsername),
    opts.maybeGone ? h('span', { class: 'ow-account__meta' }, 'may no longer exist') : null,
    h('a', {
      class: 'ow-account__link',
      href: url,
      target: '_blank',
      rel: 'noopener noreferrer',
      'aria-label': `Open @${acc.displayUsername} on Instagram in a new tab`,
      title: linkTitle,
    }),
  );
}

function initials(acc) {
  const src = (acc.name || acc.displayUsername || acc.username || '').trim();
  if (!src) return '?';
  const parts = src.split(/[\s._-]+/).filter(Boolean);
  const a = parts[0] ? parts[0][0] : '';
  const b = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (a + b || a || '?').toUpperCase();
}
