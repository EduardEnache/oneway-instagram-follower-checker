# ONE·WAY — Instagram export data format

Everything the parser layer (`public/src/lib/*`) knows about Instagram's
"Download your information" export. Written from direct inspection of a real
JSON export (`instagram-<user>-2026-08-31-*.zip`, 11 files, all STORE-compressed)
and the anonymised `public/src/fixtures/synthetic-export/`.

> Scope: only the **Connections** category is used — "Followers and following"
> plus "Contacts". Request the export in **JSON** format, not HTML.

---

## 1. Archive layout

```
connections/
  followers_and_following/
    followers_1.json            (+ followers_2.json, … for large accounts)
    following.json
    following_hashtags.json
    close_friends.json
    blocked_profiles.json
    hide_story_from.json
    pending_follow_requests.json
    recent_follow_requests.json
    recently_unfollowed_profiles.json
    removed_suggestions.json
  contacts/
    synced_contacts.json
```

Some exports nest the whole tree under `instagram-<user>-<date>/`. **All path
matching is by suffix** (`path.endsWith('connections/followers_and_following/…')`),
never exact equality. If nothing in the archive contains
`connections/followers_and_following/`, parsing throws
`ParseError('no-connections-folder')` — the only fatal parse condition besides an
unreadable ZIP.

### Owner username

Not stored in any file. It is parsed from the archive/folder name with
`/instagram-(.+?)-\d{4}-\d{2}-\d{2}-/` → e.g. `eduard_enache100`. Falls back to
`null` (or a nested top-level folder segment) if the name doesn't match.

### Timestamps

**Unix seconds** everywhere (never milliseconds). `0` / absent → `null`.
`meta.exportedAt` is the maximum timestamp seen anywhere in the export (a proxy
for the export date — in the sample it lands on a `recent_follow_requests` row,
2026-08-31, a day after the newest follower).

---

## 2. Per-file shapes

### `followers_1.json` … `followers_N.json` — **bare array**

```json
[
  { "title": "",
    "media_list_data": [],
    "string_list_data": [
      { "href": "https://www.instagram.com/toni.dumitrascu",
        "value": "toni.dumitrascu",
        "timestamp": 1787953485 } ] }
]
```

- Username is `string_list_data[0].value`. `title` is always `""` (no display name).
- **Glob**: read every entry matching `/followers_(\d+)\.json$/`, sort by the
  captured integer (so `followers_10` follows `followers_2`, not `followers_1`
  then `followers_10` then `followers_2`), concatenate in that order.
- Sample: 595 rows in one file.

### `following.json` — object, username in **`title`**

```json
{ "relationships_following": [
    { "title": "toni.dumitrascu",
      "string_list_data": [
        { "href": "https://www.instagram.com/_u/toni.dumitrascu",
          "timestamp": 1787952378 } ] } ] }
```

- **The catastrophic-bug file.** `string_list_data[0]` has **no `value` key** —
  only `href` and `timestamp`. The username is in **`title`**. A parser that
  reads `.value` here silently produces "0 non-followers".
- Tripwire: if `relationships_following` has rows but none resolve to a username,
  the parser pushes a `no-followers` `ParseWarning` (code from the typedef enum)
  and continues.
- `href` is the `/_u/<name>` redirect form, not a real profile URL — ignored;
  `profileUrl` is always rebuilt as `https://www.instagram.com/<displayUsername>`.
- Sample: 363 rows.

### The seven "label_values" files

`close_friends.json`, `blocked_profiles.json`, `hide_story_from.json`,
`pending_follow_requests.json`, `recent_follow_requests.json`,
`recently_unfollowed_profiles.json`, `removed_suggestions.json`.

```json
{ "timestamp": 1785691882,
  "media": [],
  "label_values": [
    { "label": "URL",      "value": "" },
    { "label": "Name",     "value": "SEBIâ¡ï¸" },
    { "label": "Username", "value": "ionutstanoiu" } ],
  "fbid": "17841400645829634" }
```

