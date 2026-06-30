import type { CollectionSchema } from 'deepspace/worker'

/**
 * pairs — curated start/target endpoints, seeded offline.
 * RBAC: public-read (clients need the titles for display); server/seed-only-write.
 *
 * SECRETS LIVE ELSEWHERE: `par` + `examplePaths` (the optimal solution) are the
 * hidden-until-finish half and now live in the server-only `pairSolutions`
 * collection. The columns below are kept but the seed writes NEUTERED values
 * (par 0, examplePaths []) so the public row never leaks a solution; all server
 * consumers read the real par/examplePaths from pairSolutions.
 */
export const pairsSchema: CollectionSchema = {
  name: 'pairs',
  columns: [
    { name: 'startTitle', storage: 'text', interpretation: 'plain' },
    { name: 'startPageId', storage: 'number', interpretation: 'plain' },
    { name: 'targetTitle', storage: 'text', interpretation: 'plain' },
    { name: 'targetPageId', storage: 'number', interpretation: 'plain' },
    // DEPRECATED on this public row (seed writes 0). Real par -> pairSolutions.
    { name: 'par', storage: 'number', interpretation: 'plain' },
    { name: 'shortestPathCount', storage: 'number', interpretation: 'plain' },
    {
      name: 'difficulty',
      storage: 'text',
      interpretation: { kind: 'select', options: ['easy', 'medium', 'hard'] },
    },
    { name: 'themeTags', storage: 'text', interpretation: { kind: 'json' } },
    // DEPRECATED on this public row (seed writes []). Real paths -> pairSolutions.
    { name: 'examplePaths', storage: 'text', interpretation: { kind: 'json' } },
    // ref into targetDistanceMaps (keyed by targetTitle/targetPageId)
    { name: 'targetDistanceMapId', storage: 'text', interpretation: 'plain' },
    { name: 'isDailyEligible', storage: 'number', interpretation: { kind: 'boolean' }, default: 0 },
    { name: 'isOnboarding', storage: 'number', interpretation: { kind: 'boolean' }, default: 0 },
    { name: 'graphVersion', storage: 'text', interpretation: 'plain' },
  ],
  permissions: {
    '*': { read: true, create: false, update: false, delete: false },
    viewer: { read: true, create: false, update: false, delete: false },
    member: { read: true, create: false, update: false, delete: false },
    admin: { read: true, create: true, update: true, delete: true },
  },
}
