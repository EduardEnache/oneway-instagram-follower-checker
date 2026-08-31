/**
 * ONE·WAY — growth chart. Cumulative STEPPED area, two series on one shared Y
 * axis (both are account counts):
 *   followers  — solid 2px --accent line + ~10% --accent area wash
 *   following  — 1px --fg-muted line, no fill
 *
 * Hover: a vertical crosshair snaps to the nearest month; a mono tooltip lists
 * both series (value leads, label follows). <=4 horizontal gridlines, NO
 * vertical gridlines. Colours come from CSS custom properties — a theme change
 * needs no colour recomputation (it still triggers a geometry redraw). SVG, so
 * crisp at any DPI. Never throws on empty / one-point series.
 *
 * @typedef {{ t: number, count: number, total: number }} SeriesPoint
 * @param {HTMLElement} el
 * @param {{ followers: SeriesPoint[], following: SeriesPoint[] }} data
 * @param {{
 *   height?: number,
 *   formatNumber?: (n: number) => string,
 *   formatDate?: (unixSeconds: number) => string,
 *   onHover?: (p: { t: number|null, followers: number|null, following: number|null }) => void,
 * }} [opts]
 * @returns {{ destroy(): void, update(data: { followers: SeriesPoint[], following: SeriesPoint[] }): void }}
 */
