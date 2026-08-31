/**
 * ONE·WAY — focus-trapped modal dialog.
 * role="dialog", aria-modal, Esc closes, focus returns to the opener.
 */

import { h, clear, append, FOCUSABLE } from '../../state/dom.js';

/**
 * @typedef {Object} ModalOptions
 * @property {string} title
 * @property {Node|string|Array<Node|string>} body
 * @property {Array<{ label:string, kind?:'primary'|'ghost'|'danger', value?:any, autofocus?:boolean }>} [actions]
 * @property {boolean} [dismissable=true]  backdrop click / Esc close
 */

/**
 * Open a modal. Resolves with the clicked action's `value` (or `null` if
 * dismissed).
 * @param {ModalOptions} opts
 * @returns {{ el: HTMLElement, close: (value?:any) => void, result: Promise<any> }}
 */
export function openModal(opts) {
  const { title, body, actions = [{ label: 'Close', kind: 'ghost', value: null }], dismissable = true } = opts;
  const opener = /** @type {HTMLElement|null} */ (document.activeElement);

  let resolveResult;
  const result = new Promise((res) => (resolveResult = res));

  const titleId = `ow-modal-title-${Math.random().toString(36).slice(2, 8)}`;

  const bodyEl = h('div', { class: 'ow-modal__body' });
  append(bodyEl, [body]);

  const footEl = h('div', { class: 'ow-modal__foot' });
  const panel = h(
    'div',
    { class: 'ow-modal__panel' },
    h(
      'div',
      { class: 'ow-modal__head' },
      h('h2', { class: 'ow-modal__title', id: titleId }, title),
      h('button', {
        class: 'ow-btn ow-btn--ghost ow-btn--sm',
        type: 'button',
        'aria-label': 'Close dialog',
        onClick: () => close(null),
      }, '✕'),
    ),
    bodyEl,
    footEl,
  );

  // Positioning lives in components.css: .ow-modal centres, .ow-modal__backdrop
  // dims below the panel, .ow-modal__panel is raised above it.
  const backdrop = h('div', {
    class: 'ow-modal__backdrop',
    'aria-hidden': 'true',
    onClick: () => dismissable && close(null),
  });
  const root = h(
    'div',
    {
      class: 'ow-modal' + (dismissable ? '' : ' ow-modal--blocking'),
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': titleId,
    },
    backdrop,
    panel,
  );

  /** @type {HTMLButtonElement|null} */
  let autofocusBtn = null;
  for (const a of actions) {
    const btn = h(
      'button',
      {
        class: `ow-btn ow-btn--${a.kind || 'ghost'}`,
        type: 'button',
        onClick: () => close(a.value === undefined ? a.label : a.value),
      },
      a.label,
    );
    if (a.autofocus) autofocusBtn = btn;
    footEl.appendChild(btn);
  }

  function onKey(e) {
    if (e.key === 'Escape' && dismissable) {
      e.preventDefault();
      close(null);
      return;
    }
    if (e.key === 'Tab') {
      const nodes = /** @type {HTMLElement[]} */ ([...panel.querySelectorAll(FOCUSABLE)]).filter(
        (n) => n.offsetParent !== null || n === document.activeElement,
      );
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  function close(value) {
    document.removeEventListener('keydown', onKey, true);
    root.remove();
    document.documentElement.style.removeProperty('overflow');
    if (opener && typeof opener.focus === 'function') opener.focus();
    resolveResult(value);
  }

  document.addEventListener('keydown', onKey, true);
  document.documentElement.style.overflow = 'hidden';
  document.body.appendChild(root);

  const target =
    autofocusBtn ||
    /** @type {HTMLElement} */ (panel.querySelector(FOCUSABLE)) ||
    panel;
  requestAnimationFrame(() => target && target.focus());

  return { el: root, close, result };
}

/**
 * Confirm dialog helper.
 * @param {{ title:string, message:string, confirmLabel?:string, cancelLabel?:string, danger?:boolean }} o
 * @returns {Promise<boolean>}
 */
export async function confirmModal(o) {
  const { title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false } = o;
  const { result } = openModal({
    title,
    body: h('p', { class: 'ow-muted' }, message),
    actions: [
      { label: cancelLabel, kind: 'ghost', value: false },
      { label: confirmLabel, kind: danger ? 'danger' : 'primary', value: true, autofocus: true },
    ],
  });
  return (await result) === true;
}

/**
 * Single-line text prompt dialog.
 * @param {{ title:string, label:string, value?:string, confirmLabel?:string, placeholder?:string }} o
 * @returns {Promise<string|null>}
 */
export async function promptModal(o) {
  const { title, label, value = '', confirmLabel = 'Save', placeholder = '' } = o;
  const inputId = `ow-prompt-${Math.random().toString(36).slice(2, 8)}`;
  const input = h('input', {
    class: 'ow-input',
    id: inputId,
    name: 'label',
    type: 'text',
    value,
    placeholder: placeholder ? (placeholder.endsWith('…') ? placeholder : placeholder + '…') : '',
    autocomplete: 'off',
  });
  const field = h(
    'div',
    { class: 'ow-field' },
    h('label', { class: 'ow-field__label', for: inputId }, label),
    input,
  );
  const { result, close } = openModal({
    title,
    body: field,
    actions: [
      { label: 'Cancel', kind: 'ghost', value: null },
      { label: confirmLabel, kind: 'primary', value: '__ok__' },
    ],
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      close('__ok__');
    }
  });
  requestAnimationFrame(() => {
    input.focus();
    input.select();
  });
  const r = await result;
  return r === '__ok__' ? input.value.trim() : null;
}
