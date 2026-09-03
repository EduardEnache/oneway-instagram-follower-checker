/**
 * ONE·WAY — localStorage snapshot store + diff.
 *
 * Owned by parser layer. Keys (and ONLY these):
 *   oneway.snapshots.index      -> JSON SnapshotMeta[]
 *   oneway.snapshot.<id>        -> JSON Snapshot (meta + PACKED follower/following strings)
 *
 * Packed format: newline-separated `username\ttimestamp`; the timestamp segment
 * is empty when unknown. ~20 bytes/account keeps big graphs under the ~5 MB quota.
 *
 * @typedef {import('../contracts/types.js').AnalysisResult} AnalysisResult
 * @typedef {import('../contracts/types.js').Account} Account
 * @typedef {import('../contracts/types.js').SnapshotMeta} SnapshotMeta
 * @typedef {import('../contracts/types.js').Snapshot} Snapshot
 * @typedef {import('../contracts/types.js').SnapshotDiff} SnapshotDiff
 * @typedef {import('../contracts/types.js').RenameGuess} RenameGuess
 */

import { profileUrl } from './format.js';
import { sortAccounts } from './analyze.js';
import { emitAppEvent } from './emit.js';

const INDEX_KEY = 'oneway.snapshots.index';
const SNAP_PREFIX = 'oneway.snapshot.';
const APPROX_QUOTA_BYTES = 5 * 1024 * 1024;

/** Thrown by `saveSnapshot` when localStorage cannot hold the payload. */
export class QuotaError extends Error {
  /** @param {string} message @param {number} usedBytes @param {number} neededBytes */
  constructor(message, usedBytes, neededBytes) {
    super(message);
    this.name = 'QuotaError';
    this.usedBytes = usedBytes;
    this.neededBytes = neededBytes;
  }
}

/**
 * @returns {SnapshotMeta[]}  sorted by createdAt DESC
 */
export function listSnapshots() {
  const raw = safeGet(INDEX_KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  } catch {
    return [];
  }
}

/**
 * @param {AnalysisResult} result
 * @param {string} [label]
 * @returns {SnapshotMeta}
 * @throws {QuotaError}
 */
export function saveSnapshot(result, label) {
  const createdAt = Math.floor(Date.now() / 1000);
  const id = `snap_${createdAt}_${rand4()}`;
  const exportedAt =
    result && result.meta && typeof result.meta.exportedAt === 'number' ? result.meta.exportedAt : null;
  const ownerUsername = (result && result.meta && result.meta.ownerUsername) || null;

  const followers = result.lists.followers;
  const following = result.lists.following;

  /** @type {SnapshotMeta} */
  const meta = {
    id,
    label: label && String(label).trim() ? String(label).trim() : isoDay(exportedAt != null ? exportedAt : createdAt),
    createdAt,
    exportedAt,
    ownerUsername,
    counts: { followers: followers.length, following: following.length },
    schemaVersion: 1,
  };

  /** @type {Snapshot} */
  const snap = { ...meta, followers: pack(followers), following: pack(following) };
  const payload = JSON.stringify(snap);
  const neededBytes = payload.length * 2;

  try {
    localStorage.setItem(SNAP_PREFIX + id, payload);
  } catch (err) {
    throw new QuotaError(quotaMessage(neededBytes), usedBytes(), neededBytes);
  }

  const index = listSnapshots();
  index.unshift(meta);
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(index));
  } catch (err) {
    localStorage.removeItem(SNAP_PREFIX + id); // roll back
    throw new QuotaError(quotaMessage(neededBytes), usedBytes(), neededBytes);
  }
  emitAppEvent('snapshot_saved', {});
  return meta;
}

/**
 * @param {string} id
 */
export function deleteSnapshot(id) {
  safeRemove(SNAP_PREFIX + id);
  const index = listSnapshots().filter((m) => m.id !== id);
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(index));
  } catch {
    /* best effort */
  }
}

/**
 * @param {string} id
 * @param {string} label
 */
