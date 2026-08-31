/**
 * ONE·WAY — one figure in the dashboard stat strip.
 * Hairline-separated, no card. Numbers render tabular.
 */

import { h } from '../../state/dom.js';

/**
 * @param {{
 *   label: string,
 *   value: string,
 *   hint?: string,
 *   delta?: { text: string, dir: 'up'|'down'|'flat' } | null,
 *   href?: string,
 * }} o
 * @returns {HTMLElement}
 */
export function statTile({ label, value, hint, delta, href }) {
  const inner = [
    h('span', { class: 'ow-stat__label' }, label),
    h('span', { class: 'ow-stat__value' }, value),
    delta
      ? h(
          'span',
          { class: `ow-stat__delta ${delta.dir === 'up' ? 'is-up' : delta.dir === 'down' ? 'is-down' : 'is-flat'}` },
          delta.text,
        )
      : hint
      ? h('span', { class: 'ow-muted', style: { fontSize: 'var(--fs-0)' } }, hint)
      : null,
  ];
  return href
    ? h('a', { class: 'ow-stat', href, style: { textDecoration: 'none' } }, ...inner)
    : h('div', { class: 'ow-stat' }, ...inner);
}
