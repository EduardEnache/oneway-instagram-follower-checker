# ONE·WAY — design system contract (styles layer → UI layer)

**Aesthetic:** *editorial data terminal* — a well-set broadsheet crossed with a
trading terminal. Hairline 1px rules do the structural work. No gradients
anywhere. One elevation shadow, on modals only. Radii: **2px** on interactive
controls, **0** on tables and panels. Every number in the UI is
`font-variant-numeric: tabular-nums`.

This document is the seam. Build against the `.ow-*` class contract and the JS
signatures below; the CSS that realises them lives in `public/styles/*` and the
JS in `public/src/ui/components/{theme,chart-growth,chart-split,sparkline}.js`.

---

## 0. Changes from the baseline contract (read this)

Names from the plan's baseline are kept. Additions and clarifications, all
additive (nothing removed, nothing renamed):

- **Grid utilities added:** `.ow-grid` (12-col) + `.ow-col-1 … .ow-col-12`
  (`grid-column: span N`), collapsing to one column below 720px. Used for the
  dashboard "two-up" block and any multi-column view body.
- **`.ow-brand`** added — the wordmark lock-up, used in both `.ow-sidebar` head
  and `.ow-topbar`.
- **`.ow-theme-toggle`** added — a 3-state segmented control
  (`light` / `dark` / `system`); it is an `.ow-btn-group` of `.ow-btn--icon`
  buttons with `[data-theme-value]` and `aria-pressed`.
- **Mobile nav:** the slide-over is `.ow-sidebar` itself, driven by
  `.ow-app.is-nav-open`. Added `.ow-sidebar__backdrop` (scrim) and
  `.ow-sidebar__close`.
- **Small additive elements:** `.ow-view__sub`, `.ow-view__tools`,
  `.ow-stat__spark`, `.ow-panel__foot`, `.ow-empty__actions`, `.ow-error__mark`,
  `.ow-error__title`, `.ow-field__hint`, `.ow-field__error`, `.ow-btn--icon`,
  `.ow-btn.is-loading`, `.ow-account__mark` (CSS monogram, no network),
  `.ow-table--pin-first` (pins the first column — the 375px requirement),
  `.ow-table__cell--num` / `--tight`, `.ow-chart--growth` / `--split`,
  `.ow-chart__empty`, `.ow-chart__swatch`, `.ow-sparkline`.
- **`--surface-2`** and a small set of derived tokens (`--accent-fg`, tints,
  `--shadow-modal`, `--focus`) are exported on `:root` — see §3.
- Charts **theme themselves through CSS custom properties** (no JS colour reads
  needed); they additionally redraw on the `themechange` event so geometry stays
  correct after a font swap.
- Also styled, to match names UI layer already shipped: `.ow-viewhost` (view
  mount host in `.ow-main` — `flex:1; min-width:0`), `.ow-modal__title` (aliased
  to the modal-head title style), `.ow-confidence__label`.

---

## 1. The exact `<head>` snippet for `index.html`

Paste verbatim into `<head>`, in this order. `theme-init.js` **must** come
before the stylesheet so `data-theme` is set before first paint (no FOUC, no
inline script → CSP stays `script-src 'self'`).

```html
<meta name="color-scheme" content="light dark" />
<meta name="theme-color" content="#F5F2EC" media="(prefers-color-scheme: light)" />
<meta name="theme-color" content="#100F12" media="(prefers-color-scheme: dark)" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />

<!-- 1. Sets <html data-theme> before first paint. Non-module, synchronous. -->
<script src="/theme-init.js"></script>

<!-- 2. Preload the latin webfonts used above the fold. latin-ext loads on demand. -->
<link rel="preload" href="/assets/fonts/bricolage-grotesque-latin.woff2" as="font" type="font/woff2" crossorigin />
<link rel="preload" href="/assets/fonts/inter-latin.woff2" as="font" type="font/woff2" crossorigin />
<link rel="preload" href="/assets/fonts/jetbrains-mono-latin.woff2" as="font" type="font/woff2" crossorigin />

<!-- 3. The single stylesheet. @imports tokens/base/layout/components/charts in order. -->
<link rel="stylesheet" href="/styles/index.css" />
```