export function renameSnapshot(id, label) {
  const next = String(label == null ? '' : label).trim();
  const index = listSnapshots();
  let changed = false;
  for (const m of index) {
    if (m.id === id) {
      m.label = next;
      changed = true;
    }
  }
  if (changed) {
    try {
      localStorage.setItem(INDEX_KEY, JSON.stringify(index));
    } catch {
      /* ignore */
    }
    const raw = safeGet(SNAP_PREFIX + id);
    if (raw) {
      try {
        const snap = JSON.parse(raw);
        snap.label = next;
        localStorage.setItem(SNAP_PREFIX + id, JSON.stringify(snap));
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * @param {string} id
 * @param {AnalysisResult} result
 * @returns {SnapshotDiff}
 */
export function diffSnapshot(id, result) {
  const raw = safeGet(SNAP_PREFIX + id);
  if (!raw) throw new Error(`Snapshot "${id}" not found`);
  /** @type {Snapshot} */
  const snap = JSON.parse(raw);

  const baseFollowers = unpack(snap.followers);
  const baseFollowing = unpack(snap.following);
  const baseFollowerSet = new Set(baseFollowers.map((r) => r.username));
  const baseFollowingSet = new Set(baseFollowing.map((r) => r.username));

  const curFollowers = result.lists.followers;
  const curFollowing = result.lists.following;
  const curFollowerSet = new Set(curFollowers.map((a) => a.username));
  const curFollowingSet = new Set(curFollowing.map((a) => a.username));

  // Base non-followers = base.following \ base.followers
  const baseNonFollowerSet = new Set(
    baseFollowing.filter((r) => !baseFollowerSet.has(r.username)).map((r) => r.username),
  );
  const curNonFollowerSet = new Set(result.lists.nonFollowers.map((a) => a.username));
  const baseFollowingRecByName = new Map(baseFollowing.map((r) => [r.username, r]));

  let lostFollowers = baseFollowers
    .filter((r) => !curFollowerSet.has(r.username))
    .map(synthAccount);
  let gainedFollowers = curFollowers.filter((a) => !baseFollowerSet.has(a.username)).map(cloneAccount);

  const startedFollowing = curFollowing.filter((a) => !baseFollowingSet.has(a.username)).map(cloneAccount);
  const stoppedFollowing = baseFollowing
    .filter((r) => !curFollowingSet.has(r.username))
    .map(synthAccount);

  const newNonFollowers = result.lists.nonFollowers
    .filter((a) => !baseNonFollowerSet.has(a.username))
    .map(cloneAccount);
  const resolvedNonFollowers = [...baseNonFollowerSet]
    .filter((u) => !curNonFollowerSet.has(u))
    .map((u) => synthAccount(baseFollowingRecByName.get(u) || { username: u, timestamp: null }));

  // A username also present in recentlyUnfollowed is a CONFIRMED unfollow — it
  // stays in lostFollowers and is excluded from rename pairing.
  const confirmedUnfollow = new Set(result.lists.recentlyUnfollowed.map((a) => a.username));

  /** @type {RenameGuess[]} */
  const likelyRenames = [];
  const gainedByTs = new Map();
  for (const g of gainedFollowers) {
    if (g.timestamp == null) continue;
    if (!gainedByTs.has(g.timestamp)) gainedByTs.set(g.timestamp, []);
    gainedByTs.get(g.timestamp).push(g);
  }
  const usedGained = new Set();
  const keptLost = [];
  for (const l of lostFollowers) {
    if (l.timestamp != null && !confirmedUnfollow.has(l.username) && gainedByTs.has(l.timestamp)) {
      const pool = gainedByTs.get(l.timestamp).filter((g) => !usedGained.has(g.username));
      if (pool.length) {
        const g = pool[0];
        usedGained.add(g.username);
        likelyRenames.push({ from: l.username, to: g.username, timestamp: l.timestamp });
        continue;
      }
    }
    keptLost.push(l);
  }
  lostFollowers = keptLost;
  gainedFollowers = gainedFollowers.filter((g) => !usedGained.has(g.username));

  return {
    base: metaOf(snap),
    current: {
      exportedAt: result.meta ? result.meta.exportedAt : null,
      counts: { followers: curFollowers.length, following: curFollowing.length },
    },
    lostFollowers: sortAccounts(lostFollowers),
    gainedFollowers: sortAccounts(gainedFollowers),
    startedFollowing: sortAccounts(startedFollowing),
    stoppedFollowing: sortAccounts(stoppedFollowing),
    newNonFollowers: sortAccounts(newNonFollowers),
    resolvedNonFollowers: sortAccounts(resolvedNonFollowers),
    likelyRenames,
    caveats: STANDING_CAVEATS.slice(),
  };
}

/**
 * @returns {{ usedBytes: number, quotaBytes: number, snapshotCount: number }}
 */
export function estimateStorage() {
  return {
    usedBytes: usedBytes(),
    quotaBytes: APPROX_QUOTA_BYTES,
    snapshotCount: listSnapshots().length,
  };
}

// ---------------------------------------------------------------------------

const STANDING_CAVEATS = [
  'Rename guesses pair a username that vanished with one that appeared, linked only by an identical follow timestamp. They are heuristics and can be wrong.',
  'A deactivated or deleted account is indistinguishable from someone who unfollowed you — both simply disappear from the list.',
  "Instagram builds each export with its own lag, so very recent follows or unfollows may not appear in either the snapshot or the current file.",
];

/** @param {Account[]} accounts */
export function pack(accounts) {
  return accounts
    .map((a) => `${a.username}\t${a.timestamp == null ? '' : a.timestamp}`)
    .join('\n');
}

/**
 * @param {string} packed
 * @returns {{ username: string, timestamp: number|null }[]}
 */
export function unpack(packed) {
  if (!packed) return [];
  const out = [];
  for (const line of String(packed).split('\n')) {
    if (!line) continue;
    const tab = line.indexOf('\t');
    const username = tab === -1 ? line : line.slice(0, tab);
    const tsSeg = tab === -1 ? '' : line.slice(tab + 1);
    if (!username) continue;
    const ts = tsSeg === '' ? null : Number(tsSeg);
    out.push({ username, timestamp: Number.isFinite(ts) ? ts : null });
  }
  return out;
}

function synthAccount(rec) {
  const username = rec.username;
  return {
    username,
    displayUsername: username,
    name: null,
    profileUrl: profileUrl(username),
    externalUrl: null,
    timestamp: rec.timestamp == null ? null : rec.timestamp,
    fbid: null,
    sources: [],
  };
}

function cloneAccount(a) {
  return { ...a, sources: a.sources.slice() };
}

function metaOf(snap) {
  return {
    id: snap.id,
    label: snap.label,
    createdAt: snap.createdAt,
    exportedAt: snap.exportedAt == null ? null : snap.exportedAt,
    ownerUsername: snap.ownerUsername == null ? null : snap.ownerUsername,
    counts: {
      followers: snap.counts ? snap.counts.followers : unpack(snap.followers).length,
      following: snap.counts ? snap.counts.following : unpack(snap.following).length,
    },
    schemaVersion: 1,
  };
}

function usedBytes() {
  let total = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || (k !== INDEX_KEY && k.indexOf(SNAP_PREFIX) !== 0)) continue;
      const v = localStorage.getItem(k) || '';
      total += (k.length + v.length) * 2;
    }
  } catch {
    /* ignore */
  }
  return total;
}

function quotaMessage(neededBytes) {
  const free = Math.max(0, APPROX_QUOTA_BYTES - usedBytes());
  return `This snapshot needs about ${mb(neededBytes)} but only about ${mb(free)} of browser storage looks free. Delete an older snapshot and try again.`;
}

function mb(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isoDay(ts) {
  const ms = (typeof ts === 'number' && ts > 0 ? ts : Math.floor(Date.now() / 1000)) * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

function rand4() {
  return Math.random().toString(36).slice(2, 6).padStart(4, '0');
}

function safeGet(k) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function safeRemove(k) {
  try {
    localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}
