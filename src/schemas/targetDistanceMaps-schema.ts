import type { CollectionSchema } from 'deepspace/worker'

/**
 * targetDistanceMaps — per-target reverse-BFS distance map (keyed by canonical
 * title per RESOLUTIONS B1), powers cap-ranking + live "closest" + Chaos
 * auto-target. NOT shipped whole to clients.
 *
 * RBAC: server-read-only. No public/member read; only the DO + server actions
 * (X-App-Action, RBAC-bypass) and admins read it.
 */
export const targetDistanceMapsSchema: CollectionSchema = {
  name: 'targetDistanceMaps',
  columns: [
    { name: 'targetTitle', storage: 'text', interpretation: 'plain' },
    { name: 'targetPageId', storage: 'number', interpretation: 'plain' },
    { name: 'graphVersion', storage: 'text', interpretation: 'plain' },
    // map<canonicalTitle, int> capped ~6 hops; absent => beyond cap
    { name: 'distances', storage: 'text', interpretation: { kind: 'json' } },
  ],
  permissions: {
    '*': { read: false, create: false, update: false, delete: false },
    viewer: { read: false, create: false, update: false, delete: false },
    member: { read: false, create: false, update: false, delete: false },
    admin: { read: true, create: true, update: true, delete: true },
  },
}
