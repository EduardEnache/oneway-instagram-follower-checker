/* Copy to public-extras/config.js and fill in. That copy is gitignored.
 * Neither value is a secret: both ship to every visitor's browser. */
window.__OW_PUBLIC__ = {
  sentryDsn:  "https://<key>@o<org>.ingest.<region>.sentry.io/<project>",
  sentryEnv:  "public",
  release:    "oneway@YYYY-MM-DD",   // bump on each deploy, or use `git rev-parse --short HEAD`
  cfBeacon:   "<data-cf-beacon token>",
  sampleRate: 1.0,
};
