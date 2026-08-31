/**
 * ONE·WAY — shared data-model contract.
 *
 * This file is FROZEN. It contains only JSDoc typedefs — no runtime code — so
 * importing it costs nothing and both the parser layer and the UI
 * layer can type-annotate against a single source of truth.
 *
 * Import for annotations like:
 *   \@type {import('../contracts/types.js').AnalysisResult}
 *
 * Hard rules (see docs/CONTRACT.md for the full list):
 *  1. `AnalysisResult.lists` ALWAYS has all 12 ListId keys. Empty means `[]`,
 *     never `undefined`, never `null`. The UI must never guard for a missing key.
 *  2. `AnalysisResult` is `structuredClone`- and `JSON.stringify`-safe: no Map,
 *     no Set, no Date, no class instances, no functions.
 *  3. Accounts synthesized from packed snapshot data carry `name: null`,
 *     `fbid: null`, `sources: []`. The UI degrades to showing the username.
 *  4. Every `Account[]` the parser returns is pre-sorted by `timestamp`
 *     descending (nulls last), then `username` ascending as a tiebreak.
 *  5. `analyze()` is pure and synchronous. `analyzeExport()` and
 *     `matchContacts()` are async (file I/O + cooperative chunking).
 */

export {}; // make this a module; no runtime exports

/**
 * Canonical identifiers for every relationship list the app renders.
 * `followers` / `following` are the raw edges; the other ten are derived or
 * lifted straight from their export files.
 *
 * @typedef {(
 *   | 'followers'
 *   | 'following'
 *   | 'nonFollowers'
 *   | 'fans'
 *   | 'mutuals'
 *   | 'pendingRequests'
 *   | 'recentRequests'
 *   | 'recentlyUnfollowed'
 *   | 'blocked'
 *   | 'closeFriends'
 *   | 'hideStoryFrom'
 *   | 'removedSuggestions'
 * )} ListId
 */

/**
 * The complete, ordered set of ListId values. Runtime mirror of the typedef so
 * code can iterate without hard-coding the list in twelve places.
 * @type {ReadonlyArray<ListId>}
 */
export const LIST_IDS = /** @type {const} */ ([
  'followers',
  'following',
  'nonFollowers',
  'fans',
  'mutuals',
  'pendingRequests',
  'recentRequests',
  'recentlyUnfollowed',
  'blocked',
  'closeFriends',
  'hideStoryFrom',
  'removedSuggestions',
]);

/**
 * A single normalized Instagram account — the atom of the whole app.
 *
 * `username` is the canonical join key everywhere: lowercased, trimmed, leading
 * '@' stripped. Never compare on anything else. `displayUsername` preserves the
 * original casing for display and for building `profileUrl`.
 *
 * @typedef {Object} Account
 * @property {string}       username        Canonical key. Lowercase, trimmed, no leading '@'. Non-empty.
 * @property {string}       displayUsername Username exactly as it appeared in the export.
 * @property {string|null}  name            Human display name, mojibake-decoded. `null` if absent or empty.
 * @property {string}       profileUrl      Always `https://www.instagram.com/${displayUsername}`. Never the raw href.
 * @property {string|null}  externalUrl     The "URL" label value if non-empty, else `null`.
 * @property {number|null}  timestamp       Follow/event time, Unix SECONDS. `null` if 0 or absent.
 * @property {string|null}  fbid            Facebook id; only present on label-values-style files.
 * @property {ListId[]}     sources         Every list this exact account object appeared in, deduped.
 */

/**
 * A followed hashtag. Instagram's export puts a bogus profile URL in `href`, so
 * `url` is always rebuilt from the tag by the parser.
 *
 * @typedef {Object} Hashtag
 * @property {string}      tag         Decoded, lowercased, no leading '#'.
 * @property {string}      displayTag  As it appeared in the export.
 * @property {string}      url         `https://www.instagram.com/explore/tags/${tag}`.
 * @property {number|null} timestamp   Unix seconds, or `null`.
 */

