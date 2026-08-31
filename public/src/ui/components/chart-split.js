/**
 * ONE·WAY — split chart. One horizontal stacked bar:
 *   mutuals (--positive) · non-followers (--accent) · fans (--fg-muted)
 * plus a legend (swatch + label + count + percent) and a per-segment hover
 * tooltip. Colours come from CSS custom properties, so a theme change needs no
 * redraw. Never throws; total 0 renders a muted empty bar.
 *
 * @param {HTMLElement} el
 * @param {{ mutuals: number, nonFollowers: number, fans: number }} data
 * @param {{ height?: number, showLegend?: boolean, formatNumber?: (n:number)=>string }} [opts]
 * @returns {{ destroy(): void, update(data): void }}
 */
export function mountSplitChart(el, data, opts = {}) {
  const height = Number.isFinite(opts.height) ? opts.height : 40;
  const showLegend = opts.showLegend !== false;
  const fmt =
    typeof opts.formatNumber === 'function'
      ? opts.formatNumber
      : (n) => n.toLocaleString();

  const SEGMENTS = [
    { key: 'mutuals', label: 'Mutuals', cls: 'mutuals' },
    { key: 'nonFollowers', label: 'Non-followers', cls: 'nonfollowers' },
    { key: 'fans', label: 'Fans', cls: 'fans' },
  ];

  el.textContent = '';
  const root = document.createElement('div');
  root.className = 'ow-chart ow-chart--split';
  root.style.setProperty('--ow-split-h', `${height}px`);

  const bar = document.createElement('div');
  bar.className = 'ow-chart__bar';
  bar.setAttribute('role', 'img');
  root.appendChild(bar);

  const tooltip = document.createElement('div');
  tooltip.className = 'ow-chart__tooltip';
  root.appendChild(tooltip);

  let legend = null;
  if (showLegend) {
    legend = document.createElement('div');
    legend.className = 'ow-chart__legend';
    root.appendChild(legend);
  }

  el.appendChild(root);

  /** @type {HTMLElement[]} */
  const segEls = [];

  function showTip(seg, value, pct) {
    tooltip.textContent = '';
    const t = document.createElement('div');
    t.className = 'ow-chart__tooltip-row';
    const name = document.createElement('span');
    name.textContent = seg.label;
    const val = document.createElement('b');
    val.textContent = `${fmt(value)} · ${pct}%`;
    t.append(name, val);
    tooltip.appendChild(t);
    tooltip.classList.add('is-visible');
  }
  function hideTip() {
    tooltip.classList.remove('is-visible');
  }
  function moveTip(ev) {
    const r = root.getBoundingClientRect();
    const x = ev.clientX - r.left;
    tooltip.style.left = `${Math.min(Math.max(x, 8), r.width - 8)}px`;
    tooltip.style.top = `0px`;
    tooltip.style.transform = 'translate(-50%, calc(-100% - 6px))';
  }

  function render(d) {
    const vals = SEGMENTS.map((s) => Math.max(0, Number(d?.[s.key]) || 0));
    const total = vals.reduce((a, b) => a + b, 0);

    bar.textContent = '';
    segEls.length = 0;

    if (total === 0) {
      bar.setAttribute('aria-label', 'No relationship data');
      bar.title = 'No relationship data';
      if (legend) {
        legend.textContent = '';
        const note = document.createElement('span');
        note.className = 'ow-chart__legend-item';
        note.textContent = 'No relationship data';
        legend.appendChild(note);
      }
      return; // CSS paints the empty bar in --surface-2
    }

    bar.setAttribute(
      'aria-label',
      SEGMENTS.map(
        (s, i) => `${s.label} ${fmt(vals[i])} (${Math.round((vals[i] / total) * 100)}%)`
      ).join(', ')
    );

    SEGMENTS.forEach((s, i) => {
      if (vals[i] <= 0) return;
      const pct = (vals[i] / total) * 100;
      const seg = document.createElement('div');
      seg.className = `ow-chart__seg ow-chart__seg--${s.cls}`;
      seg.style.width = `${pct}%`;
      seg.tabIndex = 0;
      seg.setAttribute(
        'aria-label',
        `${s.label}: ${fmt(vals[i])}, ${pct.toFixed(1)} percent`
      );
      const roundedPct = pct < 1 ? pct.toFixed(1) : Math.round(pct);
      seg.addEventListener('pointerenter', () => showTip(s, vals[i], roundedPct));
      seg.addEventListener('pointermove', moveTip);
      seg.addEventListener('pointerleave', hideTip);
      seg.addEventListener('focus', () => {
        showTip(s, vals[i], roundedPct);
        const r = root.getBoundingClientRect();
        const sr = seg.getBoundingClientRect();
        tooltip.style.left = `${sr.left - r.left + sr.width / 2}px`;
        tooltip.style.top = '0px';
        tooltip.style.transform = 'translate(-50%, calc(-100% - 6px))';
      });
      seg.addEventListener('blur', hideTip);
      bar.appendChild(seg);
      segEls.push(seg);
    });

    if (legend) {
      legend.textContent = '';
      SEGMENTS.forEach((s, i) => {
        const item = document.createElement('span');
        item.className = 'ow-chart__legend-item';
        const sw = document.createElement('span');
        sw.className = `ow-chart__swatch ow-chart__swatch--${s.cls}`;
        const label = document.createElement('span');
        label.textContent = s.label;
        const b = document.createElement('b');
        const pct = Math.round((vals[i] / total) * 100);
        b.textContent = `${fmt(vals[i])} · ${pct}%`;
        item.append(sw, label, b);
        legend.appendChild(item);
      });
    }
  }

  render(data);

  return {
    update(next) {
      render(next);
    },
    destroy() {
      hideTip();
      el.textContent = '';
    },
  };
}
