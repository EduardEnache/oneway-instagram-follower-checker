/**
 * ONE·WAY — client-side file download.
 *
 * Blob + object URL + a synthetic <a download>. Works when served by nginx
 * (not sandboxed). Filenames: oneway-<listId>-<YYYY-MM-DD>.csv | .json
 */

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
  downloadBlob(filename, csv, 'text/csv');
}

/** @param {string} filename @param {any} obj */
export function downloadJson(filename, obj) {
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