Font files shipped (all self-hosted, OFL, variable-weight, subset latin +
latin-ext — Romanian ș/ț/î/â/ă round-trip):

| Family | latin | latin-ext |
|---|---|---|
| Bricolage Grotesque (200–800) | `bricolage-grotesque-latin.woff2` | `bricolage-grotesque-latin-ext.woff2` |
| Inter (100–900) | `inter-latin.woff2` | `inter-latin-ext.woff2` |
| JetBrains Mono (100–800) | `jetbrains-mono-latin.woff2` | `jetbrains-mono-latin-ext.woff2` |

The design is correct with zero webfonts loaded — every family has a real
fallback stack (`ui-sans-serif, system-ui, …` / `ui-monospace, …`).

---

## 2. The `.ow-*` class contract

Convention: **block** `.ow-x`, **element** `.ow-x__y`, **modifier** `.ow-x--m`
(combinatorial variant), **state** `.is-*` (runtime, toggled by B). `[hidden]`
is always honoured. Anything not listed here is B's to name — prefix it `.ow-`.

### 2.1 App frame

```
.ow-app                      grid shell. Children: .ow-sidebar, .ow-main.
  .is-nav-open               (mobile) slide-over open; also shows .ow-sidebar__backdrop.

.ow-sidebar                  persistent 240px left rail (desktop) / slide-over (<900px).
  .ow-sidebar__brand        top lock-up slot; contains .ow-brand.
  .ow-sidebar__close        icon button, visible only <900px.
  .ow-sidebar__scroll       the scrollable nav region (flex:1, overflow-y:auto).
  .ow-sidebar__group        one nav group (Overview / Relationships / Requests / Privacy / Discovery / Tools).
  .ow-sidebar__title        group heading (small, uppercase, tracked, --fg-muted).
  .ow-sidebar__link         <a>. Modifier state: .is-active (current route).
    .ow-sidebar__link-count optional trailing count (mono, --fg-muted).
  .ow-sidebar__foot         bottom slot (theme toggle, privacy badge).
.ow-sidebar__backdrop       fixed scrim behind the open slide-over. Click → B closes.

.ow-topbar                   sticky top bar, shown only <900px. Children below.
  .ow-topbar__menu          hamburger button (.ow-btn--icon). Toggles .ow-app.is-nav-open.
  .ow-topbar__brand         .ow-brand, centered.
  .ow-topbar__tools         right slot (theme toggle).

.ow-brand                    wordmark. Text "ONE·WAY" in --font-display, 600, tracked.
  .ow-brand__dot            the middle dot glyph, coloured --accent (optional span).

.ow-main                     scroll container for views. min-width:0.
.ow-view                     one route's content. max-width:var(--maxw); centered; padded.
  .ow-view--narrow          max-width:720px (about / single-column tools).
  .ow-view__head            flex row, wraps. Bottom hairline.
    .ow-view__title         <h1>, --font-display, --fs-4.
    .ow-view__sub           one muted line under the title.
    .ow-view__tools         right-aligned actions slot.
```

### 2.2 Stat strip (dashboard header — NOT cards)

```
.ow-stat-strip               row of 5 .ow-stat, separated by vertical hairlines. No card, no shadow.
  .ow-stat                   one figure.
    .ow-stat__label          sentence-case label, --fs-0, --fg-muted. No trailing colon.
    .ow-stat__value          the number. --font-mono, --fs-6, weight 500, tracking -0.03em, tabular.
    .ow-stat__delta          optional signed change vs a named period. Modifiers:
      .is-up                 rendered --positive, with a ▲ mark (::before).
      .is-down               rendered --negative, with a ▼ mark.
      .is-flat               rendered --fg-muted.
    .ow-stat__spark          optional slot for a sparkline (mountSparkline target).
```

