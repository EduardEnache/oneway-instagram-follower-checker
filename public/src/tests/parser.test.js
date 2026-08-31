/**
 * ONE·WAY — parser / analysis / contacts / snapshots test suite.
 *
 * Runs in the browser via tests/index.html. Production CSP is
 * `connect-src 'none'`, so this file must NOT `fetch()` anything — the
 * synthetic export is imported as text from `../fixtures/synthetic-export.js`.
 */

import { describe, it, expect } from './harness.js';

import { fixMojibake, normalizeUsername, normalizeName } from '../lib/decode.js';
import { parseConnections, normalizeRows } from '../lib/parse.js';
import { analyze, sortAccounts, monthlySeries } from '../lib/analyze.js';
import { analyzeFileMap, analyzeExport, ParseError } from '../lib/pipeline.js';
import { dice, usernameTokens, matchContacts } from '../lib/contacts.js';
import {
  pack,
  unpack,
  saveSnapshot,
  diffSnapshot,
  deleteSnapshot,
  renameSnapshot,
  listSnapshots,
  QuotaError,
} from '../lib/snapshots.js';

import { files as SYN_FILES, expected as SYN } from '../fixtures/synthetic-export.js';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** A copy of the synthetic path->text map, optionally overriding/adding files. */
function synMap(overrides = {}) {
  return { ...SYN_FILES, ...overrides };
}
const synMapBytes = synMap; // alias: parse layer takes text or bytes alike

const RESULT = analyzeFileMap(synMap(), { sourceName: 'instagram-test_user-2024-01-01-abcd.zip' });

/** Full-ish AnalysisResult for snapshot tests. */
function mkAccount(username, timestamp) {
  return {
    username,
    displayUsername: username,
    name: null,
    profileUrl: `https://www.instagram.com/${username}`,
    externalUrl: null,
    timestamp: timestamp == null ? null : timestamp,
    fbid: null,
    sources: [],
  };
}

function mkResult({ followers = [], following = [], recentlyUnfollowed = [] }) {
  const followerSet = new Set(followers.map((a) => a.username));
  const nonFollowers = following.filter((a) => !followerSet.has(a.username));
  const empty = {
    nonFollowers,
    fans: [],
    mutuals: [],
    pendingRequests: [],
    recentRequests: [],
    recentlyUnfollowed,
    blocked: [],
    closeFriends: [],
    hideStoryFrom: [],
    removedSuggestions: [],
  };
  return {
    meta: { ownerUsername: 'test_user', exportedAt: 1700000000, warnings: [], schemaVersion: 1 },
    lists: { followers, following, ...empty },
    hashtags: [],
    contacts: [],
    stats: {},
    growth: { followers: [], following: [] },
  };
}

// ---------------------------------------------------------------------------
// decode.js
// ---------------------------------------------------------------------------

describe('fixMojibake', () => {
  it('repairs double-encoded "Danut" -> "Dănuț"', () => {
    // D, U+00C4, U+0083, n, u, U+00C8, U+009B  (Latin-1 view of the UTF-8 bytes)
    const mojibake = String.fromCharCode(68, 196, 131, 110, 117, 200, 155);
    expect(fixMojibake(mojibake)).toBe('Dănuț');
  });

  it('leaves a genuine Latin-1 "Muller" untouched', () => {
    const muller = String.fromCharCode(77, 252, 108, 108, 101, 114); // M u-umlaut l l e r
    expect(fixMojibake(muller)).toBe(muller);
  });

  it('returns plain ASCII by identity', () => {
    const s = 'plain ascii';
    expect(fixMojibake(s)).toBe(s);
  });

  it('repairs a double-encoded emoji sequence', () => {
    // SEBI + E2 9A A1 (U+26A1) + EF B8 8F (U+FE0F)
    const mojibake = String.fromCharCode(83, 69, 66, 73, 226, 154, 161, 239, 184, 143);
    expect(fixMojibake(mojibake)).toBe('SEBI⚡️');
  });
});

describe('normalizeUsername / normalizeName', () => {
  it('normalizeUsername strips @, trims, lowercases', () => {
    expect(normalizeUsername('  @@Foo.Bar ')).toBe('foo.bar');
  });
  it('normalizeName strips diacritics and punctuation', () => {
    // "Stefanel" with diacritics + "Pop-a!"
    const raw = String.fromCharCode(536, 116, 101, 102, 259, 110, 101, 108) + ' Pop-ă!';
    expect(normalizeName(raw)).toBe('stefanel popa');
  });
});

// ---------------------------------------------------------------------------
// parse.js quirks
// ---------------------------------------------------------------------------

