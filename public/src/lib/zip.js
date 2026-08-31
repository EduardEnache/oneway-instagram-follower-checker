/**
 * ONE·WAY — hand-rolled ZIP reader (no dependency, no DEFLATE implementation).
 *
 * Owned by parser layer. Strategy: parse the **Central Directory** (never the local
 * headers — that sidesteps the streaming data-descriptor problem), then pull
 * each entry's bytes from its local-header offset. Compression:
 *   - method 0 (store)   -> raw subarray
 *   - method 8 (deflate) -> browser-native DecompressionStream('deflate-raw')
 * Anything else, or a missing DecompressionStream when a deflate entry is hit,
 * throws a tagged Error the pipeline maps to ParseError('unsupported-zip').
 *
 * ZIP64 is supported: EOCD locator (0x07064b50) + ZIP64 EOCD (0x06064b50) for
 * archives with >= 65535 entries or >= 4 GiB members, plus the 0x0001 extra
 * field for oversized per-entry sizes / offsets.
 *
 * A real Instagram export is small and entirely STORED, so this path is simple
 * and fast in practice; the deflate + ZIP64 code is defensive breadth.
 */

const SIG_EOCD = 0x06054b50;
const SIG_EOCD64 = 0x06064b50;
const SIG_EOCD64_LOCATOR = 0x07064b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;
const MAX_EOCD_SCAN = 65557; // 22-byte EOCD + max 65535-byte comment

const UTF8 = new TextDecoder('utf-8');

/**
 * Error thrown for ZIP structural / capability problems. `.code` is one of
 * 'not-a-zip' | 'unsupported-zip' so pipeline.js can rewrap it verbatim.
 */
export class ZipError extends Error {
  /** @param {string} message @param {'not-a-zip'|'unsupported-zip'} code */
  constructor(message, code) {
    super(message);
    this.name = 'ZipError';
    this.code = code;
  }
}

/**
 * Read a ZIP File/Blob into a path -> bytes map.
 *
 * @param {Blob} file  A `.zip` File or Blob.
 * @param {(pct: number) => void} [onProgress]  0..1 within the unzip phase.
 * @returns {Promise<Map<string, Uint8Array>>}
 */
export async function readZip(file, onProgress) {
  const buf = new Uint8Array(await file.arrayBuffer());
  if (buf.length < 22) throw new ZipError('File is too small to be a ZIP archive', 'not-a-zip');
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  const eocd = findEocd(buf, dv);
  const central = resolveCentral(buf, dv, eocd);

  const entries = readCentralDirectory(dv, central.offset, central.count);
  const out = new Map();
  let done = 0;
  for (const e of entries) {
    if (!e.name || e.name.endsWith('/')) {
      done++;
      continue; // directory record
    }
    out.set(e.name, await extractEntry(buf, dv, e));
    done++;
    if (onProgress) onProgress(entries.length ? done / entries.length : 1);
  }
  return out;
}

/**
 * Convenience: decode one entry's bytes as UTF-8 text.
 * @param {Map<string, Uint8Array>} map
 * @param {string} path
 * @returns {string|null}
 */
export function readZipText(map, path) {
  const bytes = map.get(path);
  return bytes ? UTF8.decode(bytes) : null;
}

/**
 * Build the same path -> bytes map from a directory selection
 * (`<input type="file" webkitdirectory>` -> FileList) or any array of
 * File-like objects exposing `webkitRelativePath`/`name` and `arrayBuffer()`.
 *
 * @param {Iterable<{ webkitRelativePath?: string, name?: string, arrayBuffer: () => Promise<ArrayBuffer> }>} files
 * @returns {Promise<Map<string, Uint8Array>>}
 */
export async function filesToMap(files) {
  const list = Array.from(files);
  const map = new Map();
  for (const f of list) {
    const path = (f.webkitRelativePath && f.webkitRelativePath.length ? f.webkitRelativePath : f.name) || '';
    if (!path || path.endsWith('/')) continue;
    map.set(path, new Uint8Array(await f.arrayBuffer()));
  }
  return map;
}

// ---------------------------------------------------------------------------