- Usually a **bare array** of these objects…
- …except **`hide_story_from.json`, which in the real export is a single bare
  object, not an array.** Every one of the seven is run through
  `Array.isArray(x) ? x : (x == null ? [] : [x])`.
- `Username` label is always present. `Name` may be `""` → `name: null`.
  `URL` is usually `""` → `externalUrl: null`; on `recently_unfollowed` it is
  often a real site (`https://wel.ro/`).
- `fbid` is present on these rows only (not on followers/following) and is kept
  verbatim.
- `removed_suggestions.json` rows sometimes omit `fbid` entirely.
- Sample counts: close friends 84, blocked 7, pending 38, recent 28, recently
  unfollowed 11, removed suggestions 24, hide-story-from 1.

### `following_hashtags.json`

```json
{ "relationships_following_hashtags": [
    { "title": "",
      "media_list_data": [],
      "string_list_data": [
        { "href": "https://www.instagram.com/barbarianbody",
          "value": "barbarianbody",
          "timestamp": 1559662397 } ] } ] }
```

- `href` is a **bogus profile URL** (`instagram.com/<tag>`), never used.
- The tag is `string_list_data[0].value`; `url` is rebuilt as
  `https://www.instagram.com/explore/tags/<tag>` where `<tag>` is the decoded,
  `#`-stripped, lowercased value (URI-encoded).
- Sample: 1 hashtag.

### `synced_contacts.json`

```json
{ "contacts_contact_info": [
    { "string_map_data": {
        "First Name": { "value": "Andrei TÄnase" },
        "Last Name":  { "value": "…" },
        "Contact Information": { "value": "749669320" },
        "Imported Time": { "timestamp": 1600000000 } } } ] }
```

- Keys are inside `string_map_data`. Name/phone use `{value}`; **`Imported Time`
  uses `{timestamp}`**, not `{value}`.
- `Last Name` is absent in ~58% of rows. ~2 rows have **no name at all** (only
  `Contact Information`) → `fullName: ''`; the contact matcher skips those.
- `fullName = [firstName, lastName].filter(Boolean).join(' ').trim()`.
- `phone` = `Contact Information` value, stored on the `Contact` object but
  **never** written to a snapshot, a `ContactMatch`, an export, or a URL.
- Sample: 1299 contacts.

---

## 3. Mojibake (double-encoded UTF-8)

Every human string in the export is double-encoded: the UTF-8 **bytes** of the
real string were themselves re-encoded as UTF-8 through a Latin-1 round-trip. So
`ă` (bytes `C4 83`) arrives as the two characters `U+00C4 U+0083`, `⚡️` as six
`U+00xx` characters, etc.

`decode.js#fixMojibake` reverses it:

1. ASCII / empty fast-path (`/[-ÿ]/` test) → return as-is.
2. If any code unit is `> 0xFF` the string already holds real Unicode → return as-is.
3. Copy char codes into a `Uint8Array`, `new TextDecoder('utf-8', { fatal: true }).decode(bytes)`.
4. The `fatal` throw **is the false-positive guard**: a genuine Latin-1 `Müller`
   yields invalid UTF-8 when its bytes are re-read, the decoder throws, and the
   original string is returned untouched.

Verified against the real export: `SEBI⚡️`, `Vladut Mîrzoi`, `Diniță Ana-Maria`,
`Răzvan Bălănescu`, `ᴅɪᴀɴᴀ 🦋`, `Oğulcan Bolu`, `Ewe 💜`, `Andrei Tănase`,
`Teodora Fogoroș`, `Rachi Pițipoanca`, `Aguț` all decode correctly; no residual
mojibake. Romanian `ș/ț/î/ă/â` round-trip — the UI font must carry **latin-ext**.