Below 900px the strip wraps to 2-up, then 1-up below 560px; hairlines flip to
horizontal automatically.

### 2.3 Panel (a titled region — flat, hairline border, radius 0)

```
.ow-panel
  .ow-panel__head            flex row: title left, tools right. Bottom hairline.
    .ow-panel__title         --font-display, --fs-2.
    .ow-panel__tools         actions / toggles.
  .ow-panel__body            content. Default padding var(--sp-4); add .ow-panel__body--flush for tables/charts.
  .ow-panel__foot            optional; top hairline; muted, --fs-0.
.ow-panel--bleed             removes the body padding and the side borders (full-bleed growth chart).
```

### 2.4 Toolbar (sticky list-view controls)

```
.ow-toolbar                  sticky (top:0) flex row, wraps, bottom hairline, --surface bg.
  .ow-toolbar__search        wraps an .ow-input[type=search]; grows.
  .ow-toolbar__sort          wraps an .ow-select.
  .ow-toolbar__count         results count. B sets aria-live="polite" aria-atomic="true". Mono, tabular, --fg-muted.
  .ow-toolbar__actions       right-aligned button cluster (export, etc.).
```

### 2.5 Table (real `<table>`, sticky `<thead>`)

```
.ow-table__scroll            overflow-x:auto wrapper. REQUIRED around every .ow-table.
.ow-table                    width:100%; border-collapse:collapse. Row height = var(--row-h).
  .ow-table--pin-first       pins the first cell of every row (sticky left) — 375px usability.
  .ow-table__head            <thead>. position:sticky; top:0 (or below .ow-toolbar). --surface-2 bg, bottom hairline.
  .ow-table__row             <tr>. States: .is-selected (accent left-border + tint), .is-hover.
  .ow-table__cell            <td>/<th>. Vertical hairline between columns is bottom-only per row.
    .ow-table__cell--num     right-aligned, mono, tabular (for counts / dates).
    .ow-table__cell--tight   narrow padding (checkboxes, icons).
  .ow-table__sort            <button> inside a <th>. States: .is-asc, .is-desc (chevron via ::after).
```

Virtualisation (tbody windowing) is B's concern; C guarantees a fixed row height
via `--row-h` and that `.ow-table__head` stays put.

### 2.6 Account (identity cell / block)

```
.ow-account                  flex row, gap. Used in the name column and in diff lists.
  .ow-account__mark          optional CSS monogram tile (initials). No network, no <img>.
  .ow-account__name          primary label. Falls back to displayUsername when name is null.
  .ow-account__handle        @handle. --font-mono, --fg-muted.
  .ow-account__meta          trailing muted line (follow date, source list). --fs-0.
  .ow-account__link          <a target="_blank" rel="noopener noreferrer">. Ghost affordance; ↗ via ::after.
```

### 2.7 Controls

```
.ow-btn                      base button. radius 2px. Modifiers (combine freely):
  .ow-btn--primary           accent fill, --accent-fg text.
  .ow-btn--ghost             transparent, hairline border, --fg text.
  .ow-btn--danger            --negative text + border; fills on hover.
  .ow-btn--sm                compact.
  .ow-btn--icon              square, icon-only. B supplies an accessible name (aria-label).
  .is-loading                shows a spinner mark, disables pointer events, keeps width.
.ow-btn-group                segmented cluster; children are .ow-btn, hairlines shared, radius on ends only.

.ow-input                    text/search/number input. Hairline, radius 2px, --surface bg.
.ow-select                   native <select>, same chrome, custom chevron.
.ow-checkbox                 wraps <input type=checkbox> + label text. 16px box, 2px radius, accent when checked.
.ow-field                    vertical group.
  .ow-field__label           label. --fs-0, --fg-muted.
  .ow-field__hint            helper line under the control. --fs-0, --fg-muted.
  .ow-field__error           error line. --negative. B toggles with .is-invalid on .ow-field.
.ow-theme-toggle             .ow-btn-group of 3 .ow-btn--icon, [data-theme-value="light|dark|system"], aria-pressed.
```

