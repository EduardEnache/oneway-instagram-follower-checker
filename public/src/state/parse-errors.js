/**
 * ONE·WAY — user-facing copy for ParseError codes.
 * Kept separate so both the landing view and the test suite import one source.
 */

export const PARSE_ERROR_COPY = {
  'not-a-zip':
    'That does not look like a readable ZIP. Choose the .zip Instagram gave you, or point at the folder you unzipped it into.',
  'unsupported-zip':
    'This ZIP uses a compression method this browser cannot unpack. Try a current Chrome, Firefox or Safari, or unzip it yourself and load the folder.',
  'no-connections-folder':
    'This export has no connections/followers_and_following folder. When you request your data, tick "Followers and following".',
  aborted: 'Loading was cancelled.',
  unavailable:
    'The analyzer is not wired into this preview build yet. Use the sample data to walk through the interface.',
  'fixture-missing': 'The bundled sample data file could not be loaded.',
};

/**
 * Map a ParseError-shaped object (or a bare code string) to a message.
 * @param {string | { code?: string, message?: string }} input
 * @returns {string}
 */
export function parseErrorMessage(input) {
  const code = typeof input === 'string' ? input : input && input.code;
  const fallbackMsg = typeof input === 'object' && input && input.message ? input.message : '';
  return PARSE_ERROR_COPY[code] || fallbackMsg || 'Something went wrong reading that export.';
}