describe('parse.js quirks', () => {
  it('normalizeRows: array passes through, bare object is wrapped, null -> []', () => {
    expect(normalizeRows([1, 2])).toEqual([1, 2]);
    expect(normalizeRows({ a: 1 })).toEqual([{ a: 1 }]);
    expect(normalizeRows(null)).toEqual([]);
  });

  it('hide_story_from.json (a single bare object) parses to exactly one account', () => {
    expect(RESULT.lists.hideStoryFrom).toHaveLength(1);
    expect(RESULT.lists.hideStoryFrom[0].username).toBe('danut_m');
    expect(RESULT.lists.hideStoryFrom[0].name).toBe(SYN.hideStoryFromName);
  });

  it('following.json username comes from `title`, not string_list_data[0].value', () => {
    // The fixture rows carry no `value` key at all — proof we read `title`.
    const following = JSON.parse(SYN_FILES['connections/followers_and_following/following.json']);
    expect(following.relationships_following[0].string_list_data[0].value).toBe(undefined);
    expect(RESULT.lists.following.map((a) => a.username)).toContain('notback_one');
    expect(RESULT.lists.following).toHaveLength(SYN.followingCount);
  });

  it('emits a `no-followers` warning when following rows resolve to nothing', () => {
    const broken = JSON.stringify({
      relationships_following: [
        { title: '', string_list_data: [{ href: 'x', timestamp: 1 }] },
        { title: '   ', string_list_data: [{ href: 'y', timestamp: 2 }] },
      ],
    });
    const parsed = parseConnections(
      synMapBytes({ 'connections/followers_and_following/following.json': broken }),
    );
    expect(parsed.warnings.some((w) => w.code === 'no-followers')).toBeTruthy();
  });

  it('throws ParseError(no-connections-folder) when the folder is absent', async () => {
    await expect(() => parseConnections({ 'some/other/file.json': '{}' })).toThrow('no-connections-folder');
  });

  it('rebuilds the hashtag URL from the tag (ignores the bogus href)', () => {
    expect(RESULT.hashtags).toHaveLength(SYN.hashtags);
    expect(RESULT.hashtags[0].url).toBe(SYN.hashtagUrl);
  });

  it('reads synced_contacts: full name, first-name-only, and nameless rows', () => {
    expect(RESULT.contacts).toHaveLength(SYN.contacts);
    const nameless = RESULT.contacts.filter((c) => c.fullName === '');
    expect(nameless).toHaveLength(1);
    expect(RESULT.contacts.some((c) => c.fullName === 'Dan Ionescu')).toBeTruthy();
    // mojibake decoded in a contact name
    expect(RESULT.contacts.some((c) => c.fullName === 'Ștefănel Popă')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// followers_*.json glob ordering
// ---------------------------------------------------------------------------

describe('followers glob', () => {
  it('concatenates followers_N.json in NUMERIC order (followers_10 after followers_2)', () => {
    const f1 = JSON.stringify([row('glob_a', 10)]);
    const f2 = JSON.stringify([row('glob_b', 20)]);
    const f10 = JSON.stringify([row('glob_c', 30)]);
    const parsed = parseConnections(
      synMapBytes({
        'connections/followers_and_following/followers_1.json': f1,
        'connections/followers_and_following/followers_2.json': f2,
        'connections/followers_and_following/followers_10.json': f10,
      }),
    );
    expect(parsed.lists.followers.map((a) => a.username)).toEqual(['glob_a', 'glob_b', 'glob_c']);
  });

  function row(value, timestamp) {
    return { title: '', media_list_data: [], string_list_data: [{ href: 'h', value, timestamp }] };
  }
});

// ---------------------------------------------------------------------------
// analyze.js
// ---------------------------------------------------------------------------

describe('analyze.js — synthetic-export expected table', () => {
  it('follower / following / mutual / non-follower / fan counts', () => {
    expect(RESULT.stats.followerCount).toBe(SYN.followerCount);
    expect(RESULT.stats.followingCount).toBe(SYN.followingCount);
    expect(RESULT.stats.mutualCount).toBe(SYN.mutualCount);
    expect(RESULT.stats.nonFollowerCount).toBe(SYN.nonFollowerCount);
    expect(RESULT.stats.fanCount).toBe(SYN.fanCount);
  });

  it('nonFollowers and fans membership', () => {
    expect(RESULT.lists.nonFollowers.map((a) => a.username).sort()).toEqual([...SYN.nonFollowers].sort());
    expect(RESULT.lists.fans.map((a) => a.username).sort()).toEqual([...SYN.fans].sort());
  });

  it('listCounts for the label-style lists', () => {
    for (const [k, v] of Object.entries(SYN.listCounts)) {
      expect(RESULT.stats.listCounts[k]).toBe(v);
    }
  });

  it('all 12 list keys are present as arrays', () => {
    const KEYS = [
      'followers', 'following', 'nonFollowers', 'fans', 'mutuals', 'pendingRequests',
      'recentRequests', 'recentlyUnfollowed', 'blocked', 'closeFriends', 'hideStoryFrom', 'removedSuggestions',
    ];
    for (const k of KEYS) expect(Array.isArray(RESULT.lists[k])).toBeTruthy();
  });

  it('one pending request has name === null', () => {
    expect(RESULT.lists.pendingRequests.some((a) => a.name === null)).toBeTruthy();
  });

  it('invariants: mutual + nonFollower === following; mutual + fan === follower', () => {
    const s = RESULT.stats;
    expect(s.mutualCount + s.nonFollowerCount).toBe(s.followingCount);
    expect(s.mutualCount + s.fanCount).toBe(s.followerCount);
  });

  it('result is JSON round-trip stable', () => {
    expect(JSON.stringify(JSON.parse(JSON.stringify(RESULT)))).toBe(JSON.stringify(RESULT));
  });

  it('growth series is cumulative and ends at the list count', () => {
    expect(RESULT.growth.followers.at(-1).total).toBe(SYN.followerCount);
    expect(RESULT.growth.following.at(-1).total).toBe(SYN.followingCount);
  });
});

describe('analyze.js — helpers', () => {
  it('sortAccounts: timestamp DESC, nulls last, username ASC tiebreak', () => {
    const input = [
      mkAccount('b', 100),
      mkAccount('a', 100),
      mkAccount('z', null),
      mkAccount('c', 200),
    ];
    expect(sortAccounts(input).map((a) => a.username)).toEqual(['c', 'a', 'b', 'z']);
  });

  it('monthlySeries: UTC-month buckets with running total, ascending', () => {
    const jan = Date.UTC(2021, 0, 10) / 1000;
    const feb = Date.UTC(2021, 1, 3) / 1000;
    const series = monthlySeries([mkAccount('x', jan), mkAccount('y', feb), mkAccount('z', feb)]);
    expect(series).toHaveLength(2);
    expect(series[0].t).toBe(Date.UTC(2021, 0, 1) / 1000);
    expect(series[0].count).toBe(1);
    expect(series[1].count).toBe(2);
    expect(series[1].total).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// pipeline.js
// ---------------------------------------------------------------------------

describe('pipeline.js', () => {
  it('analyzeExport accepts a path->text map (CSP-safe) and fills meta', async () => {
    const r = await analyzeExport(synMap(), { sourceName: 'instagram-test_user-2024-01-01-abcd.zip' });
    expect(r.stats.followerCount).toBe(SYN.followerCount);
    expect(r.meta.ownerUsername).toBe('test_user');
    expect(r.meta.schemaVersion).toBe(1);
    expect(Array.isArray(r.meta.warnings)).toBeTruthy();
  });

  it('rejects junk input with ParseError(not-a-zip)', async () => {
    await expect(() => analyzeExport(12345)).toThrow('not-a-zip');
  });

  it('honors an already-aborted signal', async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(() => analyzeExport(synMap(), { signal: ac.signal })).toThrow('aborted');
  });
});

// ---------------------------------------------------------------------------
// contacts.js
// ---------------------------------------------------------------------------

describe('contacts.js', () => {
  it('dice("ionut stanoiu", "ionutstanoiu") > 0.85', () => {
    expect(dice('ionut stanoiu', 'ionutstanoiu')).toBeGreaterThan(0.85);
  });

  it('dice is 1 for identical strings and 0 for no overlap', () => {
    expect(dice('abc', 'abc')).toBe(1);
    expect(dice('abc', 'xyz')).toBe(0);
  });

  it('usernameTokens splits on separators and digit boundaries', () => {
    expect(usernameTokens('octavian.8.8')).toEqual(['octavian', '8', '8']);
    expect(usernameTokens('dan_ionescu2')).toEqual(['dan', 'ionescu', '2']);
  });

  it('matchContacts: matches by username token, never emits a phone', async () => {
    const matches = await matchContacts(RESULT);
    expect(matches.some((m) => m.account.username === 'dan_ionescu')).toBeTruthy();
    expect(matches.every((m) => m.contact.phone === null)).toBeTruthy();
    // nameless contact ("") must be skipped, never crash
    expect(matches.every((m) => m.contact.fullName !== '')).toBeTruthy();
    // sorted by score desc
    for (let i = 1; i < matches.length; i++) {
      expect(matches[i - 1].score >= matches[i].score).toBeTruthy();
    }
  });

  it('matchContacts honors an aborted signal', async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(() => matchContacts(RESULT, { signal: ac.signal })).toThrow('aborted');
  });
});

// ---------------------------------------------------------------------------
// snapshots.js
// ---------------------------------------------------------------------------

describe('snapshots.js', () => {
  it('pack -> unpack round-trips username + timestamp (and null timestamps)', () => {
    const accounts = [mkAccount('alpha', 111), mkAccount('beta', null), mkAccount('gamma', 333)];
    const round = unpack(pack(accounts));
    expect(round).toEqual([
      { username: 'alpha', timestamp: 111 },
      { username: 'beta', timestamp: null },
      { username: 'gamma', timestamp: 333 },
    ]);
  });

  it('saveSnapshot -> diffSnapshot detects lost / gained / non-follower changes', () => {
    const base = mkResult({
      followers: [mkAccount('keep', 10), mkAccount('leaver', 20)],
      following: [mkAccount('keep', 10), mkAccount('pending_back', 30)],
    });
    const meta = saveSnapshot(base, 'unit-base');
    try {
      const current = mkResult({
        followers: [mkAccount('keep', 10), mkAccount('newcomer', 40)],
        following: [mkAccount('keep', 10), mkAccount('pending_back', 30)],
      });
      const diff = diffSnapshot(meta.id, current);
      expect(diff.lostFollowers.map((a) => a.username)).toEqual(['leaver']);
      expect(diff.gainedFollowers.map((a) => a.username)).toEqual(['newcomer']);
      expect(diff.lostFollowers[0].name).toBe(null); // synthesized
      expect(diff.lostFollowers[0].sources).toEqual([]);
      expect(diff.caveats.length).toBeGreaterThan(2);
    } finally {
      deleteSnapshot(meta.id);
    }
  });

  it('rename heuristic: identical follow timestamp -> RenameGuess, removed from lost/gained', () => {
    const base = mkResult({ followers: [mkAccount('old_handle', 12345), mkAccount('stable', 999)] });
    const meta = saveSnapshot(base, 'unit-rename');
    try {
      const current = mkResult({ followers: [mkAccount('new_handle', 12345), mkAccount('stable', 999)] });
      const diff = diffSnapshot(meta.id, current);
      expect(diff.likelyRenames).toHaveLength(1);
      expect(diff.likelyRenames[0].from).toBe('old_handle');
      expect(diff.likelyRenames[0].to).toBe('new_handle');
      expect(diff.likelyRenames[0].timestamp).toBe(12345);
      expect(diff.lostFollowers).toHaveLength(0);
      expect(diff.gainedFollowers).toHaveLength(0);
    } finally {
      deleteSnapshot(meta.id);
    }
  });

  it('a confirmed unfollow (in recentlyUnfollowed) is NOT collapsed into a rename', () => {
    const base = mkResult({ followers: [mkAccount('gone_for_good', 555)] });
    const meta = saveSnapshot(base, 'unit-confirmed');
    try {
      const current = mkResult({
        followers: [mkAccount('brand_new', 555)],
        recentlyUnfollowed: [mkAccount('gone_for_good', 555)],
      });
      const diff = diffSnapshot(meta.id, current);
      expect(diff.likelyRenames).toHaveLength(0);
      expect(diff.lostFollowers.map((a) => a.username)).toEqual(['gone_for_good']);
    } finally {
      deleteSnapshot(meta.id);
    }
  });

  it('renameSnapshot updates the stored label', () => {
    const meta = saveSnapshot(mkResult({ followers: [mkAccount('x', 1)] }), 'before');
    try {
      renameSnapshot(meta.id, 'after');
      expect(listSnapshots().find((m) => m.id === meta.id).label).toBe('after');
    } finally {
      deleteSnapshot(meta.id);
    }
  });

  it('saveSnapshot throws QuotaError (not a raw DOMException) when storage is full', () => {
    const realSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key) {
      if (String(key).indexOf('oneway.snapshot.') === 0) {
        const e = new Error('mock quota exceeded');
        e.name = 'QuotaExceededError';
        throw e;
      }
      return realSetItem.apply(this, arguments);
    };
    let threw = null;
    try {
      saveSnapshot(mkResult({ followers: [mkAccount('x', 1)] }), 'quota-test');
    } catch (e) {
      threw = e;
    } finally {
      Storage.prototype.setItem = realSetItem;
    }
    expect(threw instanceof QuotaError).toBeTruthy();
    expect(threw.name).toBe('QuotaError');
    expect(threw.neededBytes > 0).toBeTruthy();
  });
});
