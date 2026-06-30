import type { CollectionSchema } from 'deepspace/worker'

/**
 * pairSolutions — the SECRET half of a pair: its par (true minimum clicks) and
 * up to K optimal example paths. Keyed by recordId === pairId (same stable id as
 * the public `pairs` row), seeded offline alongside pairs.
 *
 * Why a separate collection: `pairs` is public-read (clients need the
 * start/target titles for display), but par + the optimal solution must stay
 * HIDDEN until a player finishes — otherwise a client can read tomorrow's
 * optimal line straight off the data channel and the "par hidden until finish"
 * core mechanic collapses. RBAC mirrors targetDistanceMaps: server-read-only.
 * The async actions read it server-side and reveal par/examplePaths in the
 * finish result; the live race never needs it.
 */
export const pairSolutionsSchema: CollectionSchema = {
  name: 'pairSolutions',
  columns: [
    { name: 'par', storage: 'number', interpretation: 'plain' },
    { name: 'shortestPathCount', storage: 'number', interpretation: 'plain' },
    // up to K=3 optimal paths [[{title,pageId}]] for the post-race reveal
    { name: 'examplePaths', storage: 'text', interpretation: { kind: 'json' } },
  ],
  permissions: {
    '*': { read: false, create: false, update: false, delete: false },
    viewer: { read: false, create: false, update: false, delete: false },
    member: { read: false, create: false, update: false, delete: false },
    admin: { read: true, create: true, update: true, delete: true },
  },
}
