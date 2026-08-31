/**
 * ONE·WAY — UI-layer unit suite.
 * Runs in the browser via tests/index.html. DOM-touching tests use detached nodes.
 */

import { describe, it, expect } from './harness.js';

import { csvField, csvFromObjects } from '../export/csv.js';
import { accountMatchesQuery, comparators, filterAndSort } from '../state/accounts.js';
import { parseHash } from '../router.js';
import { windowRange } from '../ui/components/data-table.js';
import { parseErrorMessage } from '../state/parse-errors.js';

// ---------------------------------------------------------------------------
describe('csv.js — RFC 4180 + BOM', () => {
  it('prepends a UTF-8 BOM', () => {
    const out = csvFromObjects([{ a: '1' }], [{ key: 'a', header: 'a' }]);
    expect(out.charCodeAt(0)).toBe(0xfeff);
  });

  it('quotes a field with comma, quote and emoji; doubles interior quotes', () => {
    const field = csvField('He said "hi", 🙂');
    expect(field).toBe('"He said ""hi"", 🙂"');
  });

  it('leaves a plain field unquoted', () => {
    expect(csvField('plain')).toBe('plain');
  });

  it('uses CRLF between records', () => {
    const out = csvFromObjects(
      [{ n: 'a' }, { n: 'b' }],
      [{ key: 'n', header: 'name' }],
    );
    // BOM + "name" CRLF "a" CRLF "b" CRLF
    expect(out).toBe('﻿name\r\na\r\nb\r\n');
  });

  it('quotes a value that itself contains a newline', () => {
    expect(csvField('line1\nline2')).toBe('"line1\nline2"');
  });
});

