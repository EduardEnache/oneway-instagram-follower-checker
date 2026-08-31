/**
 * ONE·WAY — dashboard.
 * Stat strip → full-bleed growth chart → split chart → two-up "top movers".
 */

import { h } from '../../state/dom.js';
import { view, panel, banner } from '../../state/ui-bits.js';
import { statTile } from '../components/stat-tile.js';
import { emptyState } from '../components/empty-state.js';
import { skeleton } from '../components/skeleton.js';
import { renderAccount } from '../../state/accounts.js';
import { formatNumber, formatRatio, formatDate } from '../../lib/format.js';

/**
 * @param {{ store: import('../../state/store.js').store, navigate:(h:string)=>void }} ctx
 */
export function render({ store }) {
  const result = store.getResult();
  if (!result) return view({ title: 'Dashboard' }, skeleton(6));

  const s = result.stats;
  const root = view({ title: 'Dashboard', subtitle: overviewLine(result) });

  if (result.meta.warnings && result.meta.warnings.length) {
    root.appendChild(
      banner({
        kind: 'warn',
        text: `Parsed with ${result.meta.warnings.length} ${
          result.meta.warnings.length === 1 ? 'note' : 'notes'
        }. Your numbers are still usable.`,
        messages: result.meta.warnings.map((w) => `${w.file ? w.file + ': ' : ''}${w.message}`),
        dismissable: true,
      }),
    );
  }

  // ---- stat strip (exactly 5) ------------------------------
  root.appendChild(
    h(
      'div',
      { class: 'ow-stat-strip' },
      statTile({ label: 'Followers', value: formatNumber(s.followerCount), href: '#/list/followers' }),
      statTile({ label: 'Following', value: formatNumber(s.followingCount), href: '#/list/following' }),
      statTile({
        label: 'Follower / following',
        value: formatRatio(s.ratio),
        hint: s.ratio >= 1 ? 'more follow you than you follow' : 'you follow more than follow you',
      }),
      statTile({
        label: 'Non-followers',
        value: formatNumber(s.nonFollowerCount),
        hint: "you follow, they don't",
        href: '#/list/nonFollowers',
      }),
      statTile({ label: 'Fans', value: formatNumber(s.fanCount), hint: "follow you, you don't", href: '#/list/fans' }),
    ),
  );
  root.appendChild(
    h(
      'p',
      { class: 'ow-muted', style: { margin: 'calc(-1 * var(--sp-4)) 0 var(--sp-6)', fontSize: 'var(--fs-0)' } },
      `${pct(s.mutualRate)} of the accounts you follow follow you back. That is `,
      h('a', { href: '#/list/mutuals' }, `${formatNumber(s.mutualCount)} mutuals`),
      '.',
    ),
  );

  // ---- growth (full-bleed) -----------------------------
  const growthMount = h('div', {});
  root.appendChild(
    panel(
      {
        title: 'Followers over time',
        bleed: true,
        tools: [legendItem('Followers', 'followers'), legendItem('Following', 'following')],
      },
      growthMount,
    ),
  );

  // ---- split ------------------------------------------
  const splitMount = h('div', {});
  root.appendChild(panel({ title: 'How your follows break down' }, splitMount));

  // ---- two-up movers --------------------------------
  const followersByNew = [...result.lists.followers].sort(byTsDesc).slice(0, 8);
  const nonFollowersByNew = [...result.lists.nonFollowers].sort(byTsDesc).slice(0, 8);

  const leftCell = h('div', { class: 'ow-col-6' });
  const rightCell = h('div', { class: 'ow-col-6' });
  leftCell.appendChild(
    panel(
      { title: 'Newest followers' },
      followersByNew.length
        ? moverList(followersByNew, s.newestFollower)
        : emptyState({ title: 'No followers to show', body: 'This export lists no followers.' }),
    ),
  );
  rightCell.appendChild(
    panel(
      { title: 'Most recent non-followers' },
      nonFollowersByNew.length
        ? moverList(nonFollowersByNew)
        : emptyState({
            title: 'Everyone you follow follows you back',
            body: 'There is nothing one-way in this export.',
          }),
    ),
  );
  root.appendChild(h('div', { class: 'ow-grid' }, leftCell, rightCell));

  maybeSnapshotDelta(rightCell, result);

  requestAnimationFrame(() => {
    mountGrowth(growthMount, result);
    mountSplit(splitMount, s);
  });

  return root;
}

// ---------------------------------------------------------------

function pct(n) {
  return `${Math.round((n || 0) * 1000) / 10}%`;
}

function overviewLine(result) {
  const parts = [];
  if (result.meta.exportedAt) parts.push(`Export from ${formatDate(result.meta.exportedAt)}`);
  const of = result.stats.oldestFollower;
  if (of && of.timestamp) parts.push(`oldest follow ${formatDate(of.timestamp)}`);
  return parts.join(' · ');
}

