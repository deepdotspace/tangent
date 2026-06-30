import type { CollectionSchema } from 'deepspace/worker'

/**
 * challenge — async "beat my run" ghost challenge. Open-ended; any link
 * visitor can attempt at `/c/:id` with no signup.
 * RBAC: public-read by id; creator-write on create + own; `answeredByRunId` /
 * `status` flips are written by a server action (X-App-Action bypass).
 */
export const challengeSchema: CollectionSchema = {
  name: 'challenge',
  columns: [
    { name: 'fromUserId', storage: 'text', interpretation: 'plain' },
    { name: 'pairId', storage: 'text', interpretation: 'plain' },
    { name: 'ghostRunId', storage: 'text', interpretation: 'plain' },
    {
      name: 'status',
      storage: 'text',
      interpretation: { kind: 'select', options: ['open', 'answered', 'expired'] },
      default: 'open',
    },
    { name: 'expiresAt', storage: 'text', interpretation: 'plain' }, // null = open-ended
    { name: 'answeredByRunId', storage: 'text', interpretation: 'plain' },
    { name: 'createdAt', storage: 'text', interpretation: 'plain' },
  ],
  permissions: {
    '*': { read: true, create: false, update: false, delete: false },
    viewer: { read: true, create: false, update: false, delete: false },
    member: { read: true, create: true, update: 'own', delete: 'own' },
    admin: { read: true, create: true, update: true, delete: true },
  },
}
