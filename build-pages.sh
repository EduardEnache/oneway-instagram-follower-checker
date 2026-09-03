#!/usr/bin/env bash
# Assemble dist/ for the Cloudflare Pages public demo of ONE·WAY.
#
# This is the Pages equivalent of the nginx public variant: it lays the
# telemetry assets alongside the pristine public/ tree, renders config.js from
# the environment, fetches the Sentry SDK as a first-party asset, injects the
# four <head> tags (nginx/public.conf does this with sub_filter), and drops in
# the _headers CSP and the /e beacon Function.
#
# public/ and public-extras/*.js are never modified. Everything lands in dist/.
#
# Usage (from the repo root):
#
#   export SENTRY_DSN='https://<key>@oXXX.ingest.us.sentry.io/XXX'
#   export SENTRY_INGEST_HOST='https://oXXX.ingest.us.sentry.io'
#   export CF_BEACON=''        # optional: a Web Analytics beacon token. Leave
#                              # empty to use the Pages project's own Web
#                              # Analytics toggle instead.
#   ./build-pages.sh
#   npx wrangler@latest pages deploy dist --project-name oneway --branch main
#
# Teardown: delete the Pages project (Cloudflare dashboard -> Workers & Pages),
# and the repo is back to its default connect-src 'none' posture.
set -euo pipefail
cd "$(dirname "$0")"

SENTRY_DSN="${SENTRY_DSN:-}"
SENTRY_INGEST_HOST="${SENTRY_INGEST_HOST:-}"
CF_BEACON="${CF_BEACON:-}"
RELEASE="oneway@${CF_PAGES_COMMIT_SHA:-$(git rev-parse --short HEAD 2>/dev/null || echo dev)}"
SENTRY_SDK_VERSION="${SENTRY_SDK_VERSION:-10.73.0}"

rm -rf dist
cp -r public dist

# --- telemetry assets, served at /public-extras/* ------------------------
mkdir -p dist/public-extras
cp public-extras/telemetry.js public-extras/public.css dist/public-extras/
curl -fsSL -o dist/public-extras/sentry.min.js \
  "https://browser.sentry-cdn.com/${SENTRY_SDK_VERSION}/bundle.min.js"

# --- config.js from the environment (public values, not secrets) ---------
sed -e "s|__DSN__|${SENTRY_DSN}|g" \
    -e "s|__CFB__|${CF_BEACON}|g" \
    -e "s|__REL__|${RELEASE}|g" \
    pages/config.tmpl.js > dist/public-extras/config.js

# --- inject the <head> tags (nginx/public.conf does this via sub_filter) -
INJECT='<link rel="stylesheet" href="/public-extras/public.css"><script src="/public-extras/config.js"></script><script src="/public-extras/sentry.min.js"></script><script src="/public-extras/telemetry.js"></script>'
sed "s|</head>|${INJECT}</head>|" dist/index.html > dist/index.html.tmp
mv dist/index.html.tmp dist/index.html

# --- headers (CSP) + the /e beacon Function -----------------------------
sed "s|__SENTRY_INGEST_HOST__|${SENTRY_INGEST_HOST}|g" pages/_headers > dist/_headers
mkdir -p dist/functions
cp pages/functions/e.js dist/functions/e.js

# --- the in-browser test runner is not a public endpoint ---------------
rm -rf dist/src/tests

echo "dist/ ready ($(find dist -type f | wc -l) files)."
echo "Deploy:  npx wrangler@latest pages deploy dist --project-name oneway --branch main"