// ---------------------------------------------------------------------------
describe('accounts.js — search predicate', () => {
  const acc = { username: 'ionut.pop_9x', displayUsername: 'Ionut.Pop_9x', name: 'Ionuț Pop', timestamp: 1 };

  it('empty query matches everything', () => {
    expect(accountMatchesQuery(acc, '')).toBe(true);
  });
  it('matches on a name substring (case-insensitive input pre-lowered by caller)', () => {
    expect(accountMatchesQuery(acc, 'pop')).toBe(true);
  });
  it('matches on a handle substring', () => {
    expect(accountMatchesQuery(acc, 'ionut.pop')).toBe(true);
  });
  it('matches with a leading @', () => {
    expect(accountMatchesQuery(acc, '@ionut')).toBe(true);
  });
  it('rejects a non-match', () => {
    expect(accountMatchesQuery(acc, 'zzz')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe('accounts.js — the four sort comparators', () => {
  const A = { username: 'aaa', displayUsername: 'aaa', name: 'Anna', timestamp: 100 };
  const B = { username: 'bbb', displayUsername: 'bbb', name: 'Bob', timestamp: 300 };
  const C = { username: 'ccc', displayUsername: 'ccc', name: 'Cara', timestamp: null };

  it('az sorts by label ascending', () => {
    const r = [B, C, A].slice().sort(comparators.az).map((x) => x.username);
    expect(r).toEqual(['aaa', 'bbb', 'ccc']);
  });
  it('za sorts by label descending', () => {
    const r = [A, B, C].slice().sort(comparators.za).map((x) => x.username);
    expect(r).toEqual(['ccc', 'bbb', 'aaa']);
  });
  it('newest: highest timestamp first, null bucket last', () => {
    const r = [A, C, B].slice().sort(comparators.newest).map((x) => x.username);
    expect(r).toEqual(['bbb', 'aaa', 'ccc']);
  });
  it('oldest: lowest timestamp first, null bucket STILL last', () => {
    const r = [B, C, A].slice().sort(comparators.oldest).map((x) => x.username);
    expect(r).toEqual(['aaa', 'bbb', 'ccc']);
  });
  it('two null timestamps tie-break on username ascending', () => {
    const n1 = { username: 'zeb', displayUsername: 'zeb', name: 'Zeb', timestamp: null };
    const n2 = { username: 'ada', displayUsername: 'ada', name: 'Ada', timestamp: null };
    const r = [n1, n2].slice().sort(comparators.newest).map((x) => x.username);
    expect(r).toEqual(['ada', 'zeb']);
  });
  it('filterAndSort filters then orders', () => {
    const r = filterAndSort([A, B, C], 'a', 'az').map((x) => x.username);
    // "a" matches Anna, Cara (name), not Bob
    expect(r).toEqual(['aaa', 'ccc']);
  });
});

// ---------------------------------------------------------------------------
describe('router.js — hash parsing', () => {
  it('parses #/list/nonFollowers', () => {
    const r = parseHash('#/list/nonFollowers');
    expect(r.name).toBe('list');
    expect(r.params.listId).toBe('nonFollowers');
    expect(r.params.valid).toBe('1');
  });
  it('flags an unknown list id as not valid', () => {
    const r = parseHash('#/list/bogus');
    expect(r.name).toBe('list');
    expect(r.params.valid).toBe('');
  });
  it('empty hash is the landing route', () => {
    expect(parseHash('').name).toBe('landing');
    expect(parseHash('#/').name).toBe('landing');
  });
  it('parses the simple routes', () => {
    expect(parseHash('#/dashboard').name).toBe('dashboard');
    expect(parseHash('#/contacts').name).toBe('contacts');
    expect(parseHash('#/snapshots').name).toBe('snapshots');
    expect(parseHash('#/about').name).toBe('about');
  });
  it('ignores a query string after the path', () => {
    expect(parseHash('#/dashboard?x=1').name).toBe('dashboard');
  });
  it('unknown path is notfound', () => {
    expect(parseHash('#/nope').name).toBe('notfound');
  });
});

// ---------------------------------------------------------------------------
describe('data-table.js — virtualization window math', () => {
  it('at scrollTop 0 the window starts at 0 with no top pad', () => {
    const w = windowRange({ scrollTop: 0, rowHeight: 44, viewportHeight: 440, total: 5000, overscan: 6 });
    expect(w.first).toBe(0);
    expect(w.topPad).toBe(0);
    expect(w.last).toBe(22); // ceil(440/44)=10 + 12 overscan
  });
  it('mid-scroll computes first from scrollTop/rowHeight minus overscan', () => {
    const w = windowRange({ scrollTop: 4400, rowHeight: 44, viewportHeight: 440, total: 5000, overscan: 6 });
    expect(w.first).toBe(94); // floor(4400/44)=100 - 6
    expect(w.topPad).toBe(94 * 44);
    expect(w.botPad).toBe((5000 - w.last) * 44);
  });
  it('clamps last to total and floors botPad at 0 near the end', () => {
    const w = windowRange({ scrollTop: 10_000_000, rowHeight: 44, viewportHeight: 440, total: 300 });
    expect(w.last).toBe(300);
    expect(w.botPad).toBe(0);
  });
  it('total 0 yields an empty window', () => {
    const w = windowRange({ scrollTop: 0, rowHeight: 44, viewportHeight: 440, total: 0 });
    expect(w).toEqual({ first: 0, last: 0, topPad: 0, botPad: 0 });
  });
});

// ---------------------------------------------------------------------------
describe('parse-errors.js — ParseError → user message', () => {
  it('maps a ParseError-shaped object by code', () => {
    const msg = parseErrorMessage({ name: 'ParseError', code: 'no-connections-folder', message: 'raw' });
    expect(msg).toContain('followers_and_following');
  });
  it('maps a bare code string', () => {
    expect(parseErrorMessage('not-a-zip')).toContain('readable ZIP');
  });
  it('falls back to the raw message for an unknown code', () => {
    expect(parseErrorMessage({ code: 'weird', message: 'the raw thing' })).toBe('the raw thing');
  });
  it('has a final generic fallback', () => {
    expect(parseErrorMessage({ code: 'weird' })).toContain('went wrong');
  });
});

// ---------------------------------------------------------------------------
describe('dom.js h() — detached node smoke test', () => {
  it('builds an element with class, attrs, listeners and children', async () => {
    const { h } = await import('../state/dom.js');
    let clicked = 0;
    const el = h('button', { class: 'x', 'data-k': 'v', onClick: () => clicked++ }, 'hi');
    expect(el.className).toBe('x');
    expect(el.getAttribute('data-k')).toBe('v');
    expect(el.textContent).toBe('hi');
    el.click();
    expect(clicked).toBe(1);
  });
});
