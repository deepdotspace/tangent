import type { CollectionSchema } from 'deepspace/worker'

/**
 * dailyStats — cron-maintained aggregate for the home ticker (real data).
 * `racingNow` is an approximate 5-min presence snapshot; `racesToday` is firm.
 * RBAC: public-read; server-only-write (refresh-stats cron).
 */
export const dailyStatsSchema: CollectionSchema = {
  name: 'dailyStats',
  columns: [
    { name: 'dateUTC', storage: 'text', interpretation: 'plain' },
    { name: 'racesToday', storage: 'number', interpretation: 'plain', default: 0 },
    { name: 'racingNow', storage: 'number', interpretation: 'plain', default: 0 },
    { name: 'updatedAt', storage: 'text', interpretation: 'plain' },
  ],
  uniqueOn: ['dateUTC'],
  permissions: {
    '*': { read: true, create: false, update: false, delete: false },
    viewer: { read: true, create: false, update: false, delete: false },
    member: { read: true, create: false, update: false, delete: false },
    admin: { read: true, create: true, update: true, delete: true },
  },
}
