/* Copy to public-extras/config.js and fill in. That copy is gitignored.
 * None of these are secrets: they all ship to every visitor's browser.
 * (The Cloudflare Pages deploy renders this from env vars via build-pages.sh;
 * this example is for the self-hosted nginx public variant.) */
window.__OW_PUBLIC__ = {
  sentryDsn:    "https://<key>@o<org>.ingest.<region>.sentry.io/<project>",
  sentryEnv:    "public",
  sentryTunnel: "",                  // "/st" on Pages (same-origin tunnel Function);
                                     // leave "" for nginx to send direct to Sentry
  release:      "oneway@YYYY-MM-DD", // bump on each deploy, or use `git rev-parse --short HEAD`
  cfBeacon:     "<data-cf-beacon token>",
  sampleRate:   1.0,
};
