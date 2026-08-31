/**
 * ONE·WAY — turn the raw export file map into normalized records.
 *
 * Owned by parser layer. This layer knows every quirk of Instagram's
 * "Followers and following" + "Contacts" JSON. It NEVER throws for a bad or
 * missing individual file — those become `ParseWarning`s and parsing continues.
 * The only fatal condition is "no connections/followers_and_following/ anywhere".
 *
 * @typedef {import('../contracts/types.js').Account} Account
 * @typedef {import('../contracts/types.js').Hashtag} Hashtag
 * @typedef {import('../contracts/types.js').Contact} Contact
 * @typedef {import('../contracts/types.js').ParseWarning} ParseWarning
 */

import { fixMojibake, normalizeUsername } from './decode.js';
import { profileUrl } from './format.js';

/** Error thrown by the parse/pipeline layer. Re-exported from pipeline.js. */
export class ParseError extends Error {
  /**
   * @param {string} message
   * @param {'not-a-zip'|'unsupported-zip'|'no-connections-folder'|'aborted'} code
   */
  constructor(message, code) {
    super(message);
    this.name = 'ParseError';
    this.code = code;
  }
}

const CONN_DIR = 'connections/followers_and_following/';
const CONTACTS_FILE = 'connections/contacts/synced_contacts.json';

/** listId -> path suffix for the seven label-values files. */
const LABEL_FILES = {
  pendingRequests: CONN_DIR + 'pending_follow_requests.json',
  recentRequests: CONN_DIR + 'recent_follow_requests.json',
  recentlyUnfollowed: CONN_DIR + 'recently_unfollowed_profiles.json',
  blocked: CONN_DIR + 'blocked_profiles.json',
  closeFriends: CONN_DIR + 'close_friends.json',
  hideStoryFrom: CONN_DIR + 'hide_story_from.json',
  removedSuggestions: CONN_DIR + 'removed_suggestions.json',
};

const FOLLOWING_FILE = CONN_DIR + 'following.json';
const HASHTAGS_FILE = CONN_DIR + 'following_hashtags.json';
const FOLLOWERS_RE = /connections\/followers_and_following\/followers_(\d+)\.json$/;

const TEXT = new TextDecoder('utf-8');

/**
 * Accept either raw bytes (from readZip / a File) or already-decoded text (from
 * the CSP-safe fixture module, where `fetch()` is forbidden). Returns a string.
 * @param {Uint8Array|ArrayBuffer|string} v
 * @returns {string}
 */
function decodeMaybe(v) {
  if (typeof v === 'string') return v;
  if (v instanceof Uint8Array) return TEXT.decode(v);
  if (v instanceof ArrayBuffer) return TEXT.decode(new Uint8Array(v));
  return String(v == null ? '' : v);
}

/**
 * @param {Map<string, Uint8Array>} fileMap
 * @returns {{
 *   lists: Record<string, Account[]>,
 *   hashtags: Hashtag[],
 *   contacts: Contact[],
 *   warnings: ParseWarning[],
 *   filesFound: string[],
 *   filesMissing: string[],
 *   maxTimestamp: number|null,
 * }}
 */
