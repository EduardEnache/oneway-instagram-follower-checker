/**
 * ONE·WAY — client-side file download.
 *
 * Blob + object URL + a synthetic <a download>. Works when served by nginx
 * (not sandboxed). Filenames: oneway-<listId>-<YYYY-MM-DD>.csv | .json
 */

import { emitAppEvent } from '../emit.js';

/** Pull the list id back out of a `oneway-<list>-<date>.<ext>` filename. */
function listFromFilename(filename) {
  const m = /^oneway-(.+)-\d{4}-\d{2}-\d{2}\.(csv|json)$/.exec(String(filename || ''));
  return m ? m[1] : 'unknown';
}

/**
 * @param {string} filename
 * @param {BlobPart} data
 * @param {string} mime
 */
export function downloadBlob(filename, data, mime) {
  const blob = new Blob([data], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** @param {string} filename @param {string} csv */
export function downloadCsv(filename, csv) {
  emitAppEvent('data_exported', { list: listFromFilename(filename), ext: 'csv' });
  downloadBlob(filename, csv, 'text/csv');
}

/** @param {string} filename @param {any} obj */
export function downloadJson(filename, obj) {
  emitAppEvent('data_exported', { list: listFromFilename(filename), ext: 'json' });
  downloadBlob(filename, JSON.stringify(obj, null, 2), 'application/json');
}

/** ISO date (local) for filenames. */
export function todayStamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * @param {string} listId
 * @param {'csv'|'json'} ext
 */
export function exportFilename(listId, ext) {
  return `oneway-${listId}-${todayStamp()}.${ext}`;
}
