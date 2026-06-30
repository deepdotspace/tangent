import type { CollectionSchema } from 'deepspace/worker'

/**
 * dailyChallenge — one per UTC day (hand-curated 90-day queue).
 * RBAC: public-read (the "future hidden" rule is enforced at the route, not
 * the row); server-only-write.
 */
export const dailyChallengeSchema: CollectionSchema = {
  name: 'dailyChallenge',
  columns: [
    { name: 'dateUTC', storage: 'text', interpretation: 'plain' }, // YYYY-MM-DD
    { name: 'pairId', storage: 'text', interpretation: 'plain' },
    { name: 'number', storage: 'number', interpretation: 'plain' }, // "Tangent #142"
  ],
  uniqueOn: ['dateUTC'],
  permissions: {
    '*': { read: true, create: false, update: false, delete: false },
    viewer: { read: true, create: false, update: false, delete: false },
    member: { read: true, create: false, update: false, delete: false },
    admin: { read: true, create: true, update: true, delete: true },
  },
}
