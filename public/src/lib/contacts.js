/**
 * ONE·WAY — fuzzy contact -> account matching.
 *
 * Owned by parser layer. O(contacts x candidates) so it is kept out of
 * `analyzeExport` and run lazily, cooperatively (chunked with `setTimeout(0)`
 * yields), honouring `opts.signal`.
 *
 * Every match is a GUESS from name similarity alone. Phone numbers are never
 * copied into the output.
 *
 * @typedef {import('../contracts/types.js').Account} Account
 * @typedef {import('../contracts/types.js').Contact} Contact
 * @typedef {import('../contracts/types.js').ContactMatch} ContactMatch
 * @typedef {import('../contracts/types.js').AnalysisResult} AnalysisResult
 */

import { normalizeName } from './decode.js';
import { ParseError } from './parse.js';

const CHUNK = 200;

/**
 * @param {AnalysisResult} result
 * @param {{ minScore?: number, maxPerContact?: number,
 *           onProgress?: (pct: number) => void, signal?: AbortSignal }} [opts]
 * @returns {Promise<ContactMatch[]>}
 */
export async function matchContacts(result, opts = {}) {
  const minScore = opts.minScore == null ? 0.55 : opts.minScore;
  const maxPerContact = opts.maxPerContact == null ? 3 : opts.maxPerContact;
  const { onProgress, signal } = opts;

  checkAbort(signal);

  const index = buildIndex(result);
  const contacts = result.contacts || [];
  /** @type {ContactMatch[]} */
  const out = [];

  for (let i = 0; i < contacts.length; i++) {
    const contact = contacts[i];
    if (contact.fullName !== '') {
      const matches = scoreContact(contact, index, minScore, maxPerContact);
      for (const m of matches) out.push(m);
    }

    if ((i + 1) % CHUNK === 0) {
      checkAbort(signal);
      if (onProgress) onProgress(Math.round(((i + 1) / Math.max(1, contacts.length)) * 100));
      await new Promise((r) => setTimeout(r));
    }
  }

  if (onProgress) onProgress(100);
  out.sort((a, b) => b.score - a.score || cmp(a.contactId, b.contactId) || cmp(a.account.username, b.account.username));
  return out;
}

// ---------------------------------------------------------------------------

/**
 * Inverted token -> Set<entry> index over followers ∪ following.
 * @param {AnalysisResult} result
 */
function buildIndex(result) {
  const followerSet = new Set(result.lists.followers.map((a) => a.username));
  const followingSet = new Set(result.lists.following.map((a) => a.username));

  /** @type {Map<string, any>} */
  const byUsername = new Map();
  const consider = (account) => {
    if (byUsername.has(account.username)) return;
    const inF = followerSet.has(account.username);
    const inG = followingSet.has(account.username);
    /** @type {import('../contracts/types.js').ListId} */
    const accountList = inF && inG ? 'mutuals' : inF ? 'followers' : 'following';
    const nameNorm = account.name ? normalizeName(account.name) : '';
    const nameTokens = nameNorm ? nameNorm.split(' ').filter(Boolean) : [];
    const unameStripped = String(account.username).replace(/[._\-]/g, '');
    const uTokens = usernameTokens(account.username);
    byUsername.set(account.username, {
      account,
      accountList,
      nameNorm,
      nameTokens,
      unameStripped,
      allTokens: new Set([...nameTokens, ...uTokens]),
    });
  };
  for (const a of result.lists.followers) consider(a);
  for (const a of result.lists.following) consider(a);

  /** @type {Map<string, Set<any>>} */
  const tokenIndex = new Map();
  for (const entry of byUsername.values()) {
    for (const tok of entry.allTokens) {
      if (!tok) continue;
      let bucket = tokenIndex.get(tok);
      if (!bucket) tokenIndex.set(tok, (bucket = new Set()));
      bucket.add(entry);
    }
  }
  return { tokenIndex };
}