/**
 * An address-book contact from `synced_contacts.json`.
 *
 * `phone` NEVER leaves the browser: it is never written to a CSV/JSON export by
 * default, never stored in a snapshot, never placed in a URL.
 *
 * @typedef {Object} Contact
 * @property {string}      id          Stable synthetic id, `c${index}`.
 * @property {string|null} firstName   Decoded, or `null`.
 * @property {string|null} lastName    Decoded, or `null` (~58% of rows have none).
 * @property {string}      fullName    `` `${firstName} ${lastName}`.trim() ``; may be '' (matcher skips those).
 * @property {string|null} phone       "Contact Information" value. Browser-only. `null` if absent.
 * @property {number|null} importedAt  From "Imported Time".timestamp, Unix seconds, or `null`.
 */

/**
 * A best-effort fuzzy match between a `Contact` and an `Account`.
 *
 * These are GUESSES based on name similarity alone and are frequently wrong.
 * The UI must show `confidence` and `reasons` and carry a standing disclaimer.
 *
 * @typedef {Object} ContactMatch
 * @property {string}   contactId
 * @property {Contact}  contact
 * @property {Account}  account
 * @property {ListId}   accountList  Where the account was found: 'followers' | 'following' | 'mutuals'.
 * @property {number}   score        0..1 inclusive.
 * @property {('high'|'medium'|'low')} confidence  `>=0.85` high, `>=0.70` medium, else low.
 * @property {string[]} reasons      Human-readable, e.g. ['exact-name', 'username-token-match'].
 */

/**
 * One point in a monthly growth series.
 *
 * @typedef {Object} SeriesPoint
 * @property {number} t      Unix seconds at the UTC month boundary (bucket start).
 * @property {number} count  New edges added in this bucket.
 * @property {number} total  Cumulative edge total at the end of this bucket.
 */

/**
 * Headline numbers for the dashboard.
 *
 * @typedef {Object} AnalysisStats
 * @property {number}       followerCount
 * @property {number}       followingCount
 * @property {number}       nonFollowerCount
 * @property {number}       fanCount
 * @property {number}       mutualCount
 * @property {number}       ratio           `followerCount / followingCount`; `0` if divisor is 0.
 * @property {number}       mutualRate      `mutualCount / followingCount`, 0..1; `0` if divisor is 0.
 * @property {Account|null} oldestFollower
 * @property {Account|null} newestFollower
 * @property {Account|null} oldestFollowing
 * @property {Account|null} newestFollowing
 * @property {Record<ListId, number>} listCounts  Count per list; all 12 keys present.
 */

/**
 * A single non-fatal issue encountered while parsing.
 *
 * @typedef {Object} ParseWarning
 * @property {(
 *   | 'missing-file'
 *   | 'unexpected-shape'
 *   | 'decode-failed'
 *   | 'empty-list'
 *   | 'duplicate-username'
 *   | 'no-followers'
 * )} code
 * @property {string} file     Export-relative path the warning concerns.
 * @property {string} message  Human-readable, safe to show verbatim in the UI.
 */

/**
 * Provenance and health metadata for one parsed export.
 *
 * @typedef {Object} AnalysisMeta
 * @property {string|null} ownerUsername Parsed from the zip filename, else `null`.
 * @property {string}      sourceName    Original file or folder name.
 * @property {number}      parsedAt      Unix seconds (`Date.now() / 1000 | 0`).
 * @property {number|null} exportedAt    Newest timestamp seen anywhere; a proxy for the export date.
 * @property {string[]}    filesFound    Export-relative paths successfully read.
 * @property {string[]}    filesMissing  Expected-but-absent paths. Never fatal.
 * @property {ParseWarning[]} warnings
 * @property {1}           schemaVersion Always `1`.
 */

