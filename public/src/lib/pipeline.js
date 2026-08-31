/**
 * ONE·WAY — orchestration: input -> file map -> parse -> analyze -> AnalysisResult.
 *
 * Owned by parser layer. This is the public entry point the UI layer imports.
 * See docs/CONTRACT.md §2 for the frozen signatures.
 *
 * @typedef {import('../contracts/types.js').AnalysisResult} AnalysisResult
 * @typedef {import('../contracts/types.js').ContactMatch} ContactMatch
 * @typedef {import('../contracts/types.js').ProgressEvent} ProgressEvent
 */

import { readZip, filesToMap, ZipError } from './zip.js';
import { parseConnections, ParseError } from './parse.js';
import { analyze } from './analyze.js';
import { matchContacts } from './contacts.js';

export { ParseError } from './parse.js';
export { matchContacts } from './contacts.js';

const OWNER_RE = /instagram-(.+?)-\d{4}-\d{2}-\d{2}-/;

/**
 * @param {File | FileList | File[] | Map<string, Uint8Array|string> | Record<string, Uint8Array|string>} input
 *   A `.zip` File; a FileList/array from `<input webkitdirectory>`; or a
 *   pre-extracted path -> text/bytes map (used by CSP-safe tests where
 *   `fetch()` is forbidden, and available to callers that already unpacked).
 * @param {{ onProgress?: (p: ProgressEvent) => void, signal?: AbortSignal, sourceName?: string }} [opts]
 * @returns {Promise<AnalysisResult>}
 * @throws {ParseError}
 */
export async function analyzeExport(input, opts = {}) {
  const { onProgress, signal } = opts;
  const emit = (phase, pct, message) => {
    if (!onProgress) return;
    try {
      onProgress({ phase, pct: clamp(pct), message });
    } catch {
      /* a throwing progress callback must not break parsing */
    }
  };

  checkAbort(signal);
  emit('unzip', 0, 'Reading export…');

  /** @type {Map<string, Uint8Array>} */
  let fileMap;
  let sourceName = '';

  if (isMapInput(input)) {
    fileMap = coerceFileMap(input);
    sourceName = opts.sourceName || deriveOwnerSource(fileMap) || 'export';
    emit('unzip', 40, 'Files read');
  } else if (isZipInput(input)) {
    sourceName = input.name || 'export.zip';
    try {
      fileMap = await readZip(input, (p) => emit('unzip', p * 40, 'Unzipping…'));
    } catch (err) {
      throw toParseError(err);
    }
  } else if (isDirInput(input)) {
    const files = Array.from(/** @type {Iterable<any>} */ (input));
    if (files.length === 0) throw new ParseError('Empty folder selection', 'not-a-zip');
    sourceName = deriveDirName(files);
    try {
      fileMap = await filesToMap(files);
    } catch (err) {
      throw new ParseError(
        `Could not read the selected folder: ${err && err.message ? err.message : err}`,
        'not-a-zip',
      );
    }
    emit('unzip', 40, 'Folder read');
  } else {
    throw new ParseError('Input is not a .zip file or a folder selection', 'not-a-zip');
  }

  checkAbort(signal);
  emit('parse', 40, 'Parsing connections…');

  const parsed = parseConnections(fileMap); // throws ParseError('no-connections-folder') only
  emit('parse', 78, 'Connections parsed');

  checkAbort(signal);
  emit('analyze', 80, 'Analysing the follow graph…');

  const result = analyze(parsed);

  result.meta.sourceName = sourceName;
  result.meta.parsedAt = Math.floor(Date.now() / 1000);
  result.meta.ownerUsername = deriveOwner(sourceName) || deriveOwnerFromPaths(fileMap);
  result.meta.exportedAt = maxTimestamp(result, parsed.maxTimestamp);

  emit('analyze', 100, 'Done');
  return result;
}

// ---------------------------------------------------------------------------

function isZipInput(input) {
  if (typeof File !== 'undefined' && input instanceof File) return true;
  return (
    !!input &&
    typeof input.arrayBuffer === 'function' &&
    typeof input.name === 'string' &&
    typeof input.length !== 'number'
  );
}

