/**
 * ONE·WAY — per-list copy + sidebar structure.
 *
 * One place for: the human label, the date-column heading, the semantic tone,
 * the view blurb, and the (list-specific, never generic) empty-state copy.
 */

/** @typedef {import('../contracts/types.js').ListId} ListId */

/**
 * @type {Record<ListId, {
 *   label: string,
 *   blurb: string,
 *   dateCol: string,
 *   tone: 'positive'|'accent'|'neutral'|'negative',
 *   emptyTitle: string,
 *   emptyBody: string,
 * }>}
 */
export const LIST_META = {
  followers: {
    label: 'Followers',
    blurb: 'Everyone who follows your account, newest first.',
    dateCol: 'Followed you',
    tone: 'neutral',
    emptyTitle: 'No followers in this export',
    emptyBody: 'The followers file was present but held no accounts. If that is a surprise, re-download the export.',
  },
  following: {
    label: 'Following',
    blurb: 'Every account you follow.',
    dateCol: 'You followed',
    tone: 'neutral',
    emptyTitle: 'You are not following anyone',
    emptyBody: 'Nothing in the following file. Re-download the export if you expected entries here.',
  },
  nonFollowers: {
    label: 'Non-followers',
    blurb: 'Accounts you follow that do not follow you back. The reason most people open this tool.',
    dateCol: 'You followed',
    tone: 'accent',
    emptyTitle: 'Everyone you follow follows you back',
    emptyBody: 'There is no one-way follow in this export. Clean slate.',
  },
  fans: {
    label: 'Fans',
    blurb: 'Accounts that follow you while you do not follow them back.',
    dateCol: 'Followed you',
    tone: 'neutral',
    emptyTitle: 'No one-way fans',
    emptyBody: 'Every account that follows you is one you also follow.',
  },
  mutuals: {
    label: 'Mutuals',
    blurb: 'The accounts where the follow goes both ways.',
    dateCol: 'Followed you',
    tone: 'positive',
    emptyTitle: 'No mutual follows',
    emptyBody: 'Nothing in this export follows you back yet.',
  },
  pendingRequests: {
    label: 'Pending requests',
    blurb: 'Follow requests you have sent that are still waiting on the other person.',
    dateCol: 'Requested',
    tone: 'accent',
    emptyTitle: 'No outgoing requests are waiting',
    emptyBody: 'Every follow request you sent has been answered.',
  },
  recentRequests: {
    label: 'Recent requests',
    blurb: 'Follow requests you sent recently, per the export window.',
    dateCol: 'Requested',
    tone: 'neutral',
    emptyTitle: 'No recent requests recorded',
    emptyBody: 'Instagram listed no recent follow requests in this download.',
  },
  recentlyUnfollowed: {
    label: 'Recently unfollowed',
    blurb: 'Accounts you stopped following inside the export window.',
    dateCol: 'Unfollowed',
    tone: 'negative',
    emptyTitle: 'You have not unfollowed anyone recently',
    emptyBody: 'Instagram recorded no recent unfollows in this download.',
  },
  blocked: {
    label: 'Blocked',
    blurb: 'Accounts you have blocked.',
    dateCol: 'Blocked',
    tone: 'negative',
    emptyTitle: 'Your block list is empty',
    emptyBody: 'You have not blocked anyone, or Instagram left the list out of this export.',
  },
  closeFriends: {
    label: 'Close friends',
    blurb: 'Your close-friends list for stories.',
    dateCol: 'Added',
    tone: 'positive',
    emptyTitle: 'No close friends set',
    emptyBody: 'Your close-friends list has no accounts in it.',
  },
  hideStoryFrom: {
    label: 'Hide story from',
    blurb: 'Accounts you hide your story from.',
    dateCol: 'Hidden since',
    tone: 'neutral',
    emptyTitle: 'Your story is visible to all your followers',
    emptyBody: 'No one is on your hide-story-from list.',
  },
  removedSuggestions: {
    label: 'Removed suggestions',
    blurb: 'Accounts you dismissed from "suggested for you".',
    dateCol: 'Removed',
    tone: 'neutral',
    emptyTitle: 'No dismissed suggestions',
    emptyBody: 'You have not removed any suggested accounts, or the list was omitted.',
  },
};

/**
 * Sidebar groups. `listId` items link to `#/list/<id>` and show a count.
 * `key` items are non-list routes (`__hashtags`, `__contacts`, ...).
 * @type {Array<{ title:string, items: Array<{ label:string, listId?:ListId, route?:string, countKey?:string }> }>}
 */
export const NAV_GROUPS = [
  {
    title: 'Overview',
    items: [{ label: 'Dashboard', route: '#/dashboard' }],
  },
  {
    title: 'Relationships',
    items: [
      { label: 'Non-followers', listId: 'nonFollowers' },
      { label: 'Fans', listId: 'fans' },
      { label: 'Mutuals', listId: 'mutuals' },
      { label: 'Followers', listId: 'followers' },
      { label: 'Following', listId: 'following' },
    ],
  },
  {
    title: 'Requests',
    items: [
      { label: 'Pending', listId: 'pendingRequests' },
      { label: 'Recent requests', listId: 'recentRequests' },
      { label: 'Recently unfollowed', listId: 'recentlyUnfollowed' },
    ],
  },
  {
    title: 'Privacy',
    items: [
      { label: 'Blocked', listId: 'blocked' },
      { label: 'Close friends', listId: 'closeFriends' },
      { label: 'Hide story from', listId: 'hideStoryFrom' },
    ],
  },
  {
    title: 'Discovery',
    items: [
      { label: 'Hashtags', route: '#/hashtags', countKey: 'hashtags' },
      { label: 'Removed suggestions', listId: 'removedSuggestions' },
    ],
  },
  {
    title: 'Tools',
    items: [
      { label: 'Contacts', route: '#/contacts', countKey: 'contacts' },
      { label: 'Snapshots', route: '#/snapshots' },
      { label: 'About', route: '#/about' },
    ],
  },
];
