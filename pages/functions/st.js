/* Cloudflare Pages Function — same-origin Sentry tunnel.
 *
 * The browser SDK is configured with `tunnel: "/st"`, so envelope POSTs come
 * here instead of going straight to *.ingest.*.sentry.io. Ad/privacy blockers
 * (uBlock, Brave, AdGuard, ...) only ever see a request to this site's own
 * origin, so errors from those visitors still get through.
 *
 * The target is read from the envelope's own DSN header — no deployment value
 * is baked in — and forwarding is restricted to Sentry's own ingest hosts so
 * this can't be abused as an open relay.
 */
export async function onRequestPost(context) {
  try {
    const body = await context.request.text();
    const nl = body.indexOf("\n");
    const header = JSON.parse(body.slice(0, nl < 0 ? body.length : nl));
    const dsn = new URL(header.dsn);

    if (!/(^|\.)sentry\.io$/.test(dsn.hostname)) {
      return new Response("forbidden", { status: 403 });
    }
    const projectId = dsn.pathname.replace(/^\/+/, "");
    if (!/^\d+$/.test(projectId)) {
      return new Response("bad project id", { status: 400 });
    }

    const upstream = await fetch(
      `https://${dsn.hostname}/api/${projectId}/envelope/`,
      {
        method: "POST",
        body,
        headers: { "content-type": "application/x-sentry-envelope" },
      },
    );
    return new Response(upstream.body, { status: upstream.status });
  } catch (_) {
    return new Response("bad envelope", { status: 400 });
  }
}
