/**
 * ONE·WAY — accessible data table with optional row virtualization.
 *
 * - Real <table> with a sticky <thead> inside .ow-table__scroll (overflow-x:auto).
 * - Plain render up to ~2000 rows; above that, a fixed-row-height windowed tbody
 *   with top / bottom spacer rows so a 50k-follower list stays smooth.
 * - Sortable header buttons; keyboard operable; aria-sort reflected.
 * - `getRows()` returns the exact rows currently shown (already filtered + sorted
 *   by the caller) for export.
 */

import { h, clear, cssNumber } from '../../state/dom.js';

/**
 * Pure window-bounds math. Exposed for tests.
 * @param {{ scrollTop:number, rowHeight:number, viewportHeight:number, total:number, overscan?:number }} o
 * @returns {{ first:number, last:number, topPad:number, botPad:number }}
 */
export function windowRange({ scrollTop, rowHeight, viewportHeight, total, overscan = 6 }) {
  rowHeight = Math.max(1, rowHeight || 1);
  if (total <= 0) return { first: 0, last: 0, topPad: 0, botPad: 0 };
  const first = Math.max(0, Math.floor(Math.max(0, scrollTop) / rowHeight) - overscan);
  const fit = Math.ceil(Math.max(0, viewportHeight) / rowHeight) + overscan * 2;
  const last = Math.min(total, first + Math.max(1, fit));
  return { first, last, topPad: first * rowHeight, botPad: Math.max(0, (total - last) * rowHeight) };
}

/**
 * @typedef {Object} Column
 * @property {string} key
 * @property {string} header
 * @property {string} [sortKey]              enables the sortable header button
 * @property {'start'|'end'|'center'} [align]
 * @property {(row:any) => (Node|string)} [render]
 * @property {boolean} [numeric]             adds .ow-tnum
 */

/**
 * @param {{
 *   columns: Column[],
 *   rows: any[],
 *   sort?: { key:string, dir:'asc'|'desc' } | null,
 *   onSortChange?: (sort:{ key:string, dir:'asc'|'desc' }) => void,
 *   caption?: string,
 *   virtualizeThreshold?: number,
 *   emptyNode?: Node,
 *   pinFirst?: boolean,
 * }} o
 */
export function createTable(o) {
  const {
    columns,
    onSortChange,
    caption,
    virtualizeThreshold = 2000,
    emptyNode = null,
    pinFirst = false,
  } = o;

  let rows = o.rows || [];
  let sort = o.sort || null;
  const rowHeight = cssNumber('--row-h', 44);

  // ---- head ---------------------------------------------------------
  const headRow = h('tr', { class: 'ow-table__row' });
  /** @type {HTMLButtonElement[]} */
  const sortButtons = [];
  for (const col of columns) {
    const th = h('th', {
      class: 'ow-table__cell' + (col.numeric ? ' ow-table__cell--num' : ''),
      scope: 'col',
    });
    if (col.sortKey && onSortChange) {
      const btn = h(
        'button',
        {
          class: 'ow-table__sort',
          type: 'button',
          onClick: () => {
            const dir = sort && sort.key === col.sortKey && sort.dir === 'asc' ? 'desc' : 'asc';
            onSortChange({ key: col.sortKey, dir });
          },
        },
        col.header,
      );
      btn.dataset.sortKey = col.sortKey;
      sortButtons.push(btn);
      th.appendChild(btn);
    } else {
      th.textContent = col.header;
    }
    headRow.appendChild(th);
  }
  const thead = h('thead', { class: 'ow-table__head' }, headRow);

  const tbody = h('tbody');
  const table = h(
    'table',
    { class: 'ow-table' + (pinFirst ? ' ow-table--pin-first' : '') },
    caption ? h('caption', { class: 'ow-visually-hidden' }, caption) : null,
    thead,
    tbody,
  );
  const scroll = h('div', { class: 'ow-table__scroll' }, table);

  // ---- rendering --------------------------------------------------
  function cell(col, row) {
    const td = h('td', {
      class: 'ow-table__cell' + (col.numeric ? ' ow-table__cell--num ow-tnum' : ''),
    });
    const content = col.render ? col.render(row) : row[col.key];
    td.append(content && content.nodeType ? content : document.createTextNode(content == null ? '' : String(content)));
    return td;
  }

  function buildRow(row) {
    const tr = h('tr', { class: 'ow-table__row' });
    for (const col of columns) tr.appendChild(cell(col, row));
    return tr;
  }

  let scrollHandler = null;
  let rafPending = false;

  function renderPlain() {
    scroll.classList.remove('is-virtual');
    scroll.style.removeProperty('max-height');
    if (scrollHandler) {
      scroll.removeEventListener('scroll', scrollHandler);
      scrollHandler = null;
    }
    clear(tbody);
    if (rows.length === 0) {
      const tr = h('tr', {}, h('td', { class: 'ow-table__cell', colspan: String(columns.length) }, emptyNode || ''));
      tbody.appendChild(tr);
      return;
    }
    const frag = document.createDocumentFragment();
    for (const row of rows) frag.appendChild(buildRow(row));
    tbody.appendChild(frag);
  }

  function renderVirtual() {
    scroll.classList.add('is-virtual');
    if (!scroll.style.maxHeight) scroll.style.maxHeight = 'min(68vh, 680px)';

    const paint = () => {
      rafPending = false;
      const vh = scroll.clientHeight || 480;
      const { first, last, topPad, botPad } = windowRange({
        scrollTop: scroll.scrollTop,
        rowHeight,
        viewportHeight: vh,
        total: rows.length,
      });
      clear(tbody);
      tbody.appendChild(h('tr', { 'aria-hidden': 'true', class: 'ow-table__spacer' }, h('td', { colspan: String(columns.length), style: { height: `${topPad}px`, padding: '0', border: '0' } })));
      for (let i = first; i < last; i++) {
        const tr = buildRow(rows[i]);
        tr.style.height = `${rowHeight}px`;
        tbody.appendChild(tr);
      }
      tbody.appendChild(h('tr', { 'aria-hidden': 'true', class: 'ow-table__spacer' }, h('td', { colspan: String(columns.length), style: { height: `${botPad}px`, padding: '0', border: '0' } })));
    };

    if (!scrollHandler) {
      scrollHandler = () => {
        if (rafPending) return;
        rafPending = true;
        requestAnimationFrame(paint);
      };
      scroll.addEventListener('scroll', scrollHandler, { passive: true });
    }
    paint();
  }

  function render() {
    // reflect sort state on headers
    columns.forEach((col, i) => {
      const th = headRow.children[i];
      const btn = sortButtons.find((b) => b.dataset.sortKey === col.sortKey);
      const active = col.sortKey && sort && sort.key === col.sortKey;
      if (active) th.setAttribute('aria-sort', sort.dir === 'asc' ? 'ascending' : 'descending');
      else th.removeAttribute('aria-sort');
      if (btn) {
        btn.classList.toggle('is-asc', !!active && sort.dir === 'asc');
        btn.classList.toggle('is-desc', !!active && sort.dir === 'desc');
      }
    });
    if (rows.length > virtualizeThreshold) renderVirtual();
    else renderPlain();
  }

  render();

  return {
    el: scroll,
    setRows(next) {
      rows = next || [];
      render();
    },
    setSort(next) {
      sort = next || null;
      render();
    },
    /** The rows currently displayed, in display order. */
    getRows() {
      return rows.slice();
    },
    destroy() {
      if (scrollHandler) scroll.removeEventListener('scroll', scrollHandler);
    },
  };
}
