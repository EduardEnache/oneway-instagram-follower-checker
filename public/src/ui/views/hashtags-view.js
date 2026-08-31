/**
 * ONE·WAY — followed hashtags.
 */

import { h } from '../../state/dom.js';
import { view } from '../../state/ui-bits.js';
import { createTable } from '../components/data-table.js';
import { emptyState } from '../components/empty-state.js';
import { skeleton } from '../components/skeleton.js';
import { formatDate } from '../../lib/format.js';
import { csvFromObjects } from '../../export/csv.js';
import { downloadCsv, downloadJson, exportFilename } from '../../export/download.js';
import { toast } from '../components/toast.js';

export function render({ store }) {
  const result = store.getResult();
  if (!result) return view({ title: 'Hashtags' }, skeleton(4));

  const tags = [...result.hashtags].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  const root = view({
    title: 'Followed hashtags',
    subtitle: 'Hashtags your account follows. Instagram’s export links these to a bogus profile URL, so the links below are rebuilt from the tag itself.',
  });

  if (!tags.length) {
    root.appendChild(
      emptyState({
        mark: '#',
        title: 'You do not follow any hashtags',
        body: 'Nothing in the following_hashtags file.',
      }),
    );
    return root;
  }

  const table = createTable({
    columns: [
      {
        key: 'tag',
        header: 'Hashtag',
        render: (t) => h('a', { href: t.url, target: '_blank', rel: 'noopener noreferrer' }, `#${t.displayTag}`),
      },
      {
        key: 'timestamp',
        header: 'Followed',
        numeric: true,
        align: 'end',
        render: (t) => formatDate(t.timestamp),
      },
    ],
    rows: tags,
    pinFirst: true,
    caption: 'Followed hashtags',
  });

  const exportBtn = h(
    'button',
    {
      class: 'ow-btn ow-btn--ghost ow-btn--sm',
      type: 'button',
      onClick: () => {
        downloadCsv(
          exportFilename('hashtags', 'csv'),
          csvFromObjects(tags, [
            { key: 'tag', header: 'tag' },
            { key: 'url', header: 'url' },
            { key: 'timestamp', header: 'timestamp_unix', value: (t) => t.timestamp ?? '' },
          ]),
        );
        toast(`Exported ${tags.length} hashtags as CSV.`, 'success');
      },
    },
    'Export CSV',
  );
  const exportJsonBtn = h(
    'button',
    {
      class: 'ow-btn ow-btn--ghost ow-btn--sm',
      type: 'button',
      onClick: () => {
        downloadJson(exportFilename('hashtags', 'json'), { count: tags.length, hashtags: tags });
        toast(`Exported ${tags.length} hashtags as JSON.`, 'success');
      },
    },
    'Export JSON',
  );

  root.appendChild(
    h(
      'section',
      { class: 'ow-panel' },
      h(
        'div',
        { class: 'ow-panel__head' },
        h('h2', { class: 'ow-panel__title' }, `${tags.length} ${tags.length === 1 ? 'hashtag' : 'hashtags'}`),
        h('div', { class: 'ow-panel__tools ow-cluster' }, exportBtn, exportJsonBtn),
      ),
      h('div', { class: 'ow-panel__body' }, table.el),
    ),
  );
  return root;
}