### 2.8 Feedback

```
.ow-badge                    inline status pill (subtle tint + hairline + coloured text). tabular. Modifiers:
  .ow-badge--accent  --positive  --negative  --neutral
.ow-chip                     removable filter token; optional .ow-chip__x button.

.ow-empty                    centered empty state.
  .ow-empty__mark            large typographic mark (a glyph/number, NOT an SVG cartoon). --font-display, --fg-muted.
  .ow-empty__title           --font-display, --fs-2.
  .ow-empty__body            one or two muted lines.
  .ow-empty__actions         optional button cluster.

.ow-skeleton                 shimmer block. Respects prefers-reduced-motion (falls back to a static tint).
  .ow-skeleton__line         one line; width via inline style or .ow-skeleton__line--{sm,md,lg}.

.ow-error                    accent-bordered error region (left 2px --accent border).
  .ow-error__mark            typographic mark (e.g. "!"). --font-display.
  .ow-error__title           --font-display, --fs-2.
  .ow-error__msg             the real message, rendered verbatim (textContent). --font-mono, --fs-0, wraps.
  .ow-error__actions         must include a "Start over" .ow-btn.

.ow-progress                 determinate bar. B sets role="progressbar" + aria-valuenow/min/max.
  .ow-progress__bar          the fill (width:%). --accent. No transition under reduced motion.
  .ow-progress__label        optional caption (phase text). --fs-0, --fg-muted, mono.

.ow-banner                   full-width notice, hairline, radius 0. Modifiers: --warn, --info.
                             (Non-dismissible variant is just a banner with no close button.)
.ow-toast-stack              position:fixed; bottom-right (top-center <560px); z-index tokened.
  .ow-toast                  one toast. Modifiers: --info, --success, --error.
    .ow-toast__msg           text.
    .ow-toast__close         icon button.
```

### 2.9 Overlay

```
.ow-modal                    the dialog wrapper. B sets role="dialog" aria-modal="true".
  .ow-modal__backdrop        fixed scrim. Click → B closes (unless .ow-modal--blocking).
  .ow-modal__panel          --surface, hairline, radius 2px, --shadow-modal (the ONLY shadow in the system).
  .ow-modal__head           title row + close button. Bottom hairline.
  .ow-modal__body           scrolls if tall (max-height clamps).
  .ow-modal__foot           right-aligned button row. Top hairline.
.ow-modal--blocking          backdrop click does nothing (destructive confirms).
```

### 2.10 Dropzone

```
.ow-dropzone                 the file drop target. Dashed hairline (the one place a dashed border is allowed).
  .is-dragover               accent border + accent tint bg.
  .is-busy                   parsing; pair with an .ow-progress inside.
  .ow-dropzone__inner        centered stack.
  .ow-dropzone__mark         large typographic mark (↓). --font-display, --fg-muted.
  .ow-dropzone__title        --font-display, --fs-2.
  .ow-dropzone__hint         muted line ("or choose a folder…", browser-support note).
  .ow-dropzone__actions      button cluster (the visible <label for> file inputs).
```

### 2.11 Contacts (matching UI)

```
.ow-confidence               wrapper: label + bar.
  .ow-confidence__bar        the track (--surface-2, radius 2px, height ~6px).
  .ow-confidence__fill       width:% of score. Modifiers set colour + a minimum width:
    .is-high                 --positive.
    .is-medium               --accent.
    .is-low                  --fg-muted.
.ow-reasons                  flex-wrap list.
  .ow-reason                 one reason token (chip-like, --fs-0, mono, --fg-muted).
```

### 2.12 Charts (C mounts these; B supplies the empty container + calls the fn)

