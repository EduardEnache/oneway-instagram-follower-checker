/**
 * ONE·WAY — landing / load-your-export view.
 */

import { h, clear } from '../../state/dom.js';
import { createDropzone } from '../components/dropzone.js';
import { progress, errorBox, panel } from '../../state/ui-bits.js';
import { parseErrorMessage } from '../../state/parse-errors.js';

/**
 * @param {{ store: import('../../state/store.js').store, navigate:(h:string)=>void }} ctx
 */
export function render({ store, navigate }) {
  const root = h('div', { class: 'ow-view ow-view--narrow' });
  const slot = h('div', {});

  const dz = createDropzone({ onFiles: (input) => store.setResultFromFile(input) });

  function paint() {
    const ps = store.getParseState();
    clear(slot);

    if (ps.status === 'parsing') {
      const p = ps.progress || { pct: 0, message: 'Working…' };
      slot.appendChild(
        h(
          'div',
          { class: 'ow-dropzone is-busy' },
          h(
            'div',
            { class: 'ow-dropzone__inner' },
            h('p', { class: 'ow-dropzone__title' }, p.message || 'Reading your export…'),
            progress({ pct: p.pct, label: `${Math.round(p.pct || 0)}%, ${p.phase || 'working'}` }),
            h(
              'button',
              { class: 'ow-btn ow-btn--ghost ow-btn--sm', type: 'button', onClick: () => store.cancelParse() },
              'Cancel',
            ),
          ),
        ),
      );
      return;
    }

    if (ps.status === 'error') {
      const code = ps.error?.code || 'not-a-zip';
      const msg = parseErrorMessage(ps.error || code);
      slot.appendChild(
        errorBox({
          title: 'Could not read that export',
          message: msg,
          actions: [
            h('button', { class: 'ow-btn ow-btn--primary', type: 'button', onClick: () => store.resetParse() }, 'Start over'),
            code === 'unavailable'
              ? h('a', { class: 'ow-btn ow-btn--ghost', href: '?mock=1#/dashboard' }, 'Open sample data')
              : null,
          ],
        }),
      );
      return;
    }

    slot.appendChild(dz.el);
  }

  const unsub = store.subscribe(paint);
  const mo = new MutationObserver(() => {
    if (!root.isConnected) {
      unsub();
      mo.disconnect();
    }
  });
  queueMicrotask(() => root.parentNode && mo.observe(root.parentNode, { childList: true }));

  root.append(
    h(
      'header',
      { class: 'ow-view__head' },
      h(
        'div',
        {},
        h('h1', { class: 'ow-view__title' }, 'Your Instagram follow graph, read in this browser'),
        h(
          'p',
          { class: 'ow-view__sub' },
          'Who you follow that does not follow back, and every other relationship the app hides from you.',
        ),
      ),
    ),
    slot,
    h(
      'p',
      { class: 'ow-privacy-badge' },
      h('span', { class: 'ow-privacy-badge__dot', 'aria-hidden': 'true' }),
      'Runs entirely in this tab. No upload, no account. ',
      h('a', { href: '#/about' }, 'How to verify'),
    ),
    panel(
      { title: 'Getting your export from Instagram' },
      h(
        'ol',
        { style: { listStyle: 'decimal', paddingLeft: '1.4rem', display: 'grid', gap: 'var(--sp-2)' } },
        h('li', {}, 'Accounts Centre → Your information and permissions → Download your information.'),
        h('li', {}, 'Choose “Some of your information”, then tick Followers and following (add Contacts for name matching).'),
        h('li', {}, 'Set the format to JSON, request it, and wait for the email.'),
        h('li', {}, 'Drop the .zip here as-is. No need to unzip it first.'),
      ),
    ),
    h(
      'p',
      { class: 'ow-muted', style: { marginTop: 'var(--sp-5)' } },
      'Just looking around? ',
      h('a', { href: '?mock=1#/dashboard' }, 'Explore with sample data'),
      '. Scrambled names, real shape.',
    ),
  );

  paint();
  return root;
}
