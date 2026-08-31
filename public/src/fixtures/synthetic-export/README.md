# synthetic-export

A tiny, fully anonymised Instagram export used by `parser.test.js`. Safe to commit —
contains no real people. It deliberately exercises the parser's edge cases:

- `following.json` puts the username in `title` with **no `value` key** (the top catastrophic-bug risk).
- `hide_story_from.json` is a **single bare object, not an array**.
- `following_hashtags.json` has a bogus profile URL in `href` — the tag link must be rebuilt from `value`.
- Mojibake names (`hide_story_from.json` Name, two contacts) — double-encoded UTF-8, must decode to
  `Dănuț Mocanu`, `Ștefănel`, `Popă`.
- `synced_contacts.json` has: a full-name contact, a first-name-only contact, and a contact with
  **no name at all** (only "Contact Information") that the matcher must skip without crashing.

## Expected `AnalysisResult` (assert these in `parser.test.js`)

| field | value |
|---|---|
| `stats.followerCount` | 12 |
| `stats.followingCount` | 8 |
| `stats.mutualCount` | 5 |
| `stats.nonFollowerCount` | 3 |
| `stats.fanCount` | 7 |
| `lists.nonFollowers` usernames | `notback_one`, `notback_two`, `notback_three` |
| `lists.fans` usernames | `frank_r`, `grace.k`, `heidi`, `ivan`, `judy_x`, `mallory`, `stefan.t` |
| `lists.closeFriends.length` | 2 |
| `lists.blocked.length` | 1 |
| `lists.pendingRequests.length` | 2 (one with `name === null`) |
| `lists.recentRequests.length` | 1 |
| `lists.recentlyUnfollowed.length` | 1 |
| `lists.removedSuggestions.length` | 1 |
| `lists.hideStoryFrom.length` | 1, `name === 'Dănuț Mocanu'` |
| `hashtags` | 1, `url === 'https://www.instagram.com/explore/tags/travel'` |
| `contacts.length` | 5 |

Invariants: `mutualCount + nonFollowerCount === followingCount`;
`mutualCount + fanCount === followerCount`.
