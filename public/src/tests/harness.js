/**
 * ONE·WAY — minimal browser test harness.
 *
 * No dependencies, no build. Both `parser.test.js` and `ui.test.js`
 * import { describe, it, expect, run } from here and call `run()` once.
 *
 * Usage in a test file:
 *   import { describe, it, expect } from './harness.js';
 *   describe('fixMojibake', () => {
 *     it('leaves ASCII untouched', () => { expect(fixMojibake('abc')).toBe('abc'); });
 *   });
 *
 * The page `tests/index.html` imports every *.test.js then calls `run()`.
 */

/** @type {{ name: string, fn: () => (void | Promise<void>), suite: string }[]} */
const QUEUE = [];
let CURRENT_SUITE = '(root)';

/**
 * @param {string} name
 * @param {() => void} body
 */
export function describe(name, body) {
  const prev = CURRENT_SUITE;
  CURRENT_SUITE = name;
  try {
    body();
  } finally {
    CURRENT_SUITE = prev;
  }
}

/**
 * @param {string} name
 * @param {() => (void | Promise<void>)} fn
 */
export function it(name, fn) {
  QUEUE.push({ name, fn, suite: CURRENT_SUITE });
}

/**
 * Tiny assertion wrapper. Supports the handful of matchers the suites need.
 * @param {*} actual
 */
export function expect(actual) {
  return {
    toBe(expected) {
      if (!Object.is(actual, expected)) {
        throw new Error(`expected ${fmt(actual)} to be ${fmt(expected)}`);
      }
    },
    toEqual(expected) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`expected ${fmt(actual)} to deep-equal ${fmt(expected)}`);
      }
    },
    toBeCloseTo(expected, digits = 2) {
      const tol = Math.pow(10, -digits) / 2;
      if (Math.abs(actual - expected) > tol) {
        throw new Error(`expected ${fmt(actual)} to be within ${tol} of ${fmt(expected)}`);
      }
    },
    toBeGreaterThan(expected) {
      if (!(actual > expected)) throw new Error(`expected ${fmt(actual)} > ${fmt(expected)}`);
    },
    toBeLessThan(expected) {
      if (!(actual < expected)) throw new Error(`expected ${fmt(actual)} < ${fmt(expected)}`);
    },
    toBeTruthy() {
      if (!actual) throw new Error(`expected ${fmt(actual)} to be truthy`);
    },
    toBeFalsy() {
      if (actual) throw new Error(`expected ${fmt(actual)} to be falsy`);
    },
    toContain(item) {
      const ok = typeof actual === 'string' ? actual.includes(item) : Array.isArray(actual) && actual.includes(item);
      if (!ok) throw new Error(`expected ${fmt(actual)} to contain ${fmt(item)}`);
    },
    toHaveLength(n) {
      if (!actual || actual.length !== n) {
        throw new Error(`expected length ${fmt(actual && actual.length)} to be ${n}`);
      }
    },
    async toThrow(codeOrMessage) {
      let threw = null;
      try {
        await (typeof actual === 'function' ? actual() : actual);
      } catch (e) {
        threw = e;
      }
      if (!threw) throw new Error('expected function to throw, it did not');
      if (codeOrMessage != null) {
        const hay = `${threw.code || ''} ${threw.message || ''}`;
        if (!hay.includes(codeOrMessage)) {
          throw new Error(`expected thrown ${fmt(hay)} to include ${fmt(codeOrMessage)}`);
        }
      }
    },
  };
}

function fmt(v) {
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'object' && v !== null) {
    try {
      return JSON.stringify(v).slice(0, 200);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

/**
 * Execute the queue. Renders into `#out` if present, always logs to console,
 * and sets `document.title` to a pass/fail summary for headless scraping.
 * @returns {Promise<{ passed: number, failed: number }>}
 */
export async function run() {
  const out = document.getElementById('out');
  let passed = 0;
  let failed = 0;
  for (const t of QUEUE) {
    const label = `${t.suite} › ${t.name}`;
    try {
      await t.fn();
      passed++;
      line(out, 'pass', label);
    } catch (e) {
      failed++;
      line(out, 'fail', `${label}\n    ${(e && e.stack) || e}`);
      // eslint-disable-next-line no-console
      console.error(label, e);
    }
  }
  const summary = `${failed === 0 ? 'PASS' : 'FAIL'} — ${passed} passed, ${failed} failed`;
  line(out, failed === 0 ? 'summary-ok' : 'summary-bad', summary);
  document.title = summary;
  return { passed, failed };
}

function line(out, cls, text) {
  // eslint-disable-next-line no-console
  console.log(`[${cls}] ${text}`);
  if (!out) return;
  const el = document.createElement('pre');
  el.className = `t-${cls}`;
  el.textContent = text;
  out.appendChild(el);
}