```
.ow-chart                    position:relative wrapper C creates inside `el`. Modifiers C adds:
  .ow-chart--growth  .ow-chart--split
  .is-mounting               present for one frame after mount (drives the opt-in fade-in).
  .ow-chart__svg             the <svg> (growth, sparkline). width:100%; height set by opts.
  .ow-chart__bar             (split) the stacked track.
  .ow-chart__seg             (split) one segment; 2px --surface separators.
  .ow-chart__tooltip         absolutely-positioned HTML readout. Hidden until hover/focus. --font-mono.
  .ow-chart__crosshair       (growth) the vertical hairline <line>.
  .ow-chart__legend          flex row.
  .ow-chart__legend-item     swatch + label + optional value.
  .ow-chart__swatch          8px mark. Modifiers: --followers (--accent), --following (--fg-muted),
                             --mutuals (--positive), --nonfollowers (--accent), --fans (--fg-muted).
  .ow-chart__empty           the no-data fallback (typographic, same family as .ow-empty__mark).
.ow-sparkline                the sparkline <svg>. aria-hidden by default (the adjacent number is the value).
```

### 2.13 Misc + utilities

```
.ow-privacy-badge            "100% in your browser — verify in DevTools" affordance. Hairline, mono, --fs-0.
                             Optional .ow-privacy-badge__dot (a --positive status dot).
.ow-kv                       definition grid. .ow-kv__k (--fg-muted) / .ow-kv__v (--fg, mono for values).

.ow-tnum                     font-variant-numeric: tabular-nums.
.ow-muted                    color: var(--fg-muted).
.ow-visually-hidden          screen-reader-only (standard clip pattern).
.ow-cluster                  flex; row; wrap; align-items:center; gap: var(--gap, var(--sp-2)).
.ow-stack                    flex; column; gap: var(--gap, var(--sp-3)).
.ow-grid                     display:grid; grid-template-columns:repeat(12,minmax(0,1fr)); gap:var(--sp-4).
.ow-col-1 … .ow-col-12       grid-column: span N. Below 720px every .ow-col-* spans all 12.
```

### 2.14 `data-*` and ARIA hooks B owns

| Hook | Where | Meaning |
|---|---|---|
| `data-theme` | `<html>` | set by `theme-init.js` / `theme.js`. `"light"`, `"dark"`, or **absent** (= system). Never write it yourself. |
| `data-theme-value` | `.ow-theme-toggle` buttons | `"light" \| "dark" \| "system"`. |
| `aria-live="polite"` | `.ow-toolbar__count` | B adds it; C styles the element to not shift when it updates. |
| `aria-current="page"` | `.ow-sidebar__link.is-active` | B adds it. |
| `role="progressbar"` + `aria-valuenow` | `.ow-progress` | B adds it. |
| `hidden` | anything | always respected (`[hidden]{display:none!important}` in base.css). |
| `--ow-toolbar-h` | `.ow-table__head`'s scroll ancestor (or the table) | when a `.ow-toolbar` sits above a `.ow-table` in the same scroll area, set this to the toolbar's measured height (e.g. `style="--ow-toolbar-h:57px"`) so the sticky `<thead>` parks below it. Defaults to `0px`. |
| `--gap` | `.ow-cluster` / `.ow-stack` | override the default gap, e.g. `style="--gap:var(--sp-4)"`. |

`.ow-view__head` children are `order`ed (title 1, tools 2, sub 3) so DOM order
is free. `.ow-progress` expects `[label?, bar]` children only — the track is
drawn by CSS (`::before`); `.ow-progress__bar` is the fill, set `style="width:NN%"`.

---

## 3. CSS custom properties (defined on `:root` in `tokens.css`)

All are safe to read in B's code and in chart JS. Colours are OKLCH with a hex
fallback declaration.

