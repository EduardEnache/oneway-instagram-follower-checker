/**
 * ONE·WAY — contact ↔ account matches.
 *
 * These are GUESSES. A standing, non-dismissible warning says so. Phone numbers
 * are never rendered and never exported unless the user explicitly opts in
 * (which also triggers a confirmation).
 */

import { h, clear } from '../../state/dom.js';
import { view, banner, progress, errorBox } from '../../state/ui-bits.js';
import { createTable } from '../components/data-table.js';
import { emptyState } from '../components/empty-state.js';
import { skeleton } from '../components/skeleton.js';
import { renderAccount } from '../../state/accounts.js';
import { confirmModal } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { csvFromObjects } from '../../export/csv.js';
import { downloadCsv, downloadJson, exportFilename } from '../../export/download.js';

const CONFIDENCE_FILTERS = [
  { value: 'high', label: 'High confidence only' },
  { value: 'medium', label: 'Medium and up' },
  { value: 'all', label: 'All matches' },
];

export function render({ store }) {
  const result = store.getResult();
  if (!result) return view({ title: 'Contacts' }, skeleton(5));

  const prefs = store.getPrefs();
  let filter = prefs.contactConfidence || 'high';
  let includePhone = false;

  const root = view({
    title: 'Contact matches',
    subtitle: `Address-book names from your export lined up against the ${result.contacts.length.toLocaleString()} synced contacts and your follow graph.`,
  });

  root.appendChild(
    banner({
      kind: 'warn',
      text: 'Matches are guesses based on name similarity alone. They are frequently wrong. Do not treat a match as proof that a contact owns an account.',
    }),
  );

  const bodySlot = h('div', { class: 'ow-contacts__slot' });
  root.appendChild(bodySlot);

  function paint() {
    const st = store.getContactState();
    clear(bodySlot);

    if (st.status === 'unavailable') {
      bodySlot.appendChild(
        emptyState({
          mark: '≈',
          title: 'Contact matching is not available in this preview',
          body: 'The matcher module is not wired up yet. Everything else in ONE·WAY works without it.',
        }),
      );
      return;
    }

    if (st.status === 'idle' || st.status === 'loading') {
      bodySlot.appendChild(
        h(
          'div',
          { class: 'ow-stack' },
          h('p', { class: 'ow-muted' }, 'Comparing names… this runs in chunks so the rest of the app stays responsive.'),
          progress({ pct: st.pct || 4, label: 'Matching contacts' }),
          h(
            'button',
            {
              class: 'ow-btn ow-btn--ghost ow-btn--sm',
              type: 'button',
              onClick: () => store.cancelContactMatches(),
            },
            'Stop',
          ),
        ),
      );
      if (st.status === 'idle') store.getContactMatches();
      return;
    }

    if (st.status === 'error') {
      bodySlot.appendChild(
        errorBox({
          message: st.error || 'Contact matching failed.',
          actions: [
            h(
              'button',
              { class: 'ow-btn ow-btn--primary', type: 'button', onClick: () => store.getContactMatches() },
              'Retry',
            ),
          ],
        }),
      );
      return;
    }

    // done
    renderResults(bodySlot, st.matches || []);
  }

  function renderResults(host, matches) {
    const sorted = [...matches].sort((a, b) => b.score - a.score);

    const filterSelect = h(
      'select',
      {
        class: 'ow-select',
        id: 'ow-conf-filter',
        'aria-label': 'Confidence filter',
        onChange: (e) => {
          filter = e.target.value;
          store.setPref('contactConfidence', filter);
          apply();
        },
      },
      ...CONFIDENCE_FILTERS.map((f) => h('option', { value: f.value, selected: f.value === filter }, f.label)),
    );

    const phoneToggle = h('input', {
      type: 'checkbox',
      id: 'ow-include-phone',
      onChange: async (e) => {
        if (e.target.checked) {
          const ok = await confirmModal({
            title: 'Include phone numbers in the export?',
            message:
              'Phone numbers never appear on screen and are left out of exports by default. Ticking this writes them into the downloaded file. In this export they are all empty anyway.',
            confirmLabel: 'Include them',
            danger: true,
          });
          includePhone = ok;
          e.target.checked = ok;
        } else {
          includePhone = false;
        }
      },
    });

    const countEl = h('span', { class: 'ow-toolbar__count ow-tnum', 'aria-live': 'polite' }, '');

    const table = createTable({
      columns: [
        { key: 'contact', header: 'Contact', render: (m) => h('span', { class: 'ow-account__name' }, m.contact.fullName || 'unnamed') },
        { key: 'account', header: 'Possible account', render: (m) => renderAccount(m.account) },
        {
          key: 'list',
          header: 'Found in',
          render: (m) => h('span', { class: 'ow-badge ow-badge--neutral' }, m.accountList),
        },
        {
          key: 'confidence',
          header: 'Confidence',
          render: (m) =>
            h(
              'div',
              { class: 'ow-confidence' },
              h(
                'div',
                { class: 'ow-confidence__bar' },
                h('div', {
                  class: `ow-confidence__fill is-${m.confidence}`,
                  style: { width: `${Math.round(m.score * 100)}%` },
                }),
              ),
              h('span', { class: 'ow-confidence__label ow-tnum' }, `${m.confidence} · ${(m.score * 100).toFixed(0)}%`),
            ),
        },
        {
          key: 'reasons',
          header: 'Why',
          render: (m) =>
            h(
              'div',
              { class: 'ow-reasons' },
              ...(m.reasons || []).map((r) => h('span', { class: 'ow-reason ow-chip' }, r)),
            ),
        },
      ],
      rows: passFilter(sorted, filter),
      caption: 'Contact to account matches, best first',
    });

    function apply() {
      const rows = passFilter(sorted, filter);
      table.setRows(rows);
      countEl.textContent = `${rows.length.toLocaleString()} of ${sorted.length.toLocaleString()} matches`;
      emptyNote.hidden = rows.length !== 0;
    }

    function doExport(kind) {
      const rows = table.getRows();
      if (!rows.length) {
        toast('No matches to export at this confidence level.', 'info');
        return;
      }
      const base = rows.map((m) => {
        const rec = {
          contact_name: m.contact.fullName || '',
          account_username: m.account.username,
          account_display_username: m.account.displayUsername,
          account_name: m.account.name || '',
          found_in: m.accountList,
          score: m.score,
          confidence: m.confidence,
          reasons: (m.reasons || []).join('; '),
        };
        if (includePhone) rec.contact_phone = m.contact.phone || '';
        return rec;
      });
      if (kind === 'csv') {
        const cols = Object.keys(base[0]).map((k) => ({ key: k, header: k }));
        downloadCsv(exportFilename('contact-matches', 'csv'), csvFromObjects(base, cols));
      } else {
        downloadJson(exportFilename('contact-matches', 'json'), {
          note: 'Guessed matches from name similarity. Frequently wrong.',
          includesPhone: includePhone,
          count: base.length,
          matches: base,
        });
      }
      toast(`Exported ${base.length} matches as ${kind.toUpperCase()}${includePhone ? ' (with phone column)' : ''}.`, 'success');
    }

    const emptyNote = emptyState({
      title: 'No matches at this confidence level',
      body: 'Loosen the confidence filter to see weaker guesses, though they are weaker for a reason.',
    });
    emptyNote.hidden = true;

    host.appendChild(
      h(
        'section',
        { class: 'ow-panel' },
        h(
          'div',
          { class: 'ow-panel__head' },
          h('h2', { class: 'ow-panel__title' }, 'Matches'),
          h(
            'div',
            { class: 'ow-panel__tools ow-cluster' },
            h('div', { class: 'ow-field' }, h('label', { class: 'ow-visually-hidden', for: 'ow-conf-filter' }, 'Confidence'), filterSelect),
            countEl,
            h(
              'label',
              { class: 'ow-checkbox', for: 'ow-include-phone' },
              phoneToggle,
              h('span', {}, 'Include phone numbers in exports'),
            ),
            h('button', { class: 'ow-btn ow-btn--ghost ow-btn--sm', type: 'button', onClick: () => doExport('csv') }, 'Export CSV'),
            h('button', { class: 'ow-btn ow-btn--ghost ow-btn--sm', type: 'button', onClick: () => doExport('json') }, 'Export JSON'),
          ),
        ),
        h('div', { class: 'ow-panel__body' }, table.el, emptyNote),
      ),
    );

    apply();
  }

  const unsub = store.subscribe(paint);
  const mo = new MutationObserver(() => {
    if (!root.isConnected) {
      unsub();
      mo.disconnect();
    }
  });
  queueMicrotask(() => root.parentNode && mo.observe(root.parentNode, { childList: true }));

  paint();
  return root;
}

function passFilter(matches, filter) {
  if (filter === 'all') return matches;
  if (filter === 'medium') return matches.filter((m) => m.confidence === 'high' || m.confidence === 'medium');
  return matches.filter((m) => m.confidence === 'high');
}
