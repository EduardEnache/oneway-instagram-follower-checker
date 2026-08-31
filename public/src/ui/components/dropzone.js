/**
 * ONE·WAY — file dropzone.
 * Drag & drop, click to browse, and a separate "already-extracted folder" input.
 * Keyboard-activatable. Guards obvious wrong file types but stays permissive
 * (the parser owns the real validation).
 */

import { h } from '../../state/dom.js';

/**
 * @param {{
 *   onFiles: (input: File|File[]) => void,
 *   disabled?: boolean,
 * }} o
 * @returns {{ el: HTMLElement, setDisabled: (v:boolean) => void }}
 */
export function createDropzone(o) {
  const zipInput = h('input', {
    type: 'file',
    accept: '.zip,application/zip,application/x-zip-compressed',
    class: 'ow-visually-hidden',
    'aria-hidden': 'true',
    tabindex: '-1',
    onChange: (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) o.onFiles(f);
      e.target.value = '';
    },
  });

  const dirInput = h('input', {
    type: 'file',
    class: 'ow-visually-hidden',
    'aria-hidden': 'true',
    tabindex: '-1',
    webkitdirectory: '',
    multiple: '',
    onChange: (e) => {
      const list = e.target.files ? [...e.target.files] : [];
      if (list.length) o.onFiles(list);
      e.target.value = '';
    },
  });

  const inner = h(
    'div',
    { class: 'ow-dropzone__inner' },
    h('div', { class: 'ow-dropzone__mark', 'aria-hidden': 'true' }, '↓'),
    h('p', { class: 'ow-dropzone__title' }, 'Drop your Instagram export here'),
    h(
      'p',
      { class: 'ow-dropzone__hint' },
      'The ',
      h('code', {}, '.zip'),
      ' straight from Instagram, or the folder you already unzipped. It is read in this tab and never uploaded. Needs a recent Chrome, Firefox or Safari.',
    ),
    h(
      'div',
      { class: 'ow-dropzone__actions' },
      h(
        'button',
        { class: 'ow-btn ow-btn--primary', type: 'button', onClick: () => zipInput.click() },
        'Choose .zip file',
      ),
      h(
        'button',
        { class: 'ow-btn ow-btn--ghost', type: 'button', onClick: () => dirInput.click() },
        'Choose unzipped folder',
      ),
    ),
  );

  const el = h(
    'div',
    {
      class: 'ow-dropzone',
      role: 'button',
      tabindex: '0',
      'aria-label': 'Drop an Instagram export zip, or activate to browse for one',
    },
    inner,
    zipInput,
    dirInput,
  );

  let dragDepth = 0;
  const setDrag = (on) => el.classList.toggle('is-dragover', on);

  el.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragDepth++;
    setDrag(true);
  });
  el.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  });
  el.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) setDrag(false);
  });
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    setDrag(false);
    const dt = e.dataTransfer;
    if (!dt) return;
    const files = dt.files ? [...dt.files] : [];
    if (files.length === 0) return;
    if (files.length === 1) {
      o.onFiles(files[0]);
    } else {
      o.onFiles(files);
    }
  });

  el.addEventListener('keydown', (e) => {
    if (e.target !== el) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      zipInput.click();
    }
  });
  el.addEventListener('click', (e) => {
    if (e.target === el || e.target === inner) zipInput.click();
  });

  return {
    el,
    setDisabled(v) {
      el.setAttribute('aria-disabled', v ? 'true' : 'false');
      el.style.pointerEvents = v ? 'none' : '';
      el.style.opacity = v ? '0.55' : '';
    },
  };
}