### Colour (semantic — never re-mapped per view)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#F5F2EC` | `#100F12` | page background (also set on `body`) |
| `--surface` | `#FFFDF9` | `#17161A` | panels, inputs, sticky bars |
| `--surface-2` | `#EDE8DC` | `#201F24` | table head, row hover, meter tracks |
| `--fg` | `#16150F` | `#EDEAE1` | body text |
| `--fg-muted` | `#6B675C` | `#9A958A` | secondary text, axes, **fans / following** series |
| `--rule` | `#DCD6C9` | `#2A282F` | every hairline border & gridline |
| `--accent` | `#C8461A` | `#FF6A38` | **non-followers**, primary buttons, focus |
| `--accent-fg` | `#FFFDF9` | `#100F12` | text/icon on an `--accent` fill (differs per theme for contrast) |
| `--positive` | `#2C6B57` | `#4FA98B` | **mutuals**, gains, "up" deltas |
| `--negative` | `#9B2C2C` | `#E06C6C` | **lost / unfollowed**, "down" deltas |
| `--focus` | `= --accent` | `= --accent` | `:focus-visible` ring |

Fixed semantic mapping for the relationship views and charts:
**mutuals → `--positive`, non-followers → `--accent`, fans → neutral
(`--fg-muted`), lost/unfollowed → `--negative`.** Do not remap these anywhere.

Derived (also on `:root`, themed):

| Token | Meaning |
|---|---|
| `--tint-accent` / `--tint-positive` / `--tint-negative` / `--tint-neutral` | ~10–12% wash of the colour over `--surface`; badge/segment/selected-row backgrounds |
| `--shadow-modal` | the single elevation shadow; applied only to `.ow-modal__panel` |
| `--z-nav` `--z-sticky` `--z-slideover` `--z-modal` `--z-toast` | `20 / 30 / 40 / 50 / 60` |

### Spacing (4px base — no arbitrary px in `components.css`)

`--sp-1:4px` `--sp-2:8px` `--sp-3:12px` `--sp-4:16px` `--sp-5:24px`
`--sp-6:32px` `--sp-7:48px` `--sp-8:64px` `--sp-9:96px`

### Typography

| Token | Value |
|---|---|
| `--font-display` | `'Bricolage Grotesque', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif` |
| `--font-ui` | `'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif` |
| `--font-mono` | `'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace` |

Sizes (1.25 scale from 16px): `--fs-0:0.8125rem`(13) `--fs-1:1rem`(16)
`--fs-2:1.25rem`(20) `--fs-3:1.5625rem`(25) `--fs-4:1.9375rem`(31)
`--fs-5:2.4375rem`(39) `--fs-6:3.0625rem`(49).
Line-height: 1.5 body, 1.15 display.

### Geometry

| Token | Value | Use |
|---|---|---|
| `--radius-sm` | `2px` | buttons, inputs, chips, badges, modal panel, chart bar |
| `--row-h` | `44px` | table row height (virtualisation depends on it) |
| `--maxw` | `1400px` | `.ow-view` max width |
| `--sidebar-w` | `240px` | left rail width |
| `--dur` / `--ease` | `160ms` / `cubic-bezier(0.32, 0.72, 0, 1)` | the only transition curve; both zeroed under reduced motion |

---

## 4. JS component signatures

All four modules are plain ES modules under
`public/src/ui/components/`. They never throw on empty input. They read colour
from CSS custom properties (so a `themechange` needs no colour recomputation);
they still listen for `themechange` and redraw geometry. Charts are SVG/HTML —
crisp at any DPI with no canvas scaling.

### `theme.js`

```js
export function initTheme(): {
  get(): 'light' | 'dark' | 'system',
  set(mode: 'light' | 'dark' | 'system'): void,   // persists to localStorage['oneway.theme']
  toggle(): void,                                  // cycles light → dark → system → light
}
```

