/**
 * ONE·WAY — one generic list view, parameterized by ListId.
 * Drives all 12 relationship routes.
 */

import { h } from '../../state/dom.js';
import { view, panel } from '../../state/ui-bits.js';
import { createToolbar } from '../components/toolbar.js';
import { createTable } from '../components/data-table.js';
import { emptyState } from '../components/empty-state.js';
import { LIST_META } from '../../state/list-meta.js';
import { filterAndSort, renderAccount, accountLabel, SORT_OPTIONS } from '../../state/accounts.js';
import { csvFromObjects } from '../../export/csv.js';
import { downloadCsv, downloadJson, exportFilename } from '../../export/download.js';
import { formatDate } from '../../lib/format.js';
import { toast } from '../components/toast.js';

/**
 * @param {{ store: import('../../state/store.js').store, route:{ params:Record<string,string> }, navigate:(h:string)=>void }} ctx
 */
export function render({ store, route }) {
  const result = store.getResult();
  const listId = route.params.listId;
  const meta = LIST_META[listId];

  if (!result || !meta) {
    return view(
      { title: 'Unknown list', narrow: true },
      emptyState({
        title: 'That list does not exist',
        body: 'The address bar points at a relationship list ONE·WAY does not have.',
        action: h('a', { class: 'ow-btn ow-btn--primary', href: '#/dashboard' }, 'Back to dashboard'),
      }),
    );
  }

  const source = result.lists[listId]; // always an array per contract
  const prefs = store.getPrefs();
  let sortKey = prefs.listSort[listId] || 'newest';
  let query = '';

  const root = view({ title: meta.label, subtitle: meta.blurb });

  if (source.length === 0) {
    root.appendChild(emptyState({ mark: '◦', title: meta.emptyTitle, body: meta.emptyBody }));
    return root;
  }

  // ---- table -------------------------------------------------
  const columns = [
    {
      key: 'account',
      header: 'Account',
      sortKey: 'name',
      render: (acc) => renderAccount(acc),
    },
    {
      key: 'timestamp',
      header: meta.dateCol,
      sortKey: 'timestamp',
      numeric: true,
      align: 'end',
      render: (acc) => formatDate(acc.timestamp),
    },
  ];

  const table = createTable({
    columns,
    pinFirst: true,
    rows: filterAndSort(source, query, sortKey),
    sort: { key: sortKey === 'az' || sortKey === 'za' ? 'name' : 'timestamp', dir: sortKey === 'az' || sortKey === 'oldest' ? 'asc' : 'desc' },
    caption: `${meta.label}: ${meta.blurb}`,
    onSortChange: ({ key, dir }) => {
      sortKey = key === 'name' ? (dir === 'asc' ? 'az' : 'za') : dir === 'asc' ? 'oldest' : 'newest';
      applySort();
      syncToolbarSelect();
    },
  });

  // ---- toolbar ------------------------------------------
  const exportCsvBtn = h(
    'button',
    { class: 'ow-btn ow-btn--ghost ow-btn--sm', type: 'button', onClick: () => doExport('csv') },
    'Export CSV',
  );
  const exportJsonBtn = h(
    'button',
    { class: 'ow-btn ow-btn--ghost ow-btn--sm', type: 'button', onClick: () => doExport('json') },
    'Export JSON',
  );

  const toolbar = createToolbar({
    sorts: SORT_OPTIONS,
    initialSort: sortKey,
    onSearch: (q) => {
      query = q;
      applySort();
    },
    onSort: (v) => {
      sortKey = v;
      store.setListSort(listId, v);
      applySort();
      table.setSort({
        key: v === 'az' || v === 'za' ? 'name' : 'timestamp',
        dir: v === 'az' || v === 'oldest' ? 'asc' : 'desc',
      });
    },
    actions: [exportCsvBtn, exportJsonBtn],
  });

  function syncToolbarSelect() {
    const sel = toolbar.el.querySelector('select');
    if (sel) sel.value = sortKey;
    store.setListSort(listId, sortKey);
  }

  function currentRows() {
    return filterAndSort(source, query, sortKey);
  }

  function applySort() {
    const rows = currentRows();
    table.setRows(rows);
    toolbar.setCount(rows.length, source.length);
    if (rows.length === 0) {
      emptyHint.hidden = false;
    } else {
      emptyHint.hidden = true;
    }
  }

  function doExport(kind) {
    const rows = table.getRows();
    if (!rows.length) {
      toast('Nothing to export with the current search.', 'info');
      return;
    }
    if (kind === 'csv') {
      const csv = csvFromObjects(rows, [
        { key: 'username', header: 'username' },
        { key: 'name', header: 'name', value: (a) => a.name || '' },
        { key: 'displayUsername', header: 'display_username' },
        { key: 'profileUrl', header: 'profile_url' },
        { key: 'timestamp', header: 'timestamp_unix', value: (a) => (a.timestamp == null ? '' : a.timestamp) },
        { key: 'date', header: 'date_iso', value: (a) => (a.timestamp ? new Date(a.timestamp * 1000).toISOString().slice(0, 10) : '') },
      ]);
      downloadCsv(exportFilename(listId, 'csv'), csv);
    } else {
      downloadJson(exportFilename(listId, 'json'), {
        list: listId,
        label: meta.label,
        generatedAt: new Date().toISOString(),
        source: result.meta.sourceName,
        count: rows.length,
        accounts: rows.map((a) => ({
          username: a.username,
          displayUsername: a.displayUsername,
          name: a.name,
          profileUrl: a.profileUrl,
          externalUrl: a.externalUrl,
          timestamp: a.timestamp,
          date: a.timestamp ? new Date(a.timestamp * 1000).toISOString().slice(0, 10) : null,
        })),
      });
    }
    toast(`Exported ${rows.length.toLocaleString()} ${meta.label.toLowerCase()} as ${kind.toUpperCase()}.`, 'success');
  }

  const emptyHint = emptyState({
    title: 'Nothing matches that search',
    body: 'Clear the search box to see the whole list again.',
  });
  emptyHint.hidden = true;

  root.appendChild(panel({ flush: true }, toolbar.el, table.el, h('div', { style: { padding: 'var(--sp-4)' } }, emptyHint)));

  // initial count
  toolbar.setCount(source.length, source.length);

  return root;
}

// Re-exports so ui.test.js can import predicate + comparators from one place.
export { comparators, accountMatchesQuery, filterAndSort } from '../../state/accounts.js';
