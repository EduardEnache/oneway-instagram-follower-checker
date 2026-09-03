#!/usr/bin/env bash
# Assemble dist/ for the Cloudflare Pages public demo of ONE·WAY.
#
# This is the Pages equivalent of the nginx public variant: it lays the
# telemetry assets alongside the pristine public/ tree, renders config.js from
# the environment, fetches the Sentry SDK as a first-party asset, injects the
# four <head> tags (nginx/public.conf does this with sub_filter), and drops in
# the _headers CSP and the Pages Functions (/e beacon, /st Sentry tunnel).
#
# public/ and public-extras/*.js are never modified. Everything lands in dist/.
#
# Usage (from the repo root):
#
#   export SENTRY_DSN='https://<key>@oXXX.ingest.de.sentry.io/XXX'
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
CF_BEACON="${CF_BEACON:-}"
RELEASE="oneway@${CF_PAGES_COMMIT_SHA:-$(git rev-parse --short HEAD 2>/dev/null || echo dev)}"
SENTRY_SDK_VERSION="${SENTRY_SDK_VERSION:-10.73.0}"

# Parsed from the DSN (https://<key>@<host>/<projectId>) to pin the /st tunnel.
SENTRY_INGEST_HOST="$(printf '%s' "$SENTRY_DSN" | sed -nE 's#^https?://[^@]*@([^/]+)/[0-9]+/?$#\1#p')"
SENTRY_PROJECT_ID="$(printf '%s' "$SENTRY_DSN" | sed -nE 's#^.*/([0-9]+)/?$#\1#p')"

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

# --- headers (CSP) -----------------------------------------------------
cp pages/_headers dist/_headers

# --- Pages Functions: /e beacon + /st Sentry tunnel ------------------
# wrangler reads `functions/` from the repo root (sibling of the deploy dir),
# NOT from inside dist/. This directory is gitignored.
rm -rf functions
mkdir functions
cp pages/functions/e.js functions/e.js
sed -e "s|__SENTRY_INGEST_HOST__|${SENTRY_INGEST_HOST}|g" \
    -e "s|__SENTRY_PROJECT_ID__|${SENTRY_PROJECT_ID}|g" \
    pages/functions/st.tmpl.js > functions/st.js

# --- the in-browser test runner is not a public endpoint ---------------
rm -rf dist/src/tests

echo "dist/ ready ($(find dist -type f | wc -l) files)."
echo "Deploy:  npx wrangler@latest pages deploy dist --project-name oneway --branch main"
