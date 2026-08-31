/**
 * ONE·WAY — small structural helpers shared across views.
 */

import { h } from './dom.js';

/**
 * @param {{ title:string, subtitle?:string, actions?:Node[], narrow?:boolean }} o
 * @param {...any} kids
 * @returns {HTMLElement}
 */
export function view(o, ...kids) {
  return h(
    'div',
    { class: 'ow-view' + (o.narrow ? ' ow-view--narrow' : '') },
    h(
      'header',
      { class: 'ow-view__head' },
      h(
        'div',
        {},
        h('h1', { class: 'ow-view__title' }, o.title),
        o.subtitle ? h('p', { class: 'ow-view__sub ow-muted' }, o.subtitle) : null,
      ),
      o.actions && o.actions.length ? h('div', { class: 'ow-view__tools' }, ...o.actions) : null,
    ),
    ...kids,
  );
}

/**
 * @param {{ title?:string, tools?:Node[], flush?:boolean, bleed?:boolean, foot?:Node }} o
 * @param {...any} kids
 */
export function panel(o, ...kids) {
  return h(
    'section',
    { class: 'ow-panel' + (o.bleed ? ' ow-panel--bleed' : '') },
    o.title || (o.tools && o.tools.length)
      ? h(
          'div',
          { class: 'ow-panel__head' },
          o.title ? h('h2', { class: 'ow-panel__title' }, o.title) : h('span'),
          o.tools && o.tools.length ? h('div', { class: 'ow-panel__tools' }, ...o.tools) : null,
        )
      : null,
    h('div', { class: 'ow-panel__body' + (o.flush ? ' ow-panel__body--flush' : '') }, ...kids),
    o.foot ? h('div', { class: 'ow-panel__foot' }, o.foot) : null,
  );
}

/**
 * A banner. When `messages` is given, renders a <details> that expands to them.
 * @param {{
 *   kind?: 'warn'|'info',
 *   text: string,
 *   messages?: string[],
 *   dismissable?: boolean,
 * }} o
 */
export function banner(o) {
  const { kind = 'info', text, messages, dismissable = false } = o;
  const root = h('div', { class: `ow-banner ow-banner--${kind}`, role: kind === 'warn' ? 'alert' : 'status' });

  const row = h(
    'div',
    { class: 'ow-cluster', style: { justifyContent: 'space-between', width: '100%', alignItems: 'flex-start' } },
    h('span', {}, text),
    dismissable
      ? h(
          'button',
          {
            class: 'ow-btn ow-btn--icon ow-btn--sm',
            type: 'button',
            'aria-label': 'Dismiss',
            onClick: () => root.remove(),
          },
          h('span', { 'aria-hidden': 'true' }, '✕'),
        )
      : null,
  );
  root.appendChild(row);

  if (messages && messages.length) {
    root.appendChild(
      h(
        'details',
        { style: { marginTop: 'var(--sp-2)' } },
        h('summary', { style: { cursor: 'pointer' } }, `${messages.length} ${messages.length === 1 ? 'note' : 'notes'}`),
        h(
          'ul',
          { style: { listStyle: 'disc', paddingLeft: '1.25rem', marginTop: 'var(--sp-2)' } },
          ...messages.map((m) => h('li', {}, m)),
        ),
      ),
    );
  }
  return root;
}

/**
 * Determinate progress bar.
 * @param {{ pct:number, label?:string }} o
 */
export function progress(o) {
  const pct = Math.max(0, Math.min(100, Math.round(o.pct || 0)));
  return h(
    'div',
    { class: 'ow-stack', style: { '--gap': 'var(--sp-2)' } },
    h(
      'div',
      {
        class: 'ow-progress',
        role: 'progressbar',
        'aria-valuemin': '0',
        'aria-valuemax': '100',
        'aria-valuenow': String(pct),
        'aria-label': o.label || 'Progress',
      },
      h('div', { class: 'ow-progress__bar', style: { width: `${pct}%` } }),
    ),
    o.label ? h('p', { class: 'ow-progress__label' }, o.label) : null,
  );
}

/**
 * @param {{ message:string, title?:string, mark?:string, actions?:Node[] }} o
 */
export function errorBox(o) {
  return h(
    'div',
    { class: 'ow-error', role: 'alert' },
    h('span', { class: 'ow-error__mark', 'aria-hidden': 'true' }, o.mark || '!'),
    h('p', { class: 'ow-error__title' }, o.title || 'That did not work'),
    h('p', { class: 'ow-error__msg' }, o.message),
    o.actions && o.actions.length ? h('div', { class: 'ow-error__actions ow-cluster' }, ...o.actions) : null,
  );
}