function scoreContact(contact, index, minScore, maxPerContact) {
  const contactNorm = normalizeName(contact.fullName);
  const contactTokens = contactNorm.split(' ').filter(Boolean);
  if (contactTokens.length === 0) return [];

  const candidates = new Set();
  for (const tok of contactTokens) {
    const bucket = index.tokenIndex.get(tok);
    if (bucket) for (const e of bucket) candidates.add(e);
  }
  if (candidates.size === 0) return [];

  const contactJoined = contactTokens.join('');
  const scored = [];
  for (const entry of candidates) {
    const reasons = [];
    let score = 0;

    if (entry.nameNorm && entry.nameNorm === contactNorm) {
      score = Math.max(score, 1.0);
      reasons.push('exact-name');
    }

    if (
      entry.nameTokens.length > 0 &&
      contactTokens.every((t) => entry.nameTokens.includes(t))
    ) {
      score = Math.max(score, 0.9);
      reasons.push('all-name-tokens');
    }

    if (
      contactTokens.length >= 2 &&
      entry.nameTokens.length >= 2 &&
      contactTokens[0] === entry.nameTokens[entry.nameTokens.length - 1] &&
      contactTokens[contactTokens.length - 1] === entry.nameTokens[0]
    ) {
      score = Math.max(score, 0.88);
      reasons.push('reversed-name');
    }

    if (entry.nameNorm) {
      const d = dice(contactJoined, entry.nameNorm.replace(/\s+/g, ''));
      if (d > 0) {
        const scaled = 0.55 + d * (0.85 - 0.55);
        if (scaled >= minScore) {
          score = Math.max(score, scaled);
          reasons.push('dice-similarity');
        }
      }
    }

    if (entry.unameStripped && contactTokens.every((t) => entry.unameStripped.includes(t))) {
      score = Math.max(score, 0.7);
      reasons.push('username-token-match');
    }

    if (score >= minScore) {
      scored.push({
        contactId: contact.id,
        contact: publicContact(contact),
        account: entry.account,
        accountList: entry.accountList,
        score: round4(Math.min(1, score)),
        confidence: score >= 0.85 ? 'high' : score >= 0.7 ? 'medium' : 'low',
        reasons: dedupeReasons(reasons),
      });
    }
  }

  scored.sort((a, b) => b.score - a.score || cmp(a.account.username, b.account.username));
  return scored.slice(0, maxPerContact);
}

/** Contact copy with phone stripped — phone must never reach the UI via matches. */
function publicContact(c) {
  return {
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    fullName: c.fullName,
    phone: null,
    importedAt: c.importedAt,
  };
}

/**
 * Split a username into word-ish tokens on separators and digit/letter borders.
 * `ionut.stanoiu` -> [ionut, stanoiu]; `octavian.8.8` -> [octavian, 8, 8].
 * @param {string} u
 * @returns {string[]}
 */
export function usernameTokens(u) {
  return String(u || '')
    .toLowerCase()
    .replace(/([a-z])([0-9])/g, '$1 $2')
    .replace(/([0-9])([a-z])/g, '$1 $2')
    .split(/[._\-\s]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * Sørensen–Dice coefficient over character bigrams.
 * @param {string} a
 * @param {string} b
 * @returns {number} 0..1
 */
export function dice(a, b) {
  a = String(a || '');
  b = String(b || '');
  if (!a.length || !b.length) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const bg = new Map();
  for (let i = 0; i < a.length - 1; i++) {
    const g = a.slice(i, i + 2);
    bg.set(g, (bg.get(g) || 0) + 1);
  }
  let overlap = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const g = b.slice(i, i + 2);
    const have = bg.get(g) || 0;
    if (have > 0) {
      overlap++;
      bg.set(g, have - 1);
    }
  }
  return (2 * overlap) / (a.length - 1 + (b.length - 1));
}

function checkAbort(signal) {
  if (signal && signal.aborted) throw new ParseError('Contact matching aborted', 'aborted');
}

function dedupeReasons(r) {
  return [...new Set(r)];
}
function cmp(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
function round4(n) {
  return Math.round(n * 10000) / 10000;
}
