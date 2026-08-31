/**
 * ONE·WAY — string decoding & normalization helpers.
 *
 * Owned by parser layer. Pure, synchronous, no I/O. This is the ONLY home for
 * mojibake handling (the shared `lib/format.js` deliberately does not carry it).
 *
 * Instagram's "Download your information" JSON double-encodes every human string:
 * the bytes of a UTF-8 string are themselves re-encoded as UTF-8 (via a Latin-1
 * round-trip), so `a-breve` (0xC4 0x83) arrives as the two characters
 * U+00C4 U+0083. `fixMojibake` reverses that, and uses a `fatal:true`
 * TextDecoder as the false-positive guard: a genuine Latin-1 string like
 * `Muller` (with u-umlaut) produces invalid UTF-8 when its char codes are read
 * back as bytes, the decoder throws, and we return the original untouched.
 */

// Any code unit in U+0080..U+00FF — the only range double-encoded mojibake
// can occupy once the outer UTF-8 layer is read as Latin-1.
const HIGH_LATIN1 = /[-ÿ]/;

/** @type {TextDecoder | null} */
let FATAL_DECODER = null;
function fatalDecoder() {
  if (!FATAL_DECODER) FATAL_DECODER = new TextDecoder('utf-8', { fatal: true });
  return FATAL_DECODER;
}

/**
 * Repair double-encoded UTF-8 ("mojibake"). Returns the input unchanged when it
 * is plain ASCII, already real Unicode, or not valid UTF-8 when reinterpreted.
 *
 * @param {string} s
 * @returns {string}
 */
export function fixMojibake(s) {
  // ASCII / empty fast-path — nothing above U+007F means nothing to repair.
  if (!s || !HIGH_LATIN1.test(s)) return s;

  // If any code unit is above 0xFF the string already carries real Unicode
  // (e.g. actual emoji, CJK) and is not Latin-1-reinterpretable mojibake.
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) > 0xff) return s;
  }

  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i) & 0xff;

  try {
    return fatalDecoder().decode(bytes);
  } catch {
    // Not valid UTF-8 → it was a real Latin-1 string. Leave it alone.
    return s;
  }
}

/**
 * Canonical username key: trimmed, lowercased, leading '@'s removed.
 * @param {*} s
 * @returns {string}
 */
export function normalizeUsername(s) {
  return String(s == null ? '' : s)
    .trim()
    .toLowerCase()
    .replace(/^@+/, '');
}

// Combining diacritical marks block (U+0300..U+036F) left behind by NFD.
const COMBINING_MARKS = /[̀-ͯ]/g;
const DIACRITIC = /\p{Diacritic}/gu;
const NON_ALNUM_SPACE = /[^\p{L}\p{N}\s]/gu;
const WS = /\s+/g;

/**
 * Aggressive normalization for fuzzy NAME matching only — never for display.
 * fixMojibake -> NFD -> strip combining marks / diacritics -> lowercase ->
 * collapse whitespace -> drop everything that is not a letter, number or space.
 *
 * @param {*} s
 * @returns {string}
 */
export function normalizeName(s) {
  let out = fixMojibake(String(s == null ? '' : s));
  out = out.normalize('NFD').replace(COMBINING_MARKS, '').replace(DIACRITIC, '');
  out = out.toLowerCase().replace(WS, ' ').trim();
  out = out.replace(NON_ALNUM_SPACE, '').replace(WS, ' ').trim();
  return out;
}