`normalizeName` (matching only, never display) goes further: fixMojibake → NFD →
strip combining marks / `\p{Diacritic}` → lowercase → collapse whitespace → drop
everything that is not a letter, number, or space.

---

## 4. Derived views (`analyze.js`, pure & synchronous)

Set math over `Set<string>` of canonical usernames (`normalizeUsername`:
trim → lowercase → strip leading `@`):

| view | definition | sample |
|---|---|---:|
| `mutuals` | `followers ∩ following` | 301 |
| `nonFollowers` | `following \ followers` | 62 |
| `fans` | `followers \ following` | 294 |

Invariants (asserted in tests): `mutuals + nonFollowers === following`,
`mutuals + fans === followers`.

- Each incoming list is de-duped by `username` (first occurrence wins;
  `duplicate-username` warning if any collapse).
- Every `Account[]` — in `lists.*` and `SnapshotDiff.*` — is sorted
  **timestamp DESC, nulls last, username ASC** (contract rule 4).
- `growth.followers` / `growth.following`: `SeriesPoint[]` bucketed by **UTC
  month** (`Date.UTC(y, m, 1) / 1000`), each point `{ t, count, total }` with a
  running cumulative `total`, ascending by `t`. `growth.followers.at(-1).total`
  equals `followerCount` when every follower row has a timestamp (true for the
  sample: 595).
- `stats`: counts, `ratio` / `mutualRate` (both guard divide-by-zero → `0`),
  oldest/newest follower & following (by timestamp, ignoring nulls),
  `listCounts` for all 12 lists.
- The result is fully JSON-safe — no `Map` / `Set` / `Date` / class instances
  survive into the returned tree.

### Known limitation — names on followers/following

`followers_*.json` and `following.json` carry **no display name** (`title` is
empty or is the username). So for the real export, `Account.name` is `null` for
everyone in `followers` / `following` / `mutuals` / `fans` / `nonFollowers`, and
contact matching effectively runs on **username tokens only** (the name-based
scoring rules stay in place for exports that do include names, and for the
label-style lists, which are not currently name-indexed).

---

## 5. Contact matching (`contacts.js`, async + cooperative)

- Inverted token → `Set<accountEntry>` index over `followers ∪ following`, each
  entry tagged `mutuals` / `followers` / `following`. Tokens: `normalizeName`
  words + username split on `. _ -` and digit/letter boundaries
  (`octavian.8.8` → `octavian 8 8`).
- Per contact with non-empty `fullName`, score = **max** of:
  `1.00` exact `normalizeName` full-name equality · `0.90` every contact token
  present in the account's name tokens · `0.88` reversed first/last exact ·
  `0.55–0.85` Sørensen–Dice bigram similarity on the space-stripped normalized
  strings, linearly scaled · `0.70` all contact tokens are substrings of the
  separator-stripped username.
- Keep `≥ minScore` (default `0.55`), cap `maxPerContact` (default `3`), sort by
  score DESC. `confidence`: `≥0.85` high, `≥0.70` medium, else low.
  `reasons[]`: `exact-name` · `all-name-tokens` · `reversed-name` ·
  `dice-similarity` · `username-token-match`.
- Chunked at 200 contacts with `await new Promise(r => setTimeout(r))` between
  chunks; calls `opts.onProgress(pct)`; `opts.signal` abort → throws
  `ParseError` with **`.code === 'aborted'`**.
- `phone` is stripped (`null`) from every `ContactMatch.contact`.

---

## 6. Snapshots (`snapshots.js`, `localStorage`)

- Keys: `oneway.snapshots.index` (`SnapshotMeta[]`), `oneway.snapshot.<id>`
  (`SnapshotMeta` + **packed** `followers`/`following`). Packed line format:
  `username\ttimestamp`, newline-separated, timestamp segment empty when null
  (~20 bytes/account to fit the ~5 MB quota).
- `id = snap_<createdAt>_<rand4>`; default `label` = ISO date of `exportedAt`
  (else `createdAt`).
