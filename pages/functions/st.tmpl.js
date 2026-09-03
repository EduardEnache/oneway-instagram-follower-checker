/* Cloudflare Pages Function — same-origin Sentry tunnel.
 *
 * The browser SDK posts envelopes to "/st" (Sentry.init `tunnel` option)
 * instead of straight to *.ingest.*.sentry.io, so ad/privacy blockers only
 * ever see a request to this site's own origin and errors from those visitors
 * still get through.
 *
 * The forwarding target is PINNED at build time to this deployment's own
 * Sentry project (build-pages.sh substitutes the two constants below from
 * SENTRY_DSN). An envelope whose DSN header names any other host or project
 * is rejected — /st cannot be used to relay to arbitrary Sentry projects.
 */
const INGEST_HOST = "__SENTRY_INGEST_HOST__"; // e.g. o123.ingest.de.sentry.io
const PROJECT_ID = "__SENTRY_PROJECT_ID__";

export async function onRequestPost(context) {
  if (!INGEST_HOST || !PROJECT_ID) {
    return new Response("tunnel not configured", { status: 503 });
  }
  try {
    const body = await context.request.text();
    const nl = body.indexOf("\n");
    const header = JSON.parse(body.slice(0, nl < 0 ? body.length : nl));
    const dsn = new URL(header.dsn);
    const projectId = dsn.pathname.replace(/^\/+/, "");

    if (dsn.hostname !== INGEST_HOST || projectId !== PROJECT_ID) {
      return new Response("forbidden", { status: 403 });
    }

    const upstream = await fetch(
      `https://${INGEST_HOST}/api/${PROJECT_ID}/envelope/`,
      {
        method: "POST",
        body,
        headers: { "content-type": "application/x-sentry-envelope" },
      },
    );

    // Pass back the signals the SDK transport needs to throttle itself.
    const out = new Headers();
    for (const k of ["content-type", "retry-after", "x-sentry-rate-limits"]) {
      const v = upstream.headers.get(k);
      if (v) out.set(k, v);
    }
    return new Response(upstream.body, { status: upstream.status, headers: out });
  } catch (_) {
    return new Response("bad envelope", { status: 400 });
  }
}