- On `set`/`toggle`: writes `<html data-theme>` (`light`/`dark`, or removes it
  for `system`), sets `document.documentElement.style.colorScheme`, and
  dispatches `new CustomEvent('themechange', { detail: { mode, resolved } })`
  on `document` (`resolved` is always `'light'` or `'dark'`).
- In `system` mode it follows OS changes live (via `matchMedia`) and re-emits
  `themechange`.
- Call once from `app-shell.js`. Wire the returned object to `.ow-theme-toggle`
  (`set(btn.dataset.themeValue)`); reflect `get()` onto the buttons' `aria-pressed`
  on every `themechange`.

`theme-init.js` (already in `<head>`, non-module) does the pre-paint pass so the
first render is themed. `initTheme()` is idempotent with it.

### `chart-growth.js`

```js
export function mountGrowthChart(
  el: HTMLElement,
  data: { followers: SeriesPoint[], following: SeriesPoint[] },
  opts?: {
    height?: number,                    // default 280 (px, plot area incl. axes)
    formatNumber?: (n: number) => string,   // default toLocaleString
    formatDate?: (unixSeconds: number) => string, // default UTC "Mon YYYY"
    onHover?: (p: { t: number|null, followers: number|null, following: number|null }) => void,
  }
): { destroy(): void, update(data): void }
```

- Cumulative **stepped area**, two series sharing one Y axis (both are account
  counts): **followers** = solid `--accent` line + ~10% `--accent` area wash;
  **following** = 1px `--fg-muted` line, no fill.
- Hover: vertical `.ow-chart__crosshair` snapping to the nearest month; `.ow-chart__tooltip`
  (mono) lists the date and both series (value leads, label follows, line-key
  swatches). End-dots ≥8px with a 2px `--surface` ring. Keyboard: the `<svg>` is
  focusable; ←/→ move the cursor, Esc/blur clears.
- Axes: ≤4 Y ticks rounded to clean numbers, horizontal gridlines only —
  **no vertical gridlines**. X ticks are year labels, thinned to ≤6.
- A `.ow-chart__legend` is always rendered (2 series).
- `ResizeObserver` redraws on width change; `themechange` triggers a redraw.
- Empty series → `.ow-chart__empty` ("No growth history in this export"), no
  SVG. One point → a flat baseline + single dot. Never throws.

### `chart-split.js`

```js
export function mountSplitChart(
  el: HTMLElement,
  data: { mutuals: number, nonFollowers: number, fans: number },
  opts?: { height?: number, showLegend?: boolean, formatNumber?: fn }  // height default 40
): { destroy(): void, update(data): void }
```

- One horizontal stacked bar: **mutuals** (`--positive`) · **non-followers**
  (`--accent`) · **fans** (`--fg-muted`), in that order, 2px `--surface`
  separators, radius 2px on the ends only.
- `.ow-chart__legend` (unless `showLegend:false`) with swatch + label + count +
  percent, all in text tokens. Per-segment hover tooltip (`category · N · %`).
- `role="img"` with an `aria-label` summary. Total 0 → muted empty bar + note.

### `sparkline.js`

```js
export function mountSparkline(
  el: HTMLElement,
  values: number[],
  opts?: { height?: number, width?: number, strokeWidth?: number, showDot?: boolean }
  // height 28, width fluid, strokeWidth 1.5, showDot true
): { destroy(): void, update(values: number[]): void }
```

- Single `--fg-muted` polyline, optional `--accent` end-dot, no axes, no
  tooltip, `aria-hidden="true"` (decorative; the number beside it is the value).
- 0 / 1 value → an empty or flat render. Never throws.

---

## 5. Preview

```
# from repo root
python3 -m http.server 8000 --directory public
# open http://localhost:8000/?mock=1   (the UI layer's shell, once wired)
```

C's own visual check harness (not committed to `public/`) renders every `.ow-*`
component and all three charts against `public/src/fixtures/mock-analysis.json`
in both themes. Grep proof of the no-gradient rule: `grep -ri gradient public/styles` → 0 hits.
