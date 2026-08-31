/**
 * ONE·WAY — sparkline. A single de-emphasised polyline, no axes, no tooltip.
 * Decorative: the number rendered beside it is the actual value, so the SVG is
 * `aria-hidden`. Never throws on empty / single-value input.
 *
 * @param {HTMLElement} el   container (emptied and owned by this mount)
 * @param {number[]} values
 * @param {{ height?: number, width?: number, strokeWidth?: number, showDot?: boolean }} [opts]
 * @returns {{ destroy(): void, update(values: number[]): void }}
 */
export function mountSparkline(el, values, opts = {}) {
  const SVG = 'http://www.w3.org/2000/svg';
  const height = Number.isFinite(opts.height) ? opts.height : 28;
  const width = Number.isFinite(opts.width) ? opts.width : 120;
  const sw = Number.isFinite(opts.strokeWidth) ? opts.strokeWidth : 1.5;
  const showDot = opts.showDot !== false;
  const pad = Math.ceil(sw) + 1;

  el.textContent = '';

  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'ow-sparkline');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('class', 'ow-sparkline__line');
  svg.appendChild(path);

  const dot = document.createElementNS(SVG, 'circle');
  dot.setAttribute('class', 'ow-sparkline__dot');
  dot.setAttribute('r', String(Math.max(1.5, sw)));
  if (showDot) svg.appendChild(dot);

  el.appendChild(svg);

  function draw(vals) {
    const data = Array.isArray(vals) ? vals.filter((n) => Number.isFinite(n)) : [];
    if (data.length === 0) {
      path.removeAttribute('d');
      dot.setAttribute('opacity', '0');
      return;
    }
    const min = Math.min(...data);
    const max = Math.max(...data);
    const span = max - min || 1;
    const innerW = width - pad * 2;
    const innerH = height - pad * 2;
    const x = (i) =>
      data.length === 1 ? width / 2 : pad + (i / (data.length - 1)) * innerW;
    const y = (v) => pad + innerH - ((v - min) / span) * innerH;

    let d = `M ${x(0).toFixed(2)} ${y(data[0]).toFixed(2)}`;
    for (let i = 1; i < data.length; i++) {
      d += ` L ${x(i).toFixed(2)} ${y(data[i]).toFixed(2)}`;
    }
    if (data.length === 1) d += ` L ${x(0).toFixed(2)} ${y(data[0]).toFixed(2)}`;
    path.setAttribute('d', d);

    dot.setAttribute('opacity', '1');
    dot.setAttribute('cx', x(data.length - 1).toFixed(2));
    dot.setAttribute('cy', y(data[data.length - 1]).toFixed(2));
  }

  draw(values);

  return {
    update(next) {
      draw(next);
    },
    destroy() {
      el.textContent = '';
    },
  };
}
