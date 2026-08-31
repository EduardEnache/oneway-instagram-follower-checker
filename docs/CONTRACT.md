# ONE·WAY — interface contract (FROZEN)

This is the seam between the **parser layer** (parser layer, `public/src/lib/*`) and the
**UI layer** (UI layer, `public/src/{state,ui,export}/*`). Neither side may change
this document. The machine-readable form is `public/src/contracts/types.js` — read
it alongside this.

If you believe the contract is wrong, stop and flag it to the integrator. Do not
work around it.

---

## 1. The one object: `AnalysisResult`

`analyzeExport()` resolves to exactly one `AnalysisResult`. Everything the UI
renders derives from it. Shape: see `types.js`. Non-negotiable properties:

| Rule | Detail |
|---|---|
| **All 12 list keys always present** | `result.lists.blocked` etc. is `[]` when empty — never `undefined`, never `null`. The UI must never write `result.lists?.x` or `(result.lists.x || [])`. |
| **JSON-safe** | No `Map`, `Set`, `Date`, class instance, function, `undefined`, or circular ref anywhere in the tree. `structuredClone(result)` and `JSON.parse(JSON.stringify(result))` must both round-trip identically. |
| **Pre-sorted** | Every `Account[]` (in `lists.*` and in `SnapshotDiff.*`) arrives sorted by `timestamp` **descending**, `null` timestamps last, then `username` **ascending** as the tiebreak. The UI re-sorts freely afterwards; this is just a deterministic default so exports are reproducible. |
| **`username` is the only join key** | Lowercased, trimmed, leading `@` stripped, non-empty. Compare accounts on `username` and nothing else. `displayUsername` is for rendering and for building `profileUrl` only. |
| **Timestamps are Unix SECONDS** | Not milliseconds. `null` means unknown (`0`/absent in the source). |
| **`name` is `null` when absent** | Never `''`. The UI falls back to `displayUsername` for the primary label when `name` is `null`. |
| **Synthesized accounts** | Accounts in `SnapshotDiff.lostFollowers` / `stoppedFollowing` are reconstructed from packed snapshot text: `name: null`, `fbid: null`, `externalUrl: null`, `sources: []`, `timestamp` may be present. This is by design — the UI degrades to the username. |

`result.meta.warnings` is a `ParseWarning[]` — always an array, possibly empty.
The UI should surface a non-blocking notice when it is non-empty (e.g. a small
"parsed with N notes" affordance that expands to the messages). A non-empty
`warnings` is **not** an error and must not block rendering.

---

## 2. the parser layer's public surface

### `public/src/lib/pipeline.js`

```js
/**
 * @param {File | FileList | File[]} input
 *   A single `.zip` File, or a FileList/array from <input type="file" webkitdirectory>.
 * @param {{ onProgress?: (p: ProgressEvent) => void, signal?: AbortSignal }} [opts]
 * @returns {Promise<AnalysisResult>}
 * @throws {ParseError}
 */
export async function analyzeExport(input, opts) {}

/**
 * Contact→account fuzzy matching. Separated from analyzeExport because it is
 * O(contacts × accounts) and the UI must be interactive before it finishes.
 * Call it lazily when the Contacts view opens. Cooperative: yields between
 * chunks so onProgress can paint and `signal` can abort.
 *
 * @param {AnalysisResult} result
 * @param {{ minScore?: number,   // default 0.55
 *           maxPerContact?: number, // default 3
 *           onProgress?: (pct: number) => void,
 *           signal?: AbortSignal }} [opts]
 * @returns {Promise<ContactMatch[]>}  Sorted by `score` DESCENDING.
 */
export async function matchContacts(result, opts) {}
```

`ProgressEvent` = `{ phase: string, pct: number /* 0..100 */, message: string }`.

**`ParseError`** is a real `Error` subclass exported from `pipeline.js`:

```js
export class ParseError extends Error {
  name = 'ParseError';
  /** @type {'not-a-zip'|'unsupported-zip'|'no-connections-folder'|'aborted'} */
  code;
}
```

- `not-a-zip` — input isn't a readable ZIP and isn't a directory selection.
- `unsupported-zip` — ZIP uses a compression method other than store/deflate, or the browser lacks `DecompressionStream`. `.message` should name the method.
- `no-connections-folder` — no `connections/followers_and_following/` found anywhere in the archive (matched by path **suffix**).
- `aborted` — `opts.signal` fired.

Any other failure (a single corrupt JSON file, a missing optional file) must NOT
throw — it becomes a `ParseWarning` and parsing continues.

### `public/src/lib/snapshots.js`

