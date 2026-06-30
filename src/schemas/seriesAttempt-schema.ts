import type { CollectionSchema } from 'deepspace/worker'

/**
 * seriesAttempt — per-subject progress through a series. legResults references
 * the per-leg run ids and holds totals (RESOLUTIONS B15: run.seriesId + this
 * are both kept and reconciled).
 * RBAC: server-only-write; public-read for the standings board.
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