function isDirInput(input) {
  if (Array.isArray(input)) return true;
  if (typeof FileList !== 'undefined' && input instanceof FileList) return true;
  return !!input && typeof input.length === 'number' && typeof input.item === 'function';
}

function isMapInput(input) {
  if (input instanceof Map) return true;
  return (
    !!input &&
    typeof input === 'object' &&
    (input.constructor === Object || Object.getPrototypeOf(input) === null) &&
    typeof input.arrayBuffer !== 'function'
  );
}

const ENC = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;

/**
 * Normalize a path -> (text | bytes) map into path -> Uint8Array.
 * @returns {Map<string, Uint8Array>}
 */
function coerceFileMap(input) {
  const src = input instanceof Map ? input.entries() : Object.entries(input);
  const out = new Map();
  for (const [path, value] of src) {
    if (value == null) continue;
    let bytes;
    if (typeof value === 'string') bytes = ENC ? ENC.encode(value) : Uint8Array.from(value, (c) => c.charCodeAt(0) & 0xff);
    else if (value instanceof Uint8Array) bytes = value;
    else if (value instanceof ArrayBuffer) bytes = new Uint8Array(value);
    else if (ArrayBuffer.isView(value)) bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    else continue;
    out.set(String(path), bytes);
  }
  return out;
}

function deriveOwnerSource(fileMap) {
  for (const p of fileMap.keys()) {
    const m = p.match(OWNER_RE);
    if (m) return p.split('/')[0];
  }
  return '';
}

function deriveOwner(name) {
  const m = String(name || '').match(OWNER_RE);
  return m ? m[1] : null;
}

function deriveOwnerFromPaths(fileMap) {
  for (const p of fileMap.keys()) {
    const m = p.match(OWNER_RE);
    if (m) return m[1];
  }
  return null;
}

function deriveDirName(files) {
  for (const f of files) {
    const rel = f.webkitRelativePath || '';
    const top = rel.split('/')[0];
    if (top) return top;
  }
  return (files[0] && files[0].name) || 'export';
}

function maxTimestamp(result, parsedMax) {
  let max = typeof parsedMax === 'number' ? parsedMax : 0;
  const bump = (ts) => {
    if (typeof ts === 'number' && ts > max) max = ts;
  };
  for (const arr of Object.values(result.lists)) for (const a of arr) bump(a.timestamp);
  for (const h of result.hashtags) bump(h.timestamp);
  for (const c of result.contacts) bump(c.importedAt);
  return max > 0 ? max : null;
}

function toParseError(err) {
  if (err instanceof ParseError) return err;
  if (err instanceof ZipError) return new ParseError(err.message, err.code);
  if (err && (err.code === 'unsupported-zip' || err.code === 'not-a-zip')) {
    return new ParseError(err.message || 'Could not read the ZIP archive', err.code);
  }
  return new ParseError(
    `Could not read the ZIP archive: ${err && err.message ? err.message : err}`,
    'not-a-zip',
  );
}

function checkAbort(signal) {
  if (signal && signal.aborted) throw new ParseError('Operation aborted', 'aborted');
}

function clamp(n) {
  n = Number(n) || 0;
  return n < 0 ? 0 : n > 100 ? 100 : n;
}

/**
 * Escape hatch for tests / the real-zip verification harness: analyse a
 * pre-built path -> bytes map without going through File/FileList. Not part of
 * the frozen contract; safe to ignore from the UI.
 *
 * @param {Map<string, Uint8Array|string> | Record<string, Uint8Array|string>} fileMap
 * @param {{ sourceName?: string }} [opts]
 * @returns {AnalysisResult}
 */
export function analyzeFileMap(fileMapInput, opts = {}) {
  const fileMap = coerceFileMap(fileMapInput);
  const parsed = parseConnections(fileMap);
  const result = analyze(parsed);
  result.meta.sourceName = opts.sourceName || '';
  result.meta.parsedAt = Math.floor(Date.now() / 1000);
  result.meta.ownerUsername = deriveOwner(opts.sourceName || '') || deriveOwnerFromPaths(fileMap);
  result.meta.exportedAt = maxTimestamp(result, parsed.maxTimestamp);
  return result;
}
