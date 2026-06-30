import type { CollectionSchema } from 'deepspace/worker'

/**
 * rankedMatch — 1v1 ranked result + Glicko-2 rating delta. Snapshots before
 * AND after for a revertible void.
 * RBAC: server-only-write; public-read of the non-anonymous summary.
 */
export const rankedMatchSchema: CollectionSchema = {
  name: 'rankedMatch',
  columns: [
    { name: 'aSubjectId', storage: 'text', interpretation: 'plain' },
    { name: 'bSubjectId', storage: 'text', interpretation: 'plain' },
    { name: 'pairId', storage: 'text', interpretation: 'plain' },
    { name: 'winnerSubjectId', storage: 'text', interpretation: 'plain' }, // null = void
    { name: 'aMuBefore', storage: 'number', interpretation: 'plain' },
    { name: 'aRdBefore', storage: 'number', interpretation: 'plain' },
    { name: 'aSigmaBefore', storage: 'number', interpretation: 'plain' },
    { name: 'bMuBefore', storage: 'number', interpretation: 'plain' },
    { name: 'bRdBefore', storage: 'number', interpretation: 'plain' },
    { name: 'bSigmaBefore', storage: 'number', interpretation: 'plain' },
    { name: 'aMuAfter', storage: 'number', interpretation: 'plain' },
    { name: 'aRdAfter', storage: 'number', interpretation: 'plain' },
    { name: 'aSigmaAfter', storage: 'number', interpretation: 'plain' },
    { name: 'bMuAfter', storage: 'number', interpretation: 'plain' },
    { name: 'bRdAfter', storage: 'number', interpretation: 'plain' },
    { name: 'bSigmaAfter', storage: 'number', interpretation: 'plain' },
    { name: 'seasonId', storage: 'text', interpretation: 'plain' }, // YYYY-MM
    { name: 'runIds', storage: 'text', interpretation: { kind: 'json' } }, // [aRunId, bRunId]
    { name: 'state', storage: 'text', interpretation: { kind: 'select', options: ['final', 'voided'] } },
  ],
  permissions: {
    '*': { read: true, create: false, update: false, delete: false },
    viewer: { read: true, create: false, update: false, delete: false },
    member: { read: true, create: false, update: false, delete: false },
    admin: { read: true, create: true, update: true, delete: true },
  },
}
