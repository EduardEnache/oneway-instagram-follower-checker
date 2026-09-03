/**
 * ONE·WAY — app event bus.
 *
 * Fires a DOM CustomEvent on `window`. NOTHING in this repository listens to
 * it, and the default nginx config sends `connect-src 'none'`, so no listener
 * could send it anywhere. It exists so the temporary public instance can
 * attach a listener from outside the app (see public-extras/telemetry.js)
 * without this code ever needing to know a sink exists.
 *
 * Payloads carry NO usernames, NO display names, NO file names, NO counts
 * that could fingerprint an account, and NO export contents. Enum-ish values
 * and bucketed magnitudes only. Keep it that way.
 */
export function emitAppEvent(name, data) {
  try {
    window.dispatchEvent(new CustomEvent('oneway:event', { detail: { name, data: data || {} } }));
  } catch { /* never let telemetry break the app */ }
}

/** Bucket a count so it can't fingerprint an account. */
export function bucket(n) {
  n = Number(n) || 0;
  return n < 100 ? '0-99' : n < 1000 ? '100-999' : n < 10000 ? '1k-10k' : n < 100000 ? '10k-100k' : '100k+';
}
