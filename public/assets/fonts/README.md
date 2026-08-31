# ONE·WAY — self-hosted webfonts

Three families, all **OFL 1.1** licensed, all shipped as **variable-weight
woff2** subset to **latin + latin-ext** (Romanian ș/ț/î/â/ă must round-trip — do
**not** re-subset to latin only). The `@font-face` block that wires these up
lives in [`public/styles/base.css`](../../styles/base.css); it is loaded via
`public/styles/index.css`.

| Family | Role | Files |
|---|---|---|
| Bricolage Grotesque (200–800) | display / headings | `bricolage-grotesque-latin.woff2`, `bricolage-grotesque-latin-ext.woff2` |
| Inter (100–900) | body / UI | `inter-latin.woff2`, `inter-latin-ext.woff2` |
| JetBrains Mono (100–800) | handles / counts / dates | `jetbrains-mono-latin.woff2`, `jetbrains-mono-latin-ext.woff2` |

The design degrades cleanly to system fonts (`ui-sans-serif` / `ui-monospace`)
if these files are ever missing — nothing breaks, it just looks less bespoke.

## Re-fetching the files

The six `.woff2` files are already committed. To refresh them (or if you are
rebuilding from scratch on the mini-PC), the Google Fonts `css2` API hands out
the exact subset URLs when queried with a browser User-Agent. Run this from
**this directory** (`public/assets/fonts/`):

```sh
UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

# --- Bricolage Grotesque (variable, opsz+wght) ---
curl -sS -A "$UA" 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,200..800&display=swap' -o /tmp/bricolage.css
# --- Inter (variable wght) ---
curl -sS -A "$UA" 'https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap' -o /tmp/inter.css
# --- JetBrains Mono (variable wght) ---
curl -sS -A "$UA" 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@100..800&display=swap' -o /tmp/jbmono.css

# In each CSS file, find the two @font-face blocks commented /* latin */ and
# /* latin-ext */ and download their src URLs. As of this writing they are:

curl -sS -o bricolage-grotesque-latin.woff2 \
  'https://fonts.gstatic.com/s/bricolagegrotesque/v9/3y9K6as8bTXq_nANBjzKo3IeZx8z6up5BeSl9D4dj_x9PpZBMlGIInE.woff2'
curl -sS -o bricolage-grotesque-latin-ext.woff2 \
  'https://fonts.gstatic.com/s/bricolagegrotesque/v9/3y9K6as8bTXq_nANBjzKo3IeZx8z6up5BeSl9D4dj_x9PpZBMlGGInHEVA.woff2'

curl -sS -o inter-latin.woff2 \
  'https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7.woff2'
curl -sS -o inter-latin-ext.woff2 \
  'https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa25L7SUc.woff2'

curl -sS -o jetbrains-mono-latin.woff2 \
  'https://fonts.gstatic.com/s/jetbrainsmono/v24/tDbV2o-flEEny0FZhsfKu5WU4xD7OwE.woff2'
curl -sS -o jetbrains-mono-latin-ext.woff2 \
  'https://fonts.gstatic.com/s/jetbrainsmono/v24/tDbV2o-flEEny0FZhsfKu5WU4xD1OwG_TA.woff2'
```

> The `gstatic.com` hashes change when Google republishes a font. If a direct
> URL 404s, re-run the `css2` query above and copy the fresh `/* latin */` and
> `/* latin-ext */` `src:` URLs out of the returned CSS. The `unicode-range`
> values in `base.css` match Google's own subset ranges and rarely change.

### Alternative sources (no Google)

- **Inter** — <https://github.com/rsms/inter/releases> → `Inter-*.var.woff2`
  (ships a full-unicode variable file; larger, but no subsetting step).
- **JetBrains Mono** — <https://github.com/JetBrains/JetBrainsMono/releases>.
- **Bricolage Grotesque** — <https://github.com/ateliertriay/bricolage/releases>
  or <https://fontsource.org/fonts/bricolage-grotesque>.

If you take a full-unicode file instead of the subset, drop the second
(`latin-ext`) `@font-face` for that family in `base.css` and remove the
`unicode-range` from the first so the one file serves everything.

## License

Bundle the upstream `OFL.txt` for each family alongside these files if you
redistribute. Source: Google Fonts / the project repos linked above. No
modifications were made beyond subsetting.
