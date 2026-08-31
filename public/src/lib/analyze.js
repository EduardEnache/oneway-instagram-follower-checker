/**
 * ONE·WAY — pure, synchronous set-math + stats + growth series.
 *
 * Owned by parser layer. Input is the output of `parseConnections`. Output is a
 * fully JSON-safe `AnalysisResult` MINUS `meta` (pipeline.js fills that in).
 * No Map/Set/Date/class instances survive into the return value.
 *
 * @typedef {import('../contracts/types.js').Account} Account
 * @typedef {import('../contracts/types.js').AnalysisResult} AnalysisResult
 * @typedef {import('../contracts/types.js').SeriesPoint} SeriesPoint
 */

import { LIST_IDS } from '../contracts/types.js';

/**
 * @param {ReturnType<import('./parse.js').parseConnections>} parsed
 * @returns {AnalysisResult}
 */
export function analyze(parsed) {
  /** @type {import('../contracts/types.js').ParseWarning[]} */
  const warnings = parsed.warnings.slice();

  // Dedupe each incoming list by canonical username (first occurrence wins).
  const followers = dedupeByUsername(parsed.lists.followers, 'followers', warnings);
  const following = dedupeByUsername(parsed.lists.following, 'following', warnings);

  const followerSet = new Set(followers.map((a) => a.username));
  const followingSet = new Set(following.map((a) => a.username));

  // Derived relationship views.
  const mutuals = followers.filter((a) => followingSet.has(a.username));
  const fans = followers.filter((a) => !followingSet.has(a.username));
  const nonFollowers = following.filter((a) => !followerSet.has(a.username));

  /** @type {Record<string, Account[]>} */
  const lists = {
    followers,
    following,
    nonFollowers,
    fans,
    mutuals,
    pendingRequests: dedupeByUsername(parsed.lists.pendingRequests, 'pendingRequests', warnings),
    recentRequests: dedupeByUsername(parsed.lists.recentRequests, 'recentRequests', warnings),
    recentlyUnfollowed: dedupeByUsername(parsed.lists.recentlyUnfollowed, 'recentlyUnfollowed', warnings),
    blocked: dedupeByUsername(parsed.lists.blocked, 'blocked', warnings),
    closeFriends: dedupeByUsername(parsed.lists.closeFriends, 'closeFriends', warnings),
    hideStoryFrom: dedupeByUsername(parsed.lists.hideStoryFrom, 'hideStoryFrom', warnings),
    removedSuggestions: dedupeByUsername(parsed.lists.removedSuggestions, 'removedSuggestions', warnings),
  };

  // Sort every list to the contract's deterministic order.
  for (const id of LIST_IDS) lists[id] = sortAccounts(lists[id]);

  const followerCount = followers.length;
  const followingCount = following.length;
  const mutualCount = mutuals.length;
  const fanCount = fans.length;
  const nonFollowerCount = nonFollowers.length;

  /** @type {Record<string, number>} */
  const listCounts = {};
  for (const id of LIST_IDS) listCounts[id] = lists[id].length;

  const stats = {
    followerCount,
    followingCount,
    nonFollowerCount,
    fanCount,
    mutualCount,
    ratio: followingCount ? followerCount / followingCount : 0,
    mutualRate: followingCount ? mutualCount / followingCount : 0,
    oldestFollower: pickByTimestamp(followers, 'min'),
    newestFollower: pickByTimestamp(followers, 'max'),
    oldestFollowing: pickByTimestamp(following, 'min'),
    newestFollowing: pickByTimestamp(following, 'max'),
    listCounts,
  };

  const growth = {
    followers: monthlySeries(followers),
    following: monthlySeries(following),
  };

  return {
    meta: /** @type {any} */ ({
      ownerUsername: null,
      sourceName: '',
      parsedAt: 0,
      exportedAt: parsed.maxTimestamp,
      filesFound: parsed.filesFound.slice(),
      filesMissing: parsed.filesMissing.slice(),
      warnings,
      schemaVersion: 1,
    }),
    lists,
    hashtags: parsed.hashtags.slice(),
    contacts: parsed.contacts.slice(),
    stats,
    growth,
  };
}

// ---------------------------------------------------------------------------

function dedupeByUsername(accounts, listId, warnings) {
  const seen = new Map();
  let dups = 0;
  for (const a of accounts) {
    if (seen.has(a.username)) {
      dups++;
      const first = seen.get(a.username);
      // Merge provenance so `sources` stays informative.
      for (const s of a.sources) if (!first.sources.includes(s)) first.sources.push(s);
      continue;
    }
    seen.set(a.username, { ...a, sources: a.sources.slice() });
  }
  if (dups > 0) {
    warnings.push({
      code: 'duplicate-username',
      file: listId,
      message: `${dups} duplicate username${dups === 1 ? '' : 's'} collapsed in "${listId}".`,
    });
  }
  return [...seen.values()];
}

/**
 * Contract order: timestamp DESC, nulls last, then username ASC.
 * @param {Account[]} arr
 * @returns {Account[]}
 */
export function sortAccounts(arr) {
  return arr.slice().sort((a, b) => {
    const at = a.timestamp;
    const bt = b.timestamp;
    if (at == null && bt == null) return cmpStr(a.username, b.username);
    if (at == null) return 1;
    if (bt == null) return -1;
    if (bt !== at) return bt - at;
    return cmpStr(a.username, b.username);
  });
}

function cmpStr(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function pickByTimestamp(accounts, mode) {
  let best = null;
  for (const a of accounts) {
    if (a.timestamp == null) continue;
    if (!best) {
      best = a;
      continue;
    }
    if (mode === 'min' ? a.timestamp < best.timestamp : a.timestamp > best.timestamp) best = a;
  }
  return best ? { ...best, sources: best.sources.slice() } : null;
}

/**
 * Bucket accounts by UTC month; running cumulative total. Ascending by `t`.
 * @param {Account[]} accounts
 * @returns {SeriesPoint[]}
 */
export function monthlySeries(accounts) {
  const buckets = new Map();
  for (const a of accounts) {
    if (a.timestamp == null) continue;
    const d = new Date(a.timestamp * 1000);
    const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000;
    buckets.set(t, (buckets.get(t) || 0) + 1);
  }
  const points = [...buckets.entries()].sort((x, y) => x[0] - y[0]);
  let total = 0;
  return points.map(([t, count]) => {
    total += count;
    return { t, count, total };
  });
}
