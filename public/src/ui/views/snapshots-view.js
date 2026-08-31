/**
 * ONE·WAY — snapshots & diffs.
 *
 * Snapshots are small packed strings in this browser's localStorage. Diffing the
 * current export against one shows what changed — with the standing caveats that
 * renames and deactivations cannot be told apart from real unfollows.
 */

import { h, clear } from '../../state/dom.js';
import { view, panel, banner, errorBox } from '../../state/ui-bits.js';
import { emptyState } from '../components/empty-state.js';
import { skeleton } from '../components/skeleton.js';
import { renderAccount, accountLabel } from '../../state/accounts.js';
import { confirmModal, promptModal } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { formatDate, formatNumber } from '../../lib/format.js';

export function render({ store }) {
  const result = store.getResult();
  if (!result) return view({ title: 'Snapshots' }, skeleton(5));

  const root = view({
    title: 'Snapshots',
    subtitle: 'Save the current follower and following lists, then compare a later export against them to see who changed.',
  });

  const slot = h('div', { class: 'ow-snapshots__slot' });
  root.appendChild(slot);

  /** @type {any} */
  let mod = null;
  /** @type {string|null} */
  let selectedId = null;

  async function load() {
    clear(slot);
    slot.appendChild(skeleton(4));
    try {
      mod = await import('../../lib/snapshots.js');
      if (!mod || typeof mod.listSnapshots !== 'function') throw new Error('unavailable');
    } catch {
      clear(slot);
      slot.appendChild(
        emptyState({
          mark: '❏',
          title: 'Snapshots are not available in this preview',
          body: 'The snapshot module is not wired up yet. It will let you save the current lists and diff a future export against them.',
        }),
      );
      return;
    }
    paint();
  }

  function paint() {
    clear(slot);

    // storage meter
    let storage = null;
    try {
      storage = mod.estimateStorage();
    } catch {
      storage = null;
    }
    if (storage) {
      const pct = storage.quotaBytes ? Math.min(100, Math.round((storage.usedBytes / storage.quotaBytes) * 100)) : 0;
      const meter = h(
        'div',
        { class: 'ow-panel__body' },
        h(
          'div',
          { class: 'ow-kv' },
          h('span', { class: 'ow-kv__k ow-muted' }, 'Browser storage used'),
          h('span', { class: 'ow-kv__v ow-tnum' }, `${bytes(storage.usedBytes)} / ${bytes(storage.quotaBytes)} (${pct}%)`),
        ),
        h(
          'div',
          {
            class: 'ow-progress',
            role: 'progressbar',
            'aria-valuemin': '0',
            'aria-valuemax': '100',
            'aria-valuenow': String(pct),
            'aria-label': 'Browser storage used by snapshots',
          },
          h('div', { class: 'ow-progress__bar', style: { width: `${pct}%` } }),
        ),
        pct > 70
          ? banner({ kind: 'warn', text: 'Storage is over 70% full. Delete an old snapshot before saving another.' })
          : null,
      );
      slot.appendChild(h('section', { class: 'ow-panel' }, h('div', { class: 'ow-panel__head' }, h('h2', { class: 'ow-panel__title' }, 'Storage')), meter));
    }

    // save action
    const saveBtn = h(
      'button',
      { class: 'ow-btn ow-btn--primary', type: 'button', onClick: onSave },
      'Save current lists as a snapshot',
    );
    slot.appendChild(
      h(
        'section',
        { class: 'ow-panel' },
        h('div', { class: 'ow-panel__body' },
          h('p', { class: 'ow-muted' }, `Captures ${formatNumber(result.stats.followerCount)} followers and ${formatNumber(result.stats.followingCount)} following as they stand in this export.`),
          saveBtn,
        ),
      ),
    );

    // list
    let snaps = [];
    try {
      snaps = mod.listSnapshots() || [];
    } catch {
      snaps = [];
    }

    if (!snaps.length) {
      slot.appendChild(
        emptyState({
          mark: '◷',
          title: 'No snapshots yet',
          body: 'Save one now. The comparison becomes useful once you have a snapshot and a newer export.',
        }),
      );
      return;
    }

    if (!selectedId || !snaps.some((s) => s.id === selectedId)) selectedId = snaps[0].id;

    const listEl = h(
      'ul',
      { class: 'ow-stack', style: { '--gap': 'var(--sp-2)' } },
      ...snaps.map((s) =>
        h(
          'li',
          {
            class: 'ow-cluster',
            style: {
              justifyContent: 'space-between',
              gap: 'var(--sp-3)',
              padding: 'var(--sp-3)',
              border: '1px solid var(--rule)',
              boxShadow: s.id === selectedId ? 'inset 3px 0 0 var(--accent)' : 'none',
              background: s.id === selectedId ? 'var(--tint-accent)' : 'transparent',
            },
          },
          h(
            'button',
            {
              type: 'button',
              'aria-pressed': String(s.id === selectedId),
              style: { textAlign: 'left', display: 'grid', gap: '2px', flex: '1' },
              onClick: () => {
                selectedId = s.id;
                paint();
              },
            },
            h('span', { style: { fontWeight: '600' } }, s.label),
            h(
              'span',
              { class: 'ow-muted ow-tnum', style: { fontSize: 'var(--fs-0)' } },
              `${formatNumber(s.counts.followers)} followers · saved ${formatDate(s.createdAt)}`,
            ),
          ),
          h(
            'span',
            { class: 'ow-cluster' },
            h('button', { class: 'ow-btn ow-btn--ghost ow-btn--sm', type: 'button', onClick: () => onRename(s) }, 'Rename'),
            h('button', { class: 'ow-btn ow-btn--danger ow-btn--sm', type: 'button', onClick: () => onDelete(s) }, 'Delete'),
          ),
        ),
      ),
    );
    slot.appendChild(
      h(
        'section',
        { class: 'ow-panel' },
        h('div', { class: 'ow-panel__head' }, h('h2', { class: 'ow-panel__title' }, `${snaps.length} ${snaps.length === 1 ? 'snapshot' : 'snapshots'}`)),
        h('div', { class: 'ow-panel__body' }, listEl),
      ),
    );

    // diff
    try {
      const diff = mod.diffSnapshot(selectedId, result);
      slot.appendChild(renderDiff(diff, snaps.find((s) => s.id === selectedId)));
    } catch (e) {
      slot.appendChild(errorBox({ message: `Could not diff this snapshot: ${String((e && e.message) || e)}` }));
    }
  }

  async function onSave() {
    const label = await promptModal({
      title: 'Name this snapshot',
      label: 'Label',
      value: result.meta.exportedAt ? new Date(result.meta.exportedAt * 1000).toISOString().slice(0, 10) : '',
      placeholder: 'e.g. before the unfollow spree',
      confirmLabel: 'Save snapshot',
    });
    if (label == null) return;
    try {
      const meta = mod.saveSnapshot(result, label || undefined);
      selectedId = meta.id;
      toast(`Saved snapshot “${meta.label}”.`, 'success');
      paint();
    } catch (e) {
      if (e && e.name === 'QuotaError') {
        clear(slot);
        slot.appendChild(
          errorBox({
            message: `This snapshot needs ${bytes(e.neededBytes)}, but browser storage is nearly full (${bytes(
              e.usedBytes,
            )} already in use). Delete an older snapshot and try again.`,
            actions: [h('button', { class: 'ow-btn ow-btn--primary', type: 'button', onClick: paint }, 'Back to snapshots')],
          }),
        );
      } else {
        toast(`Could not save snapshot: ${String((e && e.message) || e)}`, 'error');
      }
    }
  }

  async function onRename(s) {
    const next = await promptModal({ title: 'Rename snapshot', label: 'New label', value: s.label, confirmLabel: 'Rename' });
    if (!next || next === s.label) return;
    try {
      mod.renameSnapshot(s.id, next);
      toast('Snapshot renamed.', 'success');
      paint();
    } catch (e) {
      toast(`Rename failed: ${String((e && e.message) || e)}`, 'error');
    }
  }

  async function onDelete(s) {
    const ok = await confirmModal({
      title: 'Delete this snapshot?',
      message: `“${s.label}” will be removed from this browser. This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      mod.deleteSnapshot(s.id);
      if (selectedId === s.id) selectedId = null;
      toast('Snapshot deleted.', 'success');
      paint();
    } catch (e) {
      toast(`Delete failed: ${String((e && e.message) || e)}`, 'error');
    }
  }

  load();
  return root;
}

// --------------------------------------------------------------

function renderDiff(diff, meta) {
  const wrap = h('div', { class: 'ow-stack', style: { '--gap': 'var(--sp-5)' } });

  wrap.appendChild(
    h(
      'div',
      { class: 'ow-view__head' },
      h('div', {}, h('h2', { class: 'ow-view__title' }, `Changes since “${meta ? meta.label : 'snapshot'}”`),
        h('p', { class: 'ow-muted' },
          `Base: ${formatNumber(diff.base.counts.followers)} followers · Now: ${formatNumber(diff.current.counts.followers)} followers`,
        ),
      ),
    ),
  );

  if (diff.caveats && diff.caveats.length) {
    wrap.appendChild(
      banner({
        kind: 'warn',
        text: 'Read these before drawing conclusions:',
        messages: diff.caveats.slice(),
      }),
    );
  }

  const sections = [
    ['Lost followers', diff.lostFollowers, 'negative'],
    ['Gained followers', diff.gainedFollowers, 'positive'],
    ['You started following', diff.startedFollowing, 'neutral'],
    ['You stopped following', diff.stoppedFollowing, 'neutral'],
    ['New non-followers', diff.newNonFollowers, 'accent'],
    ['Resolved non-followers', diff.resolvedNonFollowers, 'positive'],
  ];

  const grid = h('div', { class: 'ow-grid' });
  for (const [title, list] of sections) {
    grid.appendChild(
      h(
        'div',
        { class: 'ow-col-6' },
        panel(
          { title: `${title} (${list.length})` },
          list.length
            ? h(
                'ul',
                { class: 'ow-stack', style: { '--gap': 'var(--sp-3)' } },
                ...list.slice(0, 100).map((acc) =>
                  h(
                    'li',
                    { class: 'ow-cluster', style: { justifyContent: 'space-between', gap: 'var(--sp-3)' } },
                    renderAccount(acc, { maybeGone: true }),
                    h('span', { class: 'ow-tnum ow-muted', style: { fontSize: 'var(--fs-0)', whiteSpace: 'nowrap' } }, formatDate(acc.timestamp)),
                  ),
                ),
              )
            : h('p', { class: 'ow-muted' }, `Nothing ${title.toLowerCase()}.`),
          list.length > 100 ? h('p', { class: 'ow-muted' }, `+ ${list.length - 100} more`) : null,
        ),
      ),
    );
  }
  wrap.appendChild(grid);

  wrap.appendChild(
    panel(
      { title: `Likely renames (${diff.likelyRenames.length})` },
      diff.likelyRenames.length
        ? h(
            'ul',
            { class: 'ow-stack', style: { '--gap': 'var(--sp-2)' } },
            ...diff.likelyRenames.map((r) =>
              h(
                'li',
                { class: 'ow-cluster', style: { gap: 'var(--sp-2)' } },
                h('code', {}, `@${r.from}`),
                h('span', { 'aria-hidden': 'true' }, '→'),
                h(
                  'a',
                  {
                    href: `https://www.instagram.com/${encodeURIComponent(r.to)}`,
                    target: '_blank',
                    rel: 'noopener noreferrer',
                    title: 'Open on Instagram (this profile may no longer exist)',
                  },
                  `@${r.to}`,
                ),
                h('span', { class: 'ow-muted ow-tnum' }, ` linked by follow time ${formatDate(r.timestamp)}`),
              ),
            ),
          )
        : h('p', { class: 'ow-muted' }, 'No username looked like a rename between these two exports. A rename is only ever a guess.'),
    ),
  );

  return wrap;
}

function bytes(n) {
  if (n == null || !isFinite(n)) return 'n/a';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
