import type { CollectionSchema } from 'deepspace/worker'

/**
 * series — seeded, evergreen themed sets (length 3 or 5). Async (no DO).
 * RBAC: public-read; server/seed-only-write.
 */
export const seriesSchema: CollectionSchema = {
  name: 'series',
  columns: [
    { name: 'title', storage: 'text', interpretation: 'plain' },
    { name: 'themeTag', storage: 'text', interpretation: 'plain' },
    { name: 'length', storage: 'number', interpretation: 'plain' }, // 3 or 5
    { name: 'pairIds', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'difficultyArc', storage: 'text', interpretation: { kind: 'json' } },
  ],
  permissions: {
    '*': { read: true, create: false, update: false, delete: false },
    viewer: { read: true, create: false, update: false, delete: false },
    member: { read: true, create: false, update: false, delete: false },
    admin: { read: true, create: true, update: true, delete: true },
  },
}