- `saveSnapshot` on `setItem` throwing → `QuotaError { usedBytes, neededBytes }`
  (`usedBytes` = Σ stored `oneway.*` key+value lengths × 2; `neededBytes` =
  payload length × 2). The snapshot write is rolled back if the index write then
  fails. Never swallowed.
- `diffSnapshot`: `lostFollowers` / `gainedFollowers` / `startedFollowing` /
  `stoppedFollowing` / `newNonFollowers` / `resolvedNonFollowers`. Accounts on
  the "lost"/"stopped"/"resolved" sides are **synthesized** from packed text —
  `name: null`, `fbid: null`, `externalUrl: null`, `sources: []`.
- **Rename heuristic**: a `(lost, gained)` follower pair sharing an identical
  non-null follow timestamp becomes a `RenameGuess { from, to, timestamp }` and
  both are removed from `lostFollowers` / `gainedFollowers`. A lost follower whose
  username also appears in `result.lists.recentlyUnfollowed` is treated as a
  **confirmed unfollow** — excluded from rename pairing, kept in `lostFollowers`.
- `caveats` always carries the standing disclaimers (rename guesses are
  heuristic; a deactivated/deleted account is indistinguishable from an unfollow;
  Instagram's export has its own lag).
- `estimateStorage()` is **synchronous** per the frozen contract, so it returns
  a measured `usedBytes`, a `quotaBytes` approximation of `5 * 1024 * 1024`
  (rather than `await navigator.storage.estimate()`), and `snapshotCount`.

---

## 7. ZIP reader (`zip.js`) — decision: **hand-rolled, kept**

The reader parses the **Central Directory** (not the local headers — this
sidesteps streaming data-descriptor ambiguity), locating the EOCD by scanning
back ≤ 65 557 bytes for `0x06054b50`, with ZIP64 support (EOCD locator
`0x07064b50` + ZIP64 EOCD `0x06064b50`, and the `0x0001` extra field for
oversized sizes/offsets). Compression: method **0 (store)** → `subarray`;
method **8 (deflate)** → `DecompressionStream('deflate-raw')` via
`new Response(blob.stream().pipeThrough(…)).arrayBuffer()`. Any other method, or
a missing `DecompressionStream` when a deflate entry is hit, throws a tagged
error the pipeline maps to `ParseError('unsupported-zip')` naming the method
number. Filenames are decoded as UTF-8 unconditionally.

**Why hand-rolled and not fflate:** the reader handled the real export (11
entries, all STORE) byte-for-byte on the first pass, produces results identical
to a directory load of the same tree, and needs no vendored code or extra CSP
surface. The `fflate` fallback (`public/vendor/fflate/`) was **not** taken. The
deflate path exists as defensive breadth for exports from other Instagram
surfaces; `DecompressionStream` needs Chrome 103+ / Firefox 113+ / Safari 16.4+.

`analyzeExport` also accepts a `FileList` / `File[]` from
`<input type="file" webkitdirectory>` (path from `file.webkitRelativePath`), and
a pre-extracted `path → text | bytes` map / plain object — the latter is what the
CSP-safe test suite feeds it, since production ships `connect-src 'none'` and
`fetch()` of same-origin files is blocked.

---

## 8. Progress & errors

`analyzeExport` emits `opts.onProgress({ phase, pct, message })` across
`unzip` (0–40) → `parse` (40–80) → `analyze` (80–100), and honors `opts.signal`.

`ParseError.code` ∈ `not-a-zip` · `unsupported-zip` · `no-connections-folder` ·
`aborted`. Everything else — a single corrupt JSON file, any missing optional
file — becomes a `ParseWarning` (`missing-file` / `unexpected-shape` /
`decode-failed` / `empty-list` / `duplicate-username` / `no-followers`) and
parsing continues. On the sample export, `meta.warnings` is empty and all 11
files are found.
