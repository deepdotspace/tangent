import type { CollectionSchema } from 'deepspace/worker'

/**
 * dailyHistogram — per-day click distribution (RESOLUTIONS B5), incremented by
 * finalizeRun for context=daily. Powers "most people took 4."
 * RBAC: public-read; server-only-write.
 */
export const dailyHistogramSchema: CollectionSchema = {
  name: 'dailyHistogram',
  columns: [
    { name: 'dateUTC', storage: 'text', interpretation: 'plain' },
    // map<clicks, count>
    { name: 'buckets', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'completions', storage: 'number', interpretation: 'plain', default: 0 },
    { name: 'median', storage: 'number', interpretation: 'plain' },
  ],
  uniqueOn: ['dateUTC'],
  permissions: {
    '*': { read: true, create: false, update: false, delete: false },
    viewer: { read: true, create: false, update: false, delete: false },
    member: { read: true, create: false, update: false, delete: false },
    admin: { read: true, create: true, update: true, delete: true },
  },
}
