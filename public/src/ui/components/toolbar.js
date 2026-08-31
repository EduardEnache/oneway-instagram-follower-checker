/**
 * ONE·WAY — list toolbar.
 * Debounced search, sort <select>, an actions slot, and a polite live count.
 */

import { h, debounce } from '../../state/dom.js';

/**
 * @param {{
 *   searchPlaceholder?: string,
 *   sorts: Array<{ value: string, label: string }>,
 *   initialSort?: string,
 *   initialQuery?: string,
 *   onSearch: (q: string) => void,
 *   onSort: (value: string) => void,
 *   actions?: Node[],
 * }} o
 * @returns {{ el: HTMLElement, setCount: (n: number, total: number) => void, focusSearch: () => void }}
 */
export function createToolbar(o) {
  const { sorts, initialSort, initialQuery = '', onSearch, onSort, actions = [] } = o;

  const searchId = `ow-search-${Math.random().toString(36).slice(2, 7)}`;
  const debounced = debounce((v) => onSearch(v), 120);

  const input = h('input', {
    class: 'ow-input',
    id: searchId,
    name: 'list-search',
    type: 'search',
    inputmode: 'search',
    value: initialQuery,
    placeholder: o.searchPlaceholder || 'Search name or @handle…',
    autocomplete: 'off',
    spellcheck: 'false',
    'aria-label': 'Search this list',
    onInput: (e) => debounced(e.target.value),
  });

  const select = h(
    'select',
    {
      class: 'ow-select',
      'aria-label': 'Sort order',
      onChange: (e) => onSort(e.target.value),
    },
    ...sorts.map((s) => h('option', { value: s.value, selected: s.value === initialSort }, s.label)),
  );

  const count = h('span', {
    class: 'ow-toolbar__count ow-tnum',
    'aria-live': 'polite',
    'aria-atomic': 'true',
  }, '');

  const el = h(
    'div',
    { class: 'ow-toolbar', role: 'search' },
    h(
      'div',
      { class: 'ow-toolbar__search' },
      h('label', { class: 'ow-visually-hidden', for: searchId }, 'Search'),
      input,
    ),
    h('div', { class: 'ow-toolbar__sort' }, select),
    count,
    h('div', { class: 'ow-toolbar__actions' }, ...actions),
  );

  return {
    el,
    setCount(n, total) {
      count.textContent =
        n === total ? `${n.toLocaleString()} shown` : `${n.toLocaleString()} of ${total.toLocaleString()} shown`;
    },
    focusSearch: () => input.focus(),
  };
}
