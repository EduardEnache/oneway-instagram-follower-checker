/* Cloudflare Pages Function — the public-demo event beacon.
 *
 * navigator.sendBeacon('/e?n=<event>&...') -> 204. We log the query string so a
 * live activity feed is available during a test session via:
 *
 *     npx wrangler pages deployment tail --project-name oneway
 *
 * Nothing is stored, no request body is read, and the client IP is never
 * logged. The eight event names and their (PII-free) payloads are defined in
 * public/src/emit.js.
 */
export function onRequest(context) {
  try {
    console.log("oneway-event", new URL(context.request.url).search);
  } catch (_) {
    /* never let the beacon 500 */
  }
  return new Response(null, {
    status: 204,
    headers: { "cache-control": "no-store" },
  });
}
