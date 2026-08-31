/**
 * ONE·WAY — RFC 4180 CSV writer.
 *
 * - Fields containing `"`, `,`, CR or LF are wrapped in double quotes.
 * - Interior `"` is doubled.
 * - Records are separated by CRLF.
 * - Output is prefixed with a UTF-8 BOM so Excel / LibreOffice render emoji and
 *   diacritics correctly.
 */

const BOM = '﻿';

/**
 * Quote a single field per RFC 4180.
 * @param {*} value
 * @returns {string}
 */
export function csvField(value) {
  let s = value == null ? '' : String(value);
  if (/[",\r\n]/.test(s)) {
    s = '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/**
 * Build a CSV string from a header row + data rows (arrays of primitives).
 * @param {string[]} header
 * @param {Array<Array<*>>} rows
 * @returns {string}
 */
export function csvFromMatrix(header, rows) {
  const lines = [header.map(csvField).join(',')];
  for (const row of rows) lines.push(row.map(csvField).join(','));
  return BOM + lines.join('\r\n') + '\r\n';
}

/**
 * Build a CSV string from objects + a column spec.
 * @param {Array<Record<string, any>>} items
 * @param {Array<{ key: string, header?: string, value?: (item: any) => any }>} columns
 * @returns {string}
 */
export function csvFromObjects(items, columns) {
  const header = columns.map((c) => c.header ?? c.key);
  const rows = items.map((item) =>
    columns.map((c) => (typeof c.value === 'function' ? c.value(item) : item[c.key])),
  );
  return csvFromMatrix(header, rows);
}