```js
export function listSnapshots(): SnapshotMeta[]      // sorted createdAt DESC
export function saveSnapshot(result: AnalysisResult, label?: string): SnapshotMeta  // throws QuotaError
export function deleteSnapshot(id: string): void     // no-op if absent
export function renameSnapshot(id: string, label: string): void
export function diffSnapshot(id: string, result: AnalysisResult): SnapshotDiff      // throws if id absent
export function estimateStorage(): { usedBytes: number, quotaBytes: number, snapshotCount: number }
```

**`QuotaError`** is a real `Error` subclass exported from `snapshots.js`:

```js
export class QuotaError extends Error {
  name = 'QuotaError';
  usedBytes;    // number
  neededBytes;  // number
}
```

The UI renders an actionable message from it, e.g. *"This snapshot needs 2.1 MB
but only 0.4 MB of browser storage is free. Delete an older snapshot."*

Storage keys owned by A: `oneway.snapshot.<id>` (one per snapshot), and
`oneway.snapshots.index` (the `SnapshotMeta[]`). The UI must not read or write
these directly — go through the functions above.

Storage key owned by C: `oneway.theme`. Storage key owned by B: `oneway.ui`
(view prefs — last route, table sort, density). No other keys.

---

## 3. How B works before A is done

> **CSP note (from container layer):** the production nginx sends `Content-Security-Policy:
> ... connect-src 'none' ...`, which blocks `fetch()`/`XHR` **even same-origin**.
> Do **not** `fetch()` the mock or any fixture. Import them as ES modules:
> `import mock from '../fixtures/mock-analysis.js'` (has `export default`), and in
> tests `import { files, expected } from '../fixtures/synthetic-export.js'`.
> Reading a user-selected `File` via `FileReader` / `.arrayBuffer()` /
> `DecompressionStream` is not a network call and is fine. Also: no inline
> `<script>`, no inline event handlers, no `eval`/`new Function` (`script-src
> 'self'`). Inline `style=""` and self-hosted fonts are allowed.

`public/src/state/store.js` loads `public/src/fixtures/mock-analysis.js` (a real
`AnalysisResult` scrambled from an actual export — 595/363/62/294/301, 1299
contacts, 117 growth points) via `import` whenever **either**:

- `location.search` contains `mock=1`, or
- `analyzeExport` is not yet importable / the user hasn't loaded a file.

Keep the `?mock=1` path working in the shipped build — it is the permanent dev
and screenshot affordance. At integration the integrator swaps the "no file yet"
branch for the real dropzone flow; the `?mock=1` branch stays.

`matchContacts` has no mock. Until A lands, the Contacts view may show its empty
/ loading state under `?mock=1`; that's expected.

Integrator-owned fixture modules (import, don't fetch):
- `public/src/fixtures/mock-analysis.js` — `export default <AnalysisResult>` (also kept as `.json` for humans).
- `public/src/fixtures/synthetic-export.js` — `export const files` (export-relative path → raw file text, mirrors `readZip` output) and `export const expected` (the assertion table). `parser.test.js` builds its fake file map from `files` with no I/O.

---

## 4. Ownership recap (one owner per file)

- **A**: `public/src/lib/{zip,decode,parse,analyze,contacts,snapshots,pipeline}.js`, `public/src/tests/parser.test.js`, `public/vendor/**`, `docs/DATA_FORMAT.md`.
- **B**: `public/index.html`, `public/src/{main,router}.js`, `public/src/state/**`, `public/src/export/**`, `public/src/ui/app-shell.js`, `public/src/ui/components/**` except `theme.js`/`chart-growth.js`/`chart-split.js`/`sparkline.js`, `public/src/ui/views/**`, `public/src/tests/ui.test.js`.
- **C**: `public/styles/**`, `public/assets/fonts/**`, `public/favicon.svg`, `public/src/ui/components/{theme,chart-growth,chart-split,sparkline}.js`, `docs/DESIGN.md`.
- **D**: `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `.env.example`, `nginx/**`, `README.md`, `LICENSE`, `public/robots.txt`.
- **Integrator only**: `public/src/contracts/types.js`, `public/src/lib/format.js`, `public/src/fixtures/**`, `public/src/tests/{index.html,harness.js}`, `.gitignore`, this file.

Import the shared formatters from `public/src/lib/format.js` (`formatDate`,
`formatNumber`, `formatRatio`, `pluralize`, `profileUrl`, `truncateMiddle`,
`unixToDate`). Do not re-implement them. Mojibake decoding is **not** here — it is
A's `lib/decode.js` (`fixMojibake`, `normalizeUsername`, `normalizeName`).