function byTsDesc(a, b) {
  const ta = a.timestamp == null ? -Infinity : a.timestamp;
  const tb = b.timestamp == null ? -Infinity : b.timestamp;
  return tb - ta || a.username.localeCompare(b.username);
}

function legendItem(label, key) {
  return h(
    'span',
    { class: 'ow-chart__legend-item' },
    h('span', { class: `ow-chart__swatch ow-chart__swatch--${key}`, 'aria-hidden': 'true' }),
    label,
  );
}

function moverList(accounts, highlight) {
  return h(
    'ul',
    { class: 'ow-stack', style: { '--gap': 'var(--sp-3)' } },
    ...accounts.map((acc) =>
      h(
        'li',
        {
          class: 'ow-cluster',
          style: { justifyContent: 'space-between', gap: 'var(--sp-3)' },
        },
        renderAccount(acc),
        h(
          'span',
          { class: 'ow-muted ow-tnum', style: { fontSize: 'var(--fs-0)', whiteSpace: 'nowrap' } },
          (highlight && highlight.username === acc.username ? 'newest · ' : '') + formatDate(acc.timestamp),
        ),
      ),
    ),
  );
}

async function mountGrowth(el, result) {
  try {
    const mod = await import('../components/chart-growth.js');
    if (mod && typeof mod.mountGrowthChart === 'function') {
      mod.mountGrowthChart(el, { followers: result.growth.followers, following: result.growth.following }, {
        formatNumber,
        formatDate: (t) => formatDate(t, 'short'),
      });
      return;
    }
    throw new Error('no mountGrowthChart');
  } catch {
    el.appendChild(
      chartFallback(
        `${formatNumber(result.stats.followerCount)} followers and ${formatNumber(
          result.stats.followingCount,
        )} following across ${result.growth.followers.length} monthly points. Chart module not in this preview.`,
      ),
    );
  }
}

async function mountSplit(el, stats) {
  try {
    const mod = await import('../components/chart-split.js');
    if (mod && typeof mod.mountSplitChart === 'function') {
      mod.mountSplitChart(
        el,
        { mutuals: stats.mutualCount, nonFollowers: stats.nonFollowerCount, fans: stats.fanCount },
        { formatNumber },
      );
      return;
    }
    throw new Error('no mountSplitChart');
  } catch {
    el.appendChild(
      h(
        'div',
        { class: 'ow-stack', style: { '--gap': 'var(--sp-2)' } },
        splitRow('Mutuals', stats.mutualCount, 'positive'),
        splitRow('Non-followers', stats.nonFollowerCount, 'accent'),
        splitRow('Fans', stats.fanCount, 'neutral'),
      ),
    );
  }
}

function chartFallback(text) {
  return h('p', { class: 'ow-chart__empty ow-muted' }, text);
}

function splitRow(label, n, tone) {
  return h(
    'div',
    { class: 'ow-kv' },
    h('span', { class: 'ow-kv__k' }, h('span', { class: `ow-badge ow-badge--${tone}` }, label)),
    h('span', { class: 'ow-kv__v ow-tnum' }, formatNumber(n)),
  );
}

async function maybeSnapshotDelta(rightCell, result) {
  try {
    const mod = await import('../../lib/snapshots.js');
    if (!mod || typeof mod.listSnapshots !== 'function') return;
    const snaps = mod.listSnapshots();
    if (!snaps || !snaps.length) return;
    const latest = snaps[0];
    const diff = mod.diffSnapshot(latest.id, result);
    const gained = diff.gainedFollowers.slice(0, 5);
    const lost = diff.lostFollowers.slice(0, 5);
    rightCell.replaceChildren(
      panel(
        { title: `Since “${latest.label}”`, tools: [h('a', { href: '#/snapshots' }, 'Full diff')] },
        h(
          'p',
          { style: { marginBottom: 'var(--sp-3)' } },
          h('span', { class: 'ow-badge ow-badge--positive' }, `+${diff.gainedFollowers.length}`),
          ' gained  ',
          h('span', { class: 'ow-badge ow-badge--negative' }, `−${diff.lostFollowers.length}`),
          ' lost',
        ),
        gained.length ? h('p', { class: 'ow-muted', style: { fontSize: 'var(--fs-0)' } }, 'Recently gained') : null,
        gained.length ? moverList(gained) : null,
        lost.length ? h('p', { class: 'ow-muted', style: { fontSize: 'var(--fs-0)', marginTop: 'var(--sp-3)' } }, 'Recently lost') : null,
        lost.length ? moverList(lost) : null,
      ),
    );
  } catch {
    /* keep the non-followers panel */
  }
}
