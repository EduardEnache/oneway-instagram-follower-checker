/**
 * ONE·WAY — transient toasts.
 * One polite live region, auto-dismiss, explicit close button.
 */

import { h } from '../../state/dom.js';

let stack = null;

function ensureStack() {
  if (stack && stack.isConnected) return stack;
  stack = h('div', { class: 'ow-toast-stack', role: 'status', 'aria-live': 'polite' });
  document.body.appendChild(stack);
  return stack;
}

/**
 * @param {string} message
 * @param {'info'|'success'|'error'} [kind]
 * @param {number} [ms]  0 disables auto-dismiss
 * @returns {() => void} dismiss
 */
export function toast(message, kind = 'info', ms = 4200) {
  let dismissed = false;
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    el.remove();
  };
  const el = h(
    'div',
    { class: `ow-toast ow-toast--${kind}` },
    h('span', { class: 'ow-toast__msg' }, message),
    h(
      'button',
      { class: 'ow-toast__close ow-btn ow-btn--icon ow-btn--sm', type: 'button', 'aria-label': 'Dismiss', onClick: dismiss },
      h('span', { 'aria-hidden': 'true' }, '✕'),
    ),
  );
  ensureStack().appendChild(el);
  if (ms > 0) setTimeout(dismiss, ms);
  return dismiss;
}
