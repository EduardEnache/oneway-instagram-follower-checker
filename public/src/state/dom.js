/**
 * ONE·WAY — tiny DOM helpers.
 *
 * No framework. `h()` is a hyperscript-ish element builder; `clear()` / `frag()` /
 * `mount()` are the few churn helpers the views need. Kept under `state/` because
 * that directory is explicitly B-owned and open-ended.
 */

/**
 * Build an element.
 * @param {string} tag
 * @param {Record<string, any>|null} [props]
 * @param {...(Node|string|number|null|false|Array<any>)} kids
 * @returns {HTMLElement}
 */
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') {
        for (const [prop, val] of Object.entries(v)) {
          if (val == null) continue;
          if (prop.startsWith('--')) el.style.setProperty(prop, String(val));
          else el.style[prop] = val;
        }
      } else if (k === 'style') {
        el.setAttribute('style', v);
      }
      else if (k === 'dataset' && typeof v === 'object') Object.assign(el.dataset, v);
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') {
        el.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') {
        // @ts-ignore — set as a property so form controls behave
        el[k] = v;
      } else {
        el.setAttribute(k, v === true ? '' : String(v));
      }
    }
  }
  append(el, kids);
  return el;
}

/**
 * Append a (possibly nested) list of children to a parent.
 * @param {Node} parent
 * @param {Array<any>} kids
 */
export function append(parent, kids) {
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false || kid === true) continue;
    parent.appendChild(kid && kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
}

/** @param {Node} el */
export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

/** @param {...any} kids */
export function frag(...kids) {
  const f = document.createDocumentFragment();
  append(f, kids);
  return f;
}

/**
 * Replace the contents of `host` with `node`.
 * @param {Element} host
 * @param {Node} node
 */
export function mount(host, node) {
  clear(host);
  host.appendChild(node);
  return host;
}

/** Debounce a function by `ms`. */
export function debounce(fn, ms) {
  let t = 0;
  const wrapped = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  wrapped.cancel = () => clearTimeout(t);
  return wrapped;
}

/** Read a numeric CSS custom property off :root, with a fallback. */
export function cssNumber(name, fallback) {
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const n = parseFloat(raw);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  } catch {
    return fallback;
  }
}

/** Focusable-element selector for focus traps. */
export const FOCUSABLE =
  'a[href],area[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
