/**
 * ONE·WAY — loading skeleton.
 */

import { h } from '../../state/dom.js';

/**
 * @param {number} [lines=4]
 * @param {string} [label='Loading…']
 * @returns {HTMLElement}
 */
export function skeleton(lines = 4, label = 'Loading…') {
  const el = h(
    'div',
    { class: 'ow-skeleton', role: 'status', 'aria-live': 'polite' },
    h('span', { class: 'ow-visually-hidden' }, label),
    ...Array.from({ length: Math.max(1, lines) }, (_, i) =>
      h('div', { class: 'ow-skeleton__line', style: { width: `${92 - (i % 3) * 16}%` } }),
    ),
  );
  return el;
}
