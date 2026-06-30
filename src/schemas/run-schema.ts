import type { CollectionSchema } from 'deepspace/worker'

/**
 * run — THE durable result record. Source for leaderboards, ghosts, replays,
 * share cards, and streaks. subjectId is the JWT subject or `anon:<guestId>`
 * (never trusted from the client; written by server actions only).
 *
 * Display name/emoji are DENORMALIZED here (RESOLUTIONS M3) so public boards
 * and cards render without reading the email-bearing users row.
 *
 * RBAC: server-only-write (finalizeRun / submitAsyncMove, X-App-Action bypass);
 * public-read so `/r/:runId` replays work with no signup (the today's-daily
 * spoiler gate is applied at the route, not the row).
 */
export const runSchema: CollectionSchema = {
  name: 'run',
  columns: [
    { name: 'subjectId', storage: 'text', interpretation: 'plain' },
    { name: 'subjectDisplayName', storage: 'text', interpretation: 'plain' },
    { name: 'subjectEmoji', storage: 'text', interpretation: 'plain' },
    { name: 'isGuest', storage: 'number', interpretation: { kind: 'boolean' }, default: 0 },
    {
      name: 'context',
      storage: 'text',
      interpretation: {
        kind: 'select',
        options: ['daily', 'quick', 'chaos', 'ranked', 'series', 'private', 'solo'],
      },
    },
    { name: 'pairId', storage: 'text', interpretation: 'plain' },
    { name: 'seriesId', storage: 'text', interpretation: 'plain' },
    { name: 'roomId', storage: 'text', interpretation: 'plain' },
    // per-hop timeline [{title, pageId, atMs, involuntary?}] -> ghost + line
    { name: 'path', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'clicks', storage: 'number', interpretation: 'plain', default: 0 },
    { name: 'timeMs', storage: 'number', interpretation: 'plain', default: 0 },
    { name: 'reachedTarget', storage: 'number', interpretation: { kind: 'boolean' }, default: 0 },
    {
      name: 'outcome',
      storage: 'text',
      interpretation: { kind: 'select', options: ['reached', 'dnf', 'forfeit', 'voided'] },
    },
    // active = in-progress async run (Daily/Solo/Series); final = settled
    { name: 'status', storage: 'text', interpretation: { kind: 'select', options: ['active', 'final'] } },
    { name: 'parAtPlay', storage: 'number', interpretation: 'plain' },
    { name: 'cardImageUrl', storage: 'text', interpretation: 'plain' },
    { name: 'finishedAt', storage: 'text', interpretation: 'plain' },
  ],
  permissions: {
    '*': { read: true, create: false, update: false, delete: false },
    viewer: { read: true, create: false, update: false, delete: false },
    member: { read: true, create: false, update: false, delete: false },
    admin: { read: true, create: true, update: true, delete: true },
  },
}