function findEocd(buf, dv) {
  const start = Math.max(0, buf.length - MAX_EOCD_SCAN);
  for (let i = buf.length - 22; i >= start; i--) {
    if (dv.getUint32(i, true) === SIG_EOCD) {
      return {
        pos: i,
        entriesTotal: dv.getUint16(i + 10, true),
        cdSize: dv.getUint32(i + 12, true),
        cdOffset: dv.getUint32(i + 16, true),
      };
    }
  }
  throw new ZipError('End-of-central-directory record not found (not a ZIP archive)', 'not-a-zip');
}

function resolveCentral(buf, dv, eocd) {
  const needsZip64 =
    eocd.cdOffset === 0xffffffff || eocd.cdSize === 0xffffffff || eocd.entriesTotal === 0xffff;

  if (!needsZip64) return { offset: eocd.cdOffset, count: eocd.entriesTotal };

  // Locator sits 20 bytes before the EOCD.
  const locPos = eocd.pos - 20;
  if (locPos < 0 || dv.getUint32(locPos, true) !== SIG_EOCD64_LOCATOR) {
    throw new ZipError('ZIP64 archive without a valid ZIP64 EOCD locator', 'not-a-zip');
  }
  const z64Pos = Number(dv.getBigUint64(locPos + 8, true));
  if (z64Pos < 0 || z64Pos + 56 > buf.length || dv.getUint32(z64Pos, true) !== SIG_EOCD64) {
    throw new ZipError('ZIP64 end-of-central-directory record not found', 'not-a-zip');
  }
  return {
    offset: Number(dv.getBigUint64(z64Pos + 48, true)),
    count: Number(dv.getBigUint64(z64Pos + 32, true)),
  };
}

function readCentralDirectory(dv, offset, count) {
  const entries = [];
  let p = offset;
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== SIG_CENTRAL) {
      throw new ZipError(`Corrupt central directory at record ${i}`, 'not-a-zip');
    }
    const method = dv.getUint16(p + 10, true);
    let compSize = dv.getUint32(p + 20, true);
    let uncompSize = dv.getUint32(p + 24, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    let localOffset = dv.getUint32(p + 42, true);

    const nameStart = p + 46;
    const name = UTF8.decode(new Uint8Array(dv.buffer, dv.byteOffset + nameStart, nameLen));

    // ZIP64 extra field (0x0001): only the fields that are 0xFFFFFFFF above are
    // present, in this fixed order: uncompressed, compressed, local offset.
    const extraStart = nameStart + nameLen;
    let ep = extraStart;
    const extraEnd = extraStart + extraLen;
    while (ep + 4 <= extraEnd) {
      const tag = dv.getUint16(ep, true);
      const size = dv.getUint16(ep + 2, true);
      const body = ep + 4;
      if (tag === 0x0001) {
        let q = body;
        if (uncompSize === 0xffffffff) {
          uncompSize = Number(dv.getBigUint64(q, true));
          q += 8;
        }
        if (compSize === 0xffffffff) {
          compSize = Number(dv.getBigUint64(q, true));
          q += 8;
        }
        if (localOffset === 0xffffffff) {
          localOffset = Number(dv.getBigUint64(q, true));
          q += 8;
        }
      }
      ep = body + size;
    }

    entries.push({ name, method, compSize, uncompSize, localOffset });
    p = extraEnd + commentLen;
  }
  return entries;
}

async function extractEntry(buf, dv, e) {
  if (dv.getUint32(e.localOffset, true) !== SIG_LOCAL) {
    throw new ZipError(`Corrupt local header for "${e.name}"`, 'not-a-zip');
  }
  const nameLen = dv.getUint16(e.localOffset + 26, true);
  const extraLen = dv.getUint16(e.localOffset + 28, true);
  const dataStart = e.localOffset + 30 + nameLen + extraLen;
  const raw = buf.subarray(dataStart, dataStart + e.compSize);

  if (e.method === 0) return raw.slice();
  if (e.method === 8) return inflateRaw(raw, e.name);

  throw new ZipError(
    `"${e.name}" uses unsupported ZIP compression method ${e.method}`,
    'unsupported-zip',
  );
}

async function inflateRaw(bytes, name) {
  if (typeof DecompressionStream === 'undefined') {
    throw new ZipError(
      `"${name}" is DEFLATE-compressed (method 8) but this browser has no DecompressionStream`,
      'unsupported-zip',
    );
  }
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch (err) {
    throw new ZipError(`Failed to inflate "${name}": ${err && err.message ? err.message : err}`, 'not-a-zip');
  }
}