export function parseConnections(fileMapInput) {
  const fileMap =
    fileMapInput instanceof Map ? fileMapInput : new Map(Object.entries(fileMapInput || {}));
  const paths = [...fileMap.keys()];
  if (!paths.some((p) => p.includes(CONN_DIR))) {
    throw new ParseError(
      'No connections/followers_and_following/ folder found anywhere in the export',
      'no-connections-folder',
    );
  }

  /** @type {ParseWarning[]} */
  const warnings = [];
  const filesFound = [];
  const filesMissing = [];
  let maxTs = 0;
  const trackTs = (ts) => {
    if (typeof ts === 'number' && ts > 0 && ts > maxTs) maxTs = ts;
  };

  const readJson = (suffix, label) => {
    const hit = findBySuffix(fileMap, suffix);
    if (!hit) {
      filesMissing.push(label || suffix);
      return { json: undefined, found: false };
    }
    filesFound.push(hit.path);
    try {
      return { json: JSON.parse(decodeMaybe(hit.value)), found: true };
    } catch (err) {
      warnings.push({
        code: 'unexpected-shape',
        file: hit.path,
        message: `Could not parse JSON in ${hit.path}: ${err && err.message ? err.message : err}`,
      });
      return { json: undefined, found: true };
    }
  };

  // ---- followers (globbed followers_N.json, numeric order) -----------------
  const followerFiles = paths
    .map((p) => {
      const m = p.match(FOLLOWERS_RE);
      return m ? { path: p, n: Number(m[1]) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.n - b.n);

  /** @type {Account[]} */
  let followers = [];
  if (followerFiles.length === 0) {
    filesMissing.push(CONN_DIR + 'followers_1.json');
  }
  for (const f of followerFiles) {
    filesFound.push(f.path);
    let json;
    try {
      json = JSON.parse(decodeMaybe(fileMap.get(f.path)));
    } catch (err) {
      warnings.push({
        code: 'unexpected-shape',
        file: f.path,
        message: `Could not parse JSON in ${f.path}: ${err && err.message ? err.message : err}`,
      });
      continue;
    }
    const rows = Array.isArray(json) ? json : [];
    for (const row of rows) {
      const s = (row && row.string_list_data && row.string_list_data[0]) || {};
      const acc = makeAccount(
        { rawUsername: s.value, rawName: row && row.title, rawUrl: '', timestamp: s.timestamp, fbid: null },
        'followers',
      );
      if (acc) {
        trackTs(acc.timestamp);
        followers.push(acc);
      }
    }
  }
  if (followerFiles.length > 0 && followers.length === 0) {
    warnings.push({
      code: 'empty-list',
      file: CONN_DIR + 'followers_*.json',
      message: 'followers_*.json files were present but yielded no accounts.',
    });
  }

  // ---- following (username is in `title`, NOT string_list_data[0].value) ---
  /** @type {Account[]} */
  let following = [];
  {
    const { json } = readJson(FOLLOWING_FILE, FOLLOWING_FILE);
    const rows = Array.isArray(json && json.relationships_following)
      ? json.relationships_following
      : [];
    let resolved = 0;
    for (const row of rows) {
      const s = (row && row.string_list_data && row.string_list_data[0]) || {};
      const acc = makeAccount(
        { rawUsername: row && row.title, rawName: '', rawUrl: '', timestamp: s.timestamp, fbid: null },
        'following',
      );
      if (acc) {
        resolved++;
        trackTs(acc.timestamp);
        following.push(acc);
      }
    }
    // Catastrophic-bug tripwire: reading `.value` here silently yields nothing.
    if (rows.length > 0 && resolved === 0) {
      warnings.push({
        code: 'no-followers',
        file: FOLLOWING_FILE,
        message:
          'following.json had rows but no usernames resolved — the export shape may have changed (expected the username in `title`).',
      });
    }
  }

  // ---- the seven label-values files --------------------------------------
  /** @type {Record<string, Account[]>} */
  const labelLists = {};
  for (const [listId, suffix] of Object.entries(LABEL_FILES)) {
    const { json, found } = readJson(suffix, suffix);
    if (!found) {
      labelLists[listId] = [];
      continue;
    }
    const rows = normalizeRows(json);
    const accs = [];
    for (const row of rows) {
      const acc = readLabelRow(row, listId);
      if (acc) {
        trackTs(acc.timestamp);
        accs.push(acc);
      }
    }
    labelLists[listId] = accs;
  }

  // ---- following_hashtags.json -----------------------------------------
  /** @type {Hashtag[]} */
  let hashtags = [];
  {
    const { json } = readJson(HASHTAGS_FILE, HASHTAGS_FILE);
    const rows = Array.isArray(json && json.relationships_following_hashtags)
      ? json.relationships_following_hashtags
      : [];
    for (const row of rows) {
      const s = (row && row.string_list_data && row.string_list_data[0]) || {};
      const rawTag = fixMojibake(String(s.value == null ? '' : s.value)).trim();
      if (!rawTag) continue;
      const tag = rawTag.replace(/^#+/, '').toLowerCase();
      if (!tag) continue;
      const ts = typeof s.timestamp === 'number' && s.timestamp > 0 ? s.timestamp : null;
      trackTs(ts);
      hashtags.push({
        tag,
        displayTag: rawTag.replace(/^#+/, ''),
        url: `https://www.instagram.com/explore/tags/${encodeURIComponent(tag)}`,
        timestamp: ts,
      });
    }
  }

  // ---- synced_contacts.json ------------------------------------------
  /** @type {Contact[]} */
  let contacts = [];
  {
    const { json } = readJson(CONTACTS_FILE, CONTACTS_FILE);
    const rows = Array.isArray(json && json.contacts_contact_info)
      ? json.contacts_contact_info
      : [];
    rows.forEach((row, idx) => {
      const m = (row && row.string_map_data) || {};
      const firstName = cleanName(pick(m, 'First Name'));
      const lastName = cleanName(pick(m, 'Last Name'));
      const phoneRaw = pick(m, 'Contact Information');
      const phone = phoneRaw ? String(phoneRaw) : null;
      const importedAt =
        m['Imported Time'] && typeof m['Imported Time'].timestamp === 'number' && m['Imported Time'].timestamp > 0
          ? m['Imported Time'].timestamp
          : null;
      trackTs(importedAt);
      const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
      contacts.push({
        id: `c${idx}`,
        firstName: firstName || null,
        lastName: lastName || null,
        fullName,
        phone,
        importedAt,
      });
    });
  }

  const lists = {
    followers,
    following,
    pendingRequests: labelLists.pendingRequests || [],
    recentRequests: labelLists.recentRequests || [],
    recentlyUnfollowed: labelLists.recentlyUnfollowed || [],
    blocked: labelLists.blocked || [],
    closeFriends: labelLists.closeFriends || [],
    hideStoryFrom: labelLists.hideStoryFrom || [],
    removedSuggestions: labelLists.removedSuggestions || [],
  };

  return {
    lists,
    hashtags,
    contacts,
    warnings,
    filesFound: dedupe(filesFound),
    filesMissing: dedupe(filesMissing),
    maxTimestamp: maxTs > 0 ? maxTs : null,
  };
}

// ---------------------------------------------------------------------------

/** `Array.isArray(x) ? x : (x == null ? [] : [x])` — hide_story_from is bare. */
export function normalizeRows(json) {
  if (Array.isArray(json)) return json;
  if (json == null) return [];
  return [json];
}

function readLabelRow(row, listId) {
  const lv = (row && row.label_values) || [];
  const get = (label) => {
    const hit = lv.find((x) => x && x.label === label);
    return hit && hit.value != null ? String(hit.value) : '';
  };
  return makeAccount(
    {
      rawUsername: get('Username'),
      rawName: get('Name'),
      rawUrl: get('URL'),
      timestamp: row && row.timestamp,
      fbid: row && row.fbid != null ? String(row.fbid) : null,
    },
    listId,
  );
}

/**
 * Build a normalized `Account`, or `null` when there is no usable username.
 * @returns {Account|null}
 */
function makeAccount({ rawUsername, rawName, rawUrl, timestamp, fbid }, listId) {
  const display = String(rawUsername == null ? '' : rawUsername).trim().replace(/^@+/, '');
  const username = normalizeUsername(rawUsername);
  if (!username) return null;

  const decodedName = fixMojibake(String(rawName == null ? '' : rawName)).trim();
  const url = String(rawUrl == null ? '' : rawUrl).trim();
  const ts = typeof timestamp === 'number' && timestamp > 0 ? timestamp : null;

  return {
    username,
    displayUsername: display || username,
    name: decodedName || null,
    profileUrl: profileUrl(display || username),
    externalUrl: url || null,
    timestamp: ts,
    fbid: fbid || null,
    sources: [listId],
  };
}

function pick(map, key) {
  const cell = map && map[key];
  return cell && cell.value != null ? String(cell.value) : '';
}

function cleanName(s) {
  const out = fixMojibake(String(s == null ? '' : s)).trim();
  return out;
}

function findBySuffix(map, suffix) {
  for (const [p, v] of map) {
    if (p === suffix || p.endsWith('/' + suffix) || p.endsWith(suffix)) return { path: p, value: v };
  }
  return null;
}

function dedupe(arr) {
  return [...new Set(arr)];
}
