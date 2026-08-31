/**
 * ONE·WAY — empty state.
 * Callers pass list-specific copy — never a generic "no data".
 */

import { h } from '../../state/dom.js';

/**
 * @param {{ mark?:string, title:string, body?:string, action?:Node, actions?:Node[] }} o
 * @returns {HTMLElement}
 */
export function emptyState({ mark = '∅', title, body, action, actions }) {
  const acts = actions || (action ? [action] : []);
  return h(
    'div',
    { class: 'ow-empty' },
    h('div', { class: 'ow-empty__mark', 'aria-hidden': 'true' }, mark),
    h('p', { class: 'ow-empty__title' }, title),
    body ? h('p', { class: 'ow-empty__body' }, body) : null,
    acts.length ? h('div', { class: 'ow-empty__actions ow-cluster' }, ...acts) : null,
  );
}