/**
 * The single object the parser layer hands the UI layer. Fully JSON-serializable.
 *
 * @typedef {Object} AnalysisResult
 * @property {AnalysisMeta}              meta
 * @property {Record<ListId, Account[]>} lists     All 12 keys ALWAYS present; `[]` when empty.
 * @property {Hashtag[]}                 hashtags
 * @property {Contact[]}                 contacts
 * @property {AnalysisStats}             stats
 * @property {{ followers: SeriesPoint[], following: SeriesPoint[] }} growth
 */

/**
 * Lightweight descriptor for a stored snapshot (no follower payload).
 *
 * @typedef {Object} SnapshotMeta
 * @property {string}      id             `snap_${createdAt}_${rand4}`.
 * @property {string}      label          User-editable. Defaults to the ISO date of `exportedAt`.
 * @property {number}      createdAt      Unix seconds.
 * @property {number|null} exportedAt     From the source export's `meta.exportedAt`.
 * @property {string|null} ownerUsername
 * @property {{ followers: number, following: number }} counts
 * @property {1}           schemaVersion  Always `1`.
 */

/**
 * A full stored snapshot. Persisted at `localStorage['oneway.snapshot.' + id]`.
 *
 * `followers` / `following` are PACKED strings, not arrays, to survive the
 * ~5 MB localStorage quota: newline-separated records of `username\ttimestamp`
 * (the timestamp segment may be empty when unknown).
 *
 * @typedef {SnapshotMeta & { followers: string, following: string }} Snapshot
 */

/**
 * A guessed rename: a username that vanished between snapshot and current export
 * paired with one that appeared, linked by an identical follow timestamp.
 *
 * @typedef {Object} RenameGuess
 * @property {string} from      Username present in the base snapshot, absent now.
 * @property {string} to        Username absent from the base snapshot, present now.
 * @property {number} timestamp The shared follow timestamp that links them (Unix seconds).
 */

/**
 * The result of diffing a stored snapshot against the current export.
 *
 * Accounts in `lostFollowers` / `stoppedFollowing` are SYNTHESIZED from packed
 * snapshot data: `name: null`, `fbid: null`, `sources: []`. This is documented,
 * not a bug — the UI degrades to the username.
 *
 * @typedef {Object} SnapshotDiff
 * @property {SnapshotMeta} base
 * @property {{ exportedAt: number|null, counts: { followers: number, following: number } }} current
 * @property {Account[]}    lostFollowers        In base.followers, not in current.followers.
 * @property {Account[]}    gainedFollowers      In current.followers, not in base.followers.
 * @property {Account[]}    startedFollowing     In current.following, not in base.following.
 * @property {Account[]}    stoppedFollowing     In base.following, not in current.following.
 * @property {Account[]}    newNonFollowers      A non-follower now, was not a non-follower in base.
 * @property {Account[]}    resolvedNonFollowers Was a non-follower in base, no longer is.
 * @property {RenameGuess[]} likelyRenames       Pairs excluded from lost/gained above.
 * @property {string[]}     caveats              Pre-written disclaimer strings, rendered verbatim.
 */

/**
 * Progress callback payload for `analyzeExport`.
 *
 * @typedef {Object} ProgressEvent
 * @property {string} phase    Machine-ish phase id, e.g. 'unzip' | 'parse' | 'analyze'.
 * @property {number} pct      0..100.
 * @property {string} message  Human-readable status line.
 */

/**
 * Error thrown by `analyzeExport`. Implemented as a real Error subclass in
 * `lib/pipeline.js`; documented here for the UI's `catch` handling.
 *
 * @typedef {Object} ParseErrorShape
 * @property {'ParseError'} name
 * @property {string}       message
 * @property {(
 *   | 'not-a-zip'
 *   | 'unsupported-zip'
 *   | 'no-connections-folder'
 *   | 'aborted'
 * )} code
 */

/**
 * Error thrown by `saveSnapshot` when localStorage cannot hold the payload.
 * Real Error subclass in `lib/snapshots.js`.
 *
 * @typedef {Object} QuotaErrorShape
 * @property {'QuotaError'} name
 * @property {string}       message
 * @property {number}       usedBytes
 * @property {number}       neededBytes
 */
