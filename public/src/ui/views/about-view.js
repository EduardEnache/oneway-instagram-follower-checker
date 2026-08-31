/**
 * ONE·WAY — about / how-it-works.
 */

import { h } from '../../state/dom.js';
import { view, panel } from '../../state/ui-bits.js';

export function render({ store }) {
  const result = store.getResult();
  const root = view({
    title: 'About ONE·WAY',
    subtitle: 'A private reader for the follow graph inside your Instagram data export.',
    narrow: true,
  });

  root.appendChild(
    panel(
      { title: 'What this is' },
      h(
        'p',
        {},
        'ONE·WAY opens the ZIP that Instagram gives you when you request your data and works out the relationships it does not show you directly: who you follow that does not follow back, who follows you that you do not follow, your mutuals, pending requests, and the rest. It runs entirely in this browser tab.',
      ),
    ),
  );

  root.appendChild(
    panel(
      { title: 'The privacy model, and how to check it' },
      h(
        'ul',
        { style: { listStyle: 'disc', paddingLeft: '1.25rem', display: 'grid', gap: 'var(--sp-2)' } },
        h('li', {}, 'Your export is unzipped and parsed in the page. It is never sent anywhere. There is no server that could receive it.'),
        h(
          'li',
          {},
          'Open your browser’s developer tools, go to the Network tab, clear it, then load an export. You will see zero requests.',
        ),
        h(
          'li',
          {},
          'The page is served with a Content-Security-Policy of ',
          h('code', {}, "connect-src 'none'"),
          '. The browser itself blocks this page from making any network connection. Check it under the response headers for the page.',
        ),
        h('li', {}, 'Snapshots you save live in this browser’s localStorage only. Clearing site data deletes them.'),
      ),
    ),
  );

  root.appendChild(
    panel(
      { title: 'Known limitations' },
      h(
        'ul',
        { style: { listStyle: 'disc', paddingLeft: '1.25rem', display: 'grid', gap: 'var(--sp-2)' } },
        h(
          'li',
          {},
          h('strong', {}, 'Contact matching is approximate. '),
          'Matches between your address book and Instagram accounts are guesses from name similarity alone and are frequently wrong. They are labelled with a confidence level for that reason.',
        ),
        h(
          'li',
          {},
          h('strong', {}, 'Renames cannot be known for certain. '),
          'When a username disappears between two snapshots and another appears with the same follow timestamp, ONE·WAY guesses it is a rename. It can be wrong; it is shown as a guess, never a fact.',
        ),
        h(
          'li',
          {},
          h('strong', {}, 'Deactivated accounts look like unfollows. ',),
          'If someone deactivates, they leave your follower list and ONE·WAY cannot tell that apart from a deliberate unfollow.',
        ),
        h(
          'li',
          {},
          h('strong', {}, 'The export is a snapshot. '),
          'Everything here reflects the moment Instagram generated your download, not this moment.',
        ),
      ),
    ),
  );

  root.appendChild(
    panel(
      { title: 'Tests' },
      h(
        'p',
        {},
        'The unit suite runs in the browser with no build step: ',
        h('a', { href: '/src/tests/index.html', target: '_blank', rel: 'noopener noreferrer' }, '/src/tests/index.html'),
        '.',
      ),
    ),
  );

  if (result && result.meta) {
    root.appendChild(
      panel(
        { title: 'This session' },
        h(
          'div',
          { class: 'ow-stack', style: { '--gap': 'var(--sp-2)' } },
          kv('Source', result.meta.sourceName || 'unknown'),
          kv('Owner', result.meta.ownerUsername || 'unknown'),
          kv('Export date', result.meta.exportedAt ? new Date(result.meta.exportedAt * 1000).toISOString().slice(0, 10) : 'unknown'),
          kv('Files read', String((result.meta.filesFound || []).length)),
          kv('Parse notes', String((result.meta.warnings || []).length)),
          kv('Schema', String(result.meta.schemaVersion)),
        ),
      ),
    );
  }

  return root;
}

function kv(k, v) {
  return h('div', { class: 'ow-kv' }, h('span', { class: 'ow-kv__k ow-muted' }, k), h('span', { class: 'ow-kv__v ow-tnum' }, v));
}
