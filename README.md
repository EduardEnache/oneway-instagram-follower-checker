# ONE·WAY

A local, private **"who doesn't follow me back"** analyzer for Instagram data
exports. Point it at the `.zip` Instagram gives you and it shows non‑followers,
fans (people you don't follow back), mutuals, pending and recent follow
requests, recently unfollowed profiles, blocked accounts, close friends,
hashtags you follow, and a best‑effort match of your phone contacts to
accounts.

Every feature is free. There is no account, no login, no upload, no paywall,
no telemetry, no "pro" tier. It is a static web page and an nginx container.

---

## 1. What it is

You give Instagram a few days' notice, download your data export, and drop the
`.zip` onto this page. It parses the export **in your browser** and renders the
relationship views that sites like dontfollowback.com put behind a paywall —
except here nothing is paid and nothing leaves your machine.

It is designed to be self‑hosted: a single nginx container serving static
files, reached from your own devices over Tailscale.

## 2. Privacy, and how to verify it

**Parsing is 100% in‑browser.** The `.zip` is read with the browser's built‑in
`DecompressionStream`; the JSON inside is analyzed with plain JavaScript. The
server (nginx) only ever sends static files — it has no database, no upload
endpoint, no logging of request bodies, and nothing to receive an upload with.

The privacy claim is **enforced by the browser**, not just promised. The nginx
config sends this header on every response:

```
Content-Security-Policy: ... connect-src 'none'; ...
```

`connect-src 'none'` tells the browser to block *every* outbound network call
the page could attempt — `fetch`, `XMLHttpRequest`, WebSocket, `sendBeacon`.
Even if the page's JavaScript tried to phone home, the browser would refuse.

**Verify it yourself:**

1. Open DevTools → **Network** tab. Click the 🚫 "clear" button.
2. Load your export and let the analysis run.
3. Confirm the request list stays **empty** — zero requests during and after
   parsing. (You'll see the initial page/script/font loads only if you reload
   with the tab open; parsing itself adds nothing.)
4. Click the request for `/` (the document) → **Headers** → **Response
   Headers** and read the `Content-Security-Policy`. Confirm it contains
   `connect-src 'none'`.

These guarantees describe the image you build from this repository. A temporary
public demo is described in §11.

## 3. Get your Instagram export

1. In the Instagram app or on instagram.com, go to **Accounts Center** →
   **Your information and permissions** → **Download your information**.
2. Request a **new export**. Choose:
   - **Format: JSON** — *not* HTML. The HTML format will not parse.
   - **Date range:** All time.
   - **Content:** at minimum **Followers and following** and **Contacts**
     (a.k.a. "Contacts" / synced contacts). "Some of your information" with
     those two boxes ticked is enough; "All available information" also works.
3. Submit. Instagram takes anywhere from a few minutes to a few days to email
   you a download link.
4. Download the `.zip`. **Feed it in as‑is** — you do not need to unzip it.
   (For debugging you can instead pick an already‑extracted folder; the page
   has a "choose a folder" option next to the drop zone.)

## 4. Run it

```sh
# 1. (optional) choose a port / bind address
cp .env.example .env
#    edit .env if you want something other than 127.0.0.1:8477

# 2. build and start
docker compose up -d --build

# 3. open it
#    http://127.0.0.1:8477
```

Everyday commands:

| Command | What it does |
|---|---|
| `docker compose ps` | Show status — the `STATUS` column should read `healthy` after ~30 s. |
| `docker compose logs -f` | Follow nginx's access/error log. |
| `docker compose down` | Stop and remove the container. Nothing is lost — there is no state. |
| `docker compose up -d --build` | Rebuild and restart after you've changed anything under `public/`. |

## 5. Access over Tailscale

Install Tailscale on the mini PC and bring it up:

```sh
sudo tailscale up
```

**Recommended — `tailscale serve`:**

```sh
sudo tailscale serve --bg --https=443 http://127.0.0.1:8477
```

This publishes the container at `https://<machine>.<tailnet>.ts.net` — reachable
from any device signed into *your* tailnet, with MagicDNS and an automatic
Let's Encrypt certificate. It stays private to your tailnet. This pairs with
the default `ONEWAY_BIND=127.0.0.1`, so the container is never exposed on the
LAN.

Check and undo:

```sh
tailscale serve status          # show what's published
sudo tailscale serve --https=443 off
```

> **Do NOT use `tailscale funnel`.** Funnel puts the service on the *public
> internet*. Your follower list, contacts, and blocked accounts are exactly the
> kind of data that must never be publicly reachable. `tailscale funnel status`
> should always show nothing for this service.

**Alternative — direct tailnet IP, no `serve`:**

```sh
# in .env
ONEWAY_BIND=0.0.0.0
ONEWAY_PORT=8477
```

```sh
docker compose up -d
# then from a tailnet device:
#   http://<tailscale-ip-of-mini-pc>:8477
```

This skips the HTTPS cert and MagicDNS name but needs no `serve` command. It is
still tailnet‑only as long as the mini PC's firewall doesn't forward 8477 from
the public internet.

## 6. Browser support

Reading the `.zip` needs the `DecompressionStream` API:

| Browser | Minimum version |
|---|---|
| Chrome / Edge | 103 |
| Firefox | 113 |
| Safari | 16.4 |

Older browsers load the page but show a clear error when you try to open an
export. (If your export happens to be entirely *stored* — uncompressed — inside
the zip it may still work, but don't count on it.)

## 7. Snapshots & storage

You can save a **snapshot** of a parse to compare against a future export
("who unfollowed me since March?"). Snapshots live in **that browser's
`localStorage` only**:

- They do **not** sync between devices or browsers.
- Clearing site data / browser storage deletes them.
- Storage is roughly 5 MB per origin; the app packs snapshots tightly (~20
  bytes per account) and warns you as you approach the limit.

## 8. Known limitations

- **"Unfollowed you" detection is a heuristic.** Instagram's export does not
  include stable account IDs in the followers list, so when an account
  disappears between two exports the app cannot be *certain* whether they
  unfollowed you, renamed their handle, deactivated, or were banned. It flags
  likely renames (a lost + gained pair sharing an identical follow timestamp)
  and always states the caveat. Treat "unfollowed you" as "probably".
- **Contact → account matching is a guess.** It compares your contact's saved
  name to account display names and handles using name‑similarity scoring
  alone. It is frequently wrong, especially for common names. The Contacts view
  labels every match with a confidence level and the reasons behind it, and
  defaults to showing only high‑confidence matches. Do not act on a match
  without recognising the account yourself.
- **Phone numbers** from your contacts are never included in any export or
  snapshot unless you explicitly tick the clearly‑labelled checkbox.

## 9. Project layout

```
public/                     the entire app — static files, no build step
  index.html                app shell; loads ES modules from src/
  theme-init.js              tiny pre-paint theme setter (kept external for a strict CSP)
  favicon.svg  robots.txt
  styles/*.css              design system: tokens, base, layout, components, charts
  assets/fonts/*.woff2      self-hosted Bricolage Grotesque / Inter / JetBrains Mono
  src/lib/*.js              the parser: zip reading, mojibake fixing, set math,
                            contact matching, snapshot diffing (pipeline.js is the entry)
  src/state|ui|export/*.js  the interface: store, hash router, views, data table, CSV/JSON export
  src/fixtures/             mock AnalysisResult + a synthetic mini-export for tests
  src/tests/index.html      in-browser test runner (reachable at /src/tests/)

nginx/default.conf          MIME (application/javascript for .js/.mjs), gzip,
                            short cache TTLs, hash-router fallback, security headers
Dockerfile                  FROM nginx:1.27-alpine + COPY public/ — no build stage
docker-compose.yml          one hardened service: read-only fs, dropped caps, healthcheck
.env.example                ONEWAY_PORT, ONEWAY_BIND

public-extras/              telemetry.js listener + CSS, injected only on the public demo
pages/                      Cloudflare Pages config: _headers (CSP), config.tmpl.js, functions/e.js
build-pages.sh              assembles dist/ for the Pages public demo
nginx/public.conf           relaxed CSP for a self-hosted public demo (Cloudflare Tunnel)
docker-compose.public.yml   compose overlay for the self-hosted public demo
```

Everything from `public-extras/` down is **public demo only** — none of it is
used by `docker compose up`, and the image you build from this repo is unchanged.

## 10. Updating

1. Replace files under `public/` with the new version.
2. `docker compose up -d --build`
3. Hard‑refresh the page (cache TTLs are only an hour, but a manual reload is
   instant).

## 11. The public demo (temporary)

For a short period the app is also hosted as a **public** demo so people can try
it without self‑hosting. It is deployed to **Cloudflare Pages** and serves the
**same `public/` tree** — the exact same app code — assembled by `build-pages.sh`,
which adds a listener script from `public-extras/`, renders `config.js` from the
environment, and sets a relaxed Content‑Security‑Policy via `pages/_headers`.
`public/` is never modified; `docker compose up` still builds the unchanged
`connect-src 'none'` image.

(`nginx/public.conf` + `docker-compose.public.yml` are an equivalent
**self‑hosted** public variant — a Cloudflare Tunnel in front of the container —
kept for reference. Neither is used by `docker compose up`.)

**The relaxed CSP** (set by `pages/_headers`) replaces `connect-src 'none'`
with a narrow allow‑list:

```
default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://cloudflareinsights.com; form-action 'none'; frame-ancestors 'none'; base-uri 'none'
```

Sentry gets no `connect-src` entry: envelopes go through the same‑origin `/st`
tunnel Function (`pages/functions/st.js`), which forwards them to Sentry
server‑side. This keeps the CSP tight and stops ad/privacy blockers from
dropping error reports. The self‑hosted `nginx/public.conf` variant instead
lists the Sentry ingest host directly (set `sentryTunnel: ""` in its
`config.js`).

**What the public demo collects:**

- **Cloudflare Web Analytics** — one page view per document load (the app is a
  hash router, so route changes are not extra page views), referrer, country,
  and Core Web Vitals. No cookies, no cross‑site identifier.
- **Sentry** (via the `/st` tunnel) — uncaught JavaScript errors (stack traces)
  plus, as breadcrumbs, the eight app events the app emits: `app_loaded`,
  `view_opened`, `export_selected`, `parse_succeeded`, `parse_failed`,
  `contacts_matched`, `data_exported`, `snapshot_saved`.
- **`/e`** — a Cloudflare Pages Function receives those same eight events and
  logs the query string (visible live via `wrangler pages deployment tail`).
  Nothing is stored. (The self‑hosted nginx variant instead logs `/e` to stdout,
  where promtail ships it to the operator's Loki/Grafana.)

**What it does NOT collect:** no usernames, no display names, no file names, no
counts beyond bucketed magnitudes (e.g. `1k-10k`), no cookies, and no visitor IP
in the operator's logs. The app itself still parses entirely in the browser; the
export contents never leave the machine.

**On "secrets".** The Sentry DSN and the Cloudflare beacon token are **public
values** — they are shipped to every browser that loads the page and are
designed to be public. They are not credentials. `build-pages.sh` renders them
into `dist/public-extras/config.js` from environment variables at build time;
`dist/` is gitignored, so nothing deployment‑specific lands in the repo.

**Temporary.** The public demo is short‑lived. Teardown: delete the Cloudflare
Pages project (and the Sentry project / Web Analytics site). The repo then
returns to its default `connect-src 'none'`‑only posture — no listener, no
analytics of any kind. `public/src/lib/emit.js` stays: it is a sinkless DOM
event bus with nothing in‑repo listening, and under `connect-src 'none'` nothing
could exfiltrate it.