export function mountGrowthChart(el, data, opts = {}) {
  const SVGNS = 'http://www.w3.org/2000/svg';
  const H = Number.isFinite(opts.height) ? opts.height : 280;
  const M = { top: 12, right: 14, bottom: 24, left: 46 };
  const MONTH = 2592000;
  const fmtNum =
    typeof opts.formatNumber === 'function'
      ? opts.formatNumber
      : (n) => Math.round(n).toLocaleString();
  const fmtDate =
    typeof opts.formatDate === 'function'
      ? opts.formatDate
      : (s) => {
          const d = new Date(s * 1000);
          return d.toLocaleDateString(undefined, {
            month: 'short',
            year: 'numeric',
            timeZone: 'UTC',
          });
        };
  const onHover = typeof opts.onHover === 'function' ? opts.onHover : null;
  const reduceMotion =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let series = normalize(data);
  let width = 0;
  let buckets = []; // sorted unique t across both series (for snapping)
  let ro = null;
  let rafId = 0;

  // ---- DOM ----------------------------------------------------------------
  el.textContent = '';
  const root = document.createElement('div');
  root.className = 'ow-chart ow-chart--growth';

  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('class', 'ow-chart__svg');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('height', String(H));
  svg.setAttribute('role', 'img');
  svg.setAttribute('tabindex', '0');
  root.appendChild(svg);

  const gGrid = mk('g', 'ow-chart__grid');
  const gAxis = mk('g', 'ow-chart__axis');
  const areaF = mk('path', 'ow-chart__area ow-chart__area--followers');
  const lineG = mk('path', 'ow-chart__line ow-chart__line--following');
  const lineF = mk('path', 'ow-chart__line ow-chart__line--followers');
  const gHover = mk('g', 'ow-chart__hover');
  gHover.style.display = 'none';
  const crosshair = mk('line', 'ow-chart__crosshair');
  const dotG = mk('circle', 'ow-chart__dot ow-chart__dot--following');
  const dotF = mk('circle', 'ow-chart__dot ow-chart__dot--followers');
  dotG.setAttribute('r', '4');
  dotF.setAttribute('r', '4');
  gHover.append(crosshair, dotG, dotF);
  const hit = mk('rect', 'ow-chart__hit');
  svg.append(gGrid, gAxis, areaF, lineG, lineF, gHover, hit);

  const tooltip = document.createElement('div');
  tooltip.className = 'ow-chart__tooltip';
  root.appendChild(tooltip);

  const legend = document.createElement('div');
  legend.className = 'ow-chart__legend';
  legend.append(
    legendItem('followers', 'Followers'),
    legendItem('following', 'Following')
  );
  root.appendChild(legend);

  const empty = document.createElement('div');
  empty.className = 'ow-chart__empty';
  empty.hidden = true;
  root.appendChild(empty);

  el.appendChild(root);

  function mk(tag, cls) {
    const n = document.createElementNS(SVGNS, tag);
    n.setAttribute('class', cls);
    return n;
  }
  function legendItem(cls, label) {
    const span = document.createElement('span');
    span.className = 'ow-chart__legend-item';
    const sw = document.createElement('span');
    sw.className = `ow-chart__swatch ow-chart__swatch--${cls}`;
    const tx = document.createElement('span');
    tx.textContent = label;
    const b = document.createElement('b');
    b.dataset.role = cls;
    span.append(sw, tx, b);
    return span;
  }

  // ---- data prep --------------------------------------------------------
  function normalize(d) {
    const clean = (arr) =>
      (Array.isArray(arr) ? arr : [])
        .filter((p) => p && Number.isFinite(p.t) && Number.isFinite(p.total))
        .map((p) => ({ t: p.t, total: p.total }))
        .sort((a, b) => a.t - b.t);
    return { followers: clean(d && d.followers), following: clean(d && d.following) };
  }

  function niceScale(max, maxTicks) {
    if (!(max > 0)) return { top: 1, ticks: [0, 1] };
    const niceNum = (range, round) => {
      const exp = Math.floor(Math.log10(range));
      const f = range / 10 ** exp;
      let nf;
      if (round) nf = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
      else nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
      return nf * 10 ** exp;
    };
    const range = niceNum(max, false);
    const step = niceNum(range / Math.max(1, maxTicks - 1), true);
    const top = Math.ceil(max / step) * step;
    let ticks = [];
    for (let v = 0; v <= top + step * 0.5; v += step) ticks.push(Math.round(v));
    while (ticks.length > maxTicks) ticks = ticks.filter((_, i) => i % 2 === 0);
    if (ticks[ticks.length - 1] !== top) ticks.push(top);
    return { top, ticks };
  }

  function valueAt(points, t) {
    // step semantics: last point with point.t <= t
    let v = null;
    for (let i = 0; i < points.length; i++) {
      if (points[i].t <= t) v = points[i].total;
      else break;
    }
    return v;
  }

  // ---- draw -----------------------------------------------------------------
  function draw() {
    const all = series.followers.concat(series.following);
    if (all.length === 0) {
      svg.style.display = 'none';
      legend.style.display = 'none';
      empty.hidden = false;
      empty.textContent = 'No growth history in this export';
      svg.removeAttribute('aria-label');
      return;
    }
    svg.style.display = '';
    legend.style.display = '';
    empty.hidden = true;

    const W = Math.max(width || el.clientWidth || 320, 200);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', '100%');

    const x0 = M.left;
    const x1 = W - M.right;
    const y0 = H - M.bottom;
    const y1 = M.top;
    const plotW = Math.max(1, x1 - x0);
    const plotH = Math.max(1, y0 - y1);

    let minT = Math.min(...all.map((p) => p.t));
    let maxT = Math.max(...all.map((p) => p.t));
    if (minT === maxT) {
      minT -= MONTH;
      maxT += MONTH;
    }
    const maxV = Math.max(...all.map((p) => p.total), 1);
    const { top: niceTop, ticks } = niceScale(maxV, 4);

    const sx = (t) => x0 + ((t - minT) / (maxT - minT)) * plotW;
    const sy = (v) => y0 - (v / niceTop) * plotH;

    // gridlines (horizontal only)
    gGrid.textContent = '';
    gAxis.textContent = '';
    ticks.forEach((v) => {
      const gy = sy(v);
      const ln = document.createElementNS(SVGNS, 'line');
      ln.setAttribute('x1', x0);
      ln.setAttribute('x2', x1);
      ln.setAttribute('y1', gy);
      ln.setAttribute('y2', gy);
      gGrid.appendChild(ln);
      const tx = document.createElementNS(SVGNS, 'text');
      tx.setAttribute('x', x0 - 8);
      tx.setAttribute('y', gy + 3.5);
      tx.setAttribute('text-anchor', 'end');
      tx.textContent = fmtNum(v);
      gAxis.appendChild(tx);
    });

    // baseline
    const base = document.createElementNS(SVGNS, 'line');
    base.setAttribute('class', 'ow-chart__baseline');
    base.setAttribute('x1', x0);
    base.setAttribute('x2', x1);
    base.setAttribute('y1', y0);
    base.setAttribute('y2', y0);
    gAxis.appendChild(base);

    // x-axis: year ticks, thinned to <=6
    let years = [];
    const yStart = new Date(minT * 1000).getUTCFullYear();
    const yEnd = new Date(maxT * 1000).getUTCFullYear();
    for (let y = yStart; y <= yEnd; y++) {
      years.push(Date.UTC(y, 0, 1) / 1000);
    }
    if (years.length === 0) years = [minT, maxT];
    while (years.length > 6) years = years.filter((_, i) => i % 2 === 0);
    years.forEach((t) => {
      if (t < minT || t > maxT) return;
      const tx = document.createElementNS(SVGNS, 'text');
      tx.setAttribute('x', sx(t));
      tx.setAttribute('y', y0 + 15);
      tx.setAttribute('text-anchor', 'middle');
      tx.textContent = String(new Date(t * 1000).getUTCFullYear());
      gAxis.appendChild(tx);
    });

    // stepped paths
    const stepLine = (pts) => {
      if (pts.length === 0) return '';
      let d = `M ${sx(pts[0].t).toFixed(2)} ${sy(pts[0].total).toFixed(2)}`;
      for (let i = 1; i < pts.length; i++) {
        d += ` L ${sx(pts[i].t).toFixed(2)} ${sy(pts[i - 1].total).toFixed(2)}`;
        d += ` L ${sx(pts[i].t).toFixed(2)} ${sy(pts[i].total).toFixed(2)}`;
      }
      const last = pts[pts.length - 1];
      if (last.t < maxT) d += ` L ${sx(maxT).toFixed(2)} ${sy(last.total).toFixed(2)}`;
      return d;
    };

    const dF = stepLine(series.followers);
    const dG = stepLine(series.following);
    lineF.setAttribute('d', dF || '');
    lineG.setAttribute('d', dG || '');

    if (series.followers.length) {
      const first = series.followers[0];
      const last = series.followers[series.followers.length - 1];
      const rightX = (last.t < maxT ? sx(maxT) : sx(last.t)).toFixed(2);
      areaF.setAttribute(
        'd',
        `${dF} L ${rightX} ${sy(0).toFixed(2)} L ${sx(first.t).toFixed(2)} ${sy(0).toFixed(2)} Z`
      );
    } else {
      areaF.removeAttribute('d');
    }

    // hover geometry cache
    buckets = Array.from(new Set(all.map((p) => p.t))).sort((a, b) => a - b);
    crosshair.setAttribute('y1', y1);
    crosshair.setAttribute('y2', y0);
    hit.setAttribute('x', x0);
    hit.setAttribute('y', y1);
    hit.setAttribute('width', plotW);
    hit.setAttribute('height', plotH);

    // scales for the hover handler
    draw._sx = sx;
    draw._sy = sy;
    draw._minT = minT;
    draw._maxT = maxT;
    draw._x0 = x0;
    draw._x1 = x1;
    draw._W = W;

    // legend + aria totals
    const fLast = series.followers.length
      ? series.followers[series.followers.length - 1].total
      : 0;
    const gLast = series.following.length
      ? series.following[series.following.length - 1].total
      : 0;
    legend.querySelector('[data-role="followers"]').textContent = fmtNum(fLast);
    legend.querySelector('[data-role="following"]').textContent = fmtNum(gLast);
    svg.setAttribute(
      'aria-label',
      `Follower and following growth, ${yStart} to ${yEnd}. ` +
        `Followers ${fmtNum(fLast)}, following ${fmtNum(gLast)}.`
    );
  }

  // ---- hover --------------------------------------------------------------
  let hoverIdx = -1;

  function showAt(clientX) {
    if (!buckets.length || !draw._sx) return;
    const rect = svg.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * draw._W;
    const t =
      draw._minT +
      ((px - draw._x0) / (draw._x1 - draw._x0)) * (draw._maxT - draw._minT);
    let idx = 0;
    let best = Infinity;
    for (let i = 0; i < buckets.length; i++) {
      const dd = Math.abs(buckets[i] - t);
      if (dd < best) {
        best = dd;
        idx = i;
      }
    }
    renderHover(idx);
  }

  function renderHover(idx) {
    if (idx < 0 || idx >= buckets.length) return hideHover();
    hoverIdx = idx;
    const bt = buckets[idx];
    const fv = valueAt(series.followers, bt);
    const gv = valueAt(series.following, bt);
    const cx = draw._sx(bt);

    gHover.style.display = '';
    crosshair.setAttribute('x1', cx);
    crosshair.setAttribute('x2', cx);
    if (fv != null) {
      dotF.style.display = '';
      dotF.setAttribute('cx', cx);
      dotF.setAttribute('cy', draw._sy(fv));
    } else dotF.style.display = 'none';
    if (gv != null) {
      dotG.style.display = '';
      dotG.setAttribute('cx', cx);
      dotG.setAttribute('cy', draw._sy(gv));
    } else dotG.style.display = 'none';

    // tooltip
    tooltip.textContent = '';
    const dEl = document.createElement('div');
    dEl.className = 'ow-chart__tooltip-date';
    dEl.textContent = fmtDate(bt);
    tooltip.appendChild(dEl);
    tooltip.appendChild(tipRow('followers', 'Followers', fv));
    tooltip.appendChild(tipRow('following', 'Following', gv));
    tooltip.classList.add('is-visible');

    const flip = cx > draw._W - 160;
    tooltip.style.left = `${((flip ? cx - 12 : cx + 12) / draw._W) * 100}%`;
    tooltip.style.transform = flip ? 'translateX(-100%)' : 'none';
    tooltip.style.top = `${M.top}px`;

    if (onHover) onHover({ t: bt, followers: fv, following: gv });
  }

  function tipRow(cls, label, value) {
    const row = document.createElement('div');
    row.className = 'ow-chart__tooltip-row';
    const sw = document.createElement('span');
    sw.className = `ow-chart__swatch ow-chart__swatch--${cls}`;
    const tx = document.createElement('span');
    tx.textContent = label;
    const b = document.createElement('b');
    b.textContent = value == null ? '—' : fmtNum(value);
    row.append(sw, tx, b);
    return row;
  }

  function hideHover() {
    hoverIdx = -1;
    gHover.style.display = 'none';
    tooltip.classList.remove('is-visible');
    if (onHover) onHover({ t: null, followers: null, following: null });
  }

  const onMove = (e) => showAt(e.clientX);
  const onLeave = () => hideHover();
  const onKey = (e) => {
    if (!buckets.length) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const start = hoverIdx < 0 ? (e.key === 'ArrowRight' ? -1 : buckets.length) : hoverIdx;
      const next = Math.min(
        buckets.length - 1,
        Math.max(0, start + (e.key === 'ArrowRight' ? 1 : -1))
      );
      renderHover(next);
    } else if (e.key === 'Escape') {
      hideHover();
      svg.blur();
    }
  };

  hit.addEventListener('pointermove', onMove);
  hit.addEventListener('pointerdown', onMove);
  hit.addEventListener('pointerleave', onLeave);
  svg.addEventListener('keydown', onKey);
  svg.addEventListener('blur', onLeave);

  // ---- lifecycle --------------------------------------------------------
  function scheduleDraw() {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      width = el.clientWidth || width;
      draw();
    });
  }

  const onTheme = () => scheduleDraw();
  document.addEventListener('themechange', onTheme);

  if (typeof ResizeObserver === 'function') {
    ro = new ResizeObserver(() => scheduleDraw());
    ro.observe(el);
  } else if (typeof window !== 'undefined') {
    window.addEventListener('resize', scheduleDraw);
  }

  // initial paint (+ opt-in mount fade)
  width = el.clientWidth || 320;
  draw();
  if (!reduceMotion) {
    root.classList.add('is-mounting');
    requestAnimationFrame(() => root.classList.remove('is-mounting'));
  }

  return {
    update(next) {
      series = normalize(next);
      hideHover();
      scheduleDraw();
    },
    destroy() {
      if (rafId) cancelAnimationFrame(rafId);
      if (ro) ro.disconnect();
      else if (typeof window !== 'undefined')
        window.removeEventListener('resize', scheduleDraw);
      document.removeEventListener('themechange', onTheme);
      el.textContent = '';
    },
  };
}
