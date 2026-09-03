/**
 * ONE·WAY — the single store.
 *
 * Holds one immutable `AnalysisResult` plus derived UI state. Subscribers are
 * notified on any change. Lightweight UI prefs persist under
 * localStorage['oneway.ui'].
 *
 * Data source:
 *   - `?mock=1` in the URL  → fetch fixtures/mock-analysis.json
 *   - otherwise             → wait for a file via the landing dropzone
 *     (at integration this "no file yet" branch is the real flow; the mock
 *      branch stays as the permanent dev / screenshot path)
 */

import mockAnalysis from '../fixtures/mock-analysis.js';
import { emitAppEvent, bucket } from '../emit.js';

/** @typedef {import('../contracts/types.js').AnalysisResult} AnalysisResult */
/** @typedef {import('../contracts/types.js').ContactMatch} ContactMatch */

const UI_KEY = 'oneway.ui';

const DEFAULT_PREFS = {
  lastRoute: '#/dashboard',
  density: 'comfortable', // 'comfortable' | 'compact'
  listSort: /** @type {Record<string,string>} */ ({}), // listId → sort key
  contactConfidence: 'high',
};

function loadPrefs() {
  try {
    const raw = localStorage.getItem(UI_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_PREFS, ...parsed, listSort: { ...(parsed.listSort || {}) } };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

function savePrefs(prefs) {
  try {
    localStorage.setItem(UI_KEY, JSON.stringify(prefs));
  } catch {
    /* private mode / quota — prefs are best-effort */
  }
}

function createStore() {
  /** @type {AnalysisResult|null} */
  let result = null;
  /** @type {Set<() => void>} */
  const subs = new Set();
  let prefs = loadPrefs();

  /** @type {{ status:'idle'|'parsing'|'error'|'done', progress:{phase:string,pct:number,message:string}|null, error:{code:string,message:string}|null }} */
  let parse = { status: 'idle', progress: null, error: null };

  /** @type {{ status:'idle'|'loading'|'done'|'error'|'unavailable', pct:number, error:string|null, matches:ContactMatch[]|null }} */
  let contacts = { status: 'idle', pct: 0, error: null, matches: null };
  /** @type {AbortController|null} */
  let contactAbort = null;

  const emit = () => {
    for (const fn of subs) {
      try {
        fn();
      } catch (e) {
        console.error('store subscriber threw', e);
      }
    }
  };

  return {
    // ---- lifecycle -------------------------------------------------------
    init() {
      const useMock = new URLSearchParams(location.search).has('mock');
      if (useMock) this.loadMock();
    },

    loadMock() {
      // CSP `connect-src 'none'` forbids fetch() even for same-origin files, so
      // the fixture is imported as an ES module, not fetched.
      try {
        result = Object.freeze(/** @type {AnalysisResult} */ (mockAnalysis));
        parse = { status: 'done', progress: null, error: null };
        emit();
      } catch (e) {
        parse = { status: 'error', progress: null, error: { code: 'fixture-missing', message: String((e && e.message) || e) } };
        emit();
      }
    },

    // ---- real file flow (used pre- and post-integration) ---------------
    /**
     * @param {File|FileList|File[]} input
     */
    async setResultFromFile(input) {
      emitAppEvent('export_selected', {
        kind:
          typeof File !== 'undefined' && input instanceof File
            ? 'zip'
            : Array.isArray(input) || (typeof FileList !== 'undefined' && input instanceof FileList)
              ? 'folder'
              : 'other',
      });
      const startedAt = Date.now();
      parse = { status: 'parsing', progress: { phase: 'start', pct: 0, message: 'Opening export…' }, error: null };
      emit();
      const ac = new AbortController();
      this._parseAbort = ac;
      try {
        const mod = await import('../lib/pipeline.js').catch((e) => {
          const err = new Error('The analyzer module is not available yet.');
          // @ts-ignore
          err.code = 'unavailable';
          throw err;
        });
        const next = await mod.analyzeExport(input, {
          signal: ac.signal,
          onProgress: (p) => {
            parse = { status: 'parsing', progress: p, error: null };
            emit();
          },
        });
        result = Object.freeze(next);
        contacts = { status: 'idle', pct: 0, error: null, matches: null };
        parse = { status: 'done', progress: null, error: null };
        emit();
        const stats = (next && next.stats) || {};
        emitAppEvent('parse_succeeded', {
          ms: Math.round((Date.now() - startedAt) / 100) * 100,
          size: bucket((stats.followerCount || 0) + (stats.followingCount || 0)),
        });
      } catch (e) {
        const code = (e && e.code) || 'not-a-zip';
        parse = { status: 'error', progress: null, error: { code, message: String((e && e.message) || e) } };
        emit();
        // A user-cancelled parse ('aborted') is not a failure — don't report it.
        if (code !== 'aborted') emitAppEvent('parse_failed', { code });
      }
    },

    cancelParse() {
      if (this._parseAbort) this._parseAbort.abort();
    },

    resetParse() {
      parse = { status: 'idle', progress: null, error: null };
      emit();
    },

    // ---- contact matching (lazy) --------------------------------------
    async getContactMatches() {
      if (contacts.status === 'done') return contacts.matches;
      if (contacts.status === 'loading') return null;
      if (!result) return null;
      const startedAt = Date.now();
      contactAbort = new AbortController();
      contacts = { status: 'loading', pct: 0, error: null, matches: null };
      emit();
      try {
        const mod = await import('../lib/pipeline.js').catch(() => {
          const err = new Error('Contact matching is not available yet.');
          // @ts-ignore
          err.code = 'unavailable';
          throw err;
        });
        if (typeof mod.matchContacts !== 'function') {
          const err = new Error('Contact matching is not available yet.');
          // @ts-ignore
          err.code = 'unavailable';
          throw err;
        }
        const matches = await mod.matchContacts(result, {
          signal: contactAbort.signal,
          onProgress: (pct) => {
            contacts = { ...contacts, pct: typeof pct === 'number' ? pct : contacts.pct };
            emit();
          },
        });
        contacts = { status: 'done', pct: 100, error: null, matches: matches || [] };
        emit();
        emitAppEvent('contacts_matched', {
          status: 'ok',
          ms: Math.round((Date.now() - startedAt) / 100) * 100,
        });
        return contacts.matches;
      } catch (e) {
        const code = (e && e.code) || 'error';
        contacts = {
          status: code === 'unavailable' ? 'unavailable' : 'error',
          pct: 0,
          error: String((e && e.message) || e),
          matches: null,
        };
        emit();
        // A user-cancelled match ('aborted') is not a failure — don't report it.
        if (code !== 'aborted') {
          emitAppEvent('contacts_matched', {
            status: 'error',
            ms: Math.round((Date.now() - startedAt) / 100) * 100,
          });
        }
        return null;
      }
    },

    cancelContactMatches() {
      if (contactAbort) contactAbort.abort();
      contacts = { status: 'idle', pct: 0, error: null, matches: null };
      emit();
    },

    getContactState() {
      return contacts;
    },

    // ---- reads -------------------------------------------------------
    getResult() {
      return result;
    },
    getParseState() {
      return parse;
    },
    hasData() {
      return result != null;
    },

    // ---- prefs -----------------------------------------------------
    getPrefs() {
      return prefs;
    },
    setPref(key, value) {
      prefs = { ...prefs, [key]: value };
      savePrefs(prefs);
    },
    setListSort(listId, sortKey) {
      prefs = { ...prefs, listSort: { ...prefs.listSort, [listId]: sortKey } };
      savePrefs(prefs);
    },

    // ---- subscription --------------------------------------------
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },

    /** test / integration seam */
    _setResultForTest(r) {
      result = r ? Object.freeze(r) : null;
      emit();
    },
  };
}

export const store = createStore();
