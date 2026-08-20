import type { CollectionSchema } from 'deepspace/worker'

/**
 * seriesAttempt — per-subject progress through a series. legResults references
 * the per-leg run ids and holds totals (RESOLUTIONS B15: run.seriesId + this
 * are both kept and reconciled).
 * RBAC: server-only-write; public-read for the standings board.
 *
 * NOTE: deliberately NO `uniqueOn: ['subjectId','seriesId','status']`, which is
 * the obvious-looking guard against two concurrent startAsyncRace calls opening
 * two active attempts. It would break replay: finishing a gauntlet retires the
 * old attempt to status 'final' and opens a fresh one, so a subject who
 * completes the same series twice legitimately holds TWO ('final') rows and the
 * second retirement would collide. The constraint that would actually help is
 * uniqueness over active rows only — a partial index, which a column-tuple
 * uniqueOn cannot express. The stray-attempt race is left as-is: it costs one
 * orphan row and play stays correct. Same reasoning as notification-schema.ts.
 */
export const seriesAttemptSchema: CollectionSchema = {
  name: 'seriesAttempt',
  columns: [
    { name: 'subjectId', storage: 'text', interpretation: 'plain' },
    { name: 'seriesId', storage: 'text', interpretation: 'plain' },
    // [{ pairId, runId, clicks, timeMs }]
    { name: 'legResults', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'totalClicks', storage: 'number', interpretation: 'plain', default: 0 },
    { name: 'totalTimeMs', storage: 'number', interpretation: 'plain', default: 0 },
    { name: 'completed', storage: 'number', interpretation: { kind: 'boolean' }, default: 0 },
    { name: 'status', storage: 'text', interpretation: { kind: 'select', options: ['active', 'final'] } },
  ],
  permissions: {
    '*': { read: true, create: false, update: false, delete: false },
    viewer: { read: true, create: false, update: false, delete: false },
    member: { read: true, create: false, update: false, delete: false },
    admin: { read: true, create: true, update: true, delete: true },
  },
}
