import type { CollectionSchema } from 'deepspace/worker'

/**
 * notification — idempotency guard + in-app feed.
 * RBAC: server-only-write; owner-read (`member read: 'own'` via
 * `ownerField: 'userId'`). The owner may flip `readAt` only (`writableFields`).
 *
 * NOTE (RESOLUTIONS M7): the UNIQUE(userId,type,dateUTC) email-dedup key is
 * NOT a schema-level `uniqueOn` here — that would wrongly collide the per-event
 * feed types (friend_request/friend_beat/challenge_answered). Email idempotency
 * (streak_at_risk/daily_ready) is enforced by the enqueueing server action.
 *
 * NOTE (schema-lint): `ownerField` is set without `userBound: true`, which the
 * lint flags as an owner-spoof risk. It is benign here — members cannot create
 * or change `userId` (no create; update limited to `readAt`); only server
 * actions write the row, and userBound must stay OFF so the recipient id is not
 * overwritten with the (cron/owner) caller id.
 */
export const notificationSchema: CollectionSchema = {
  name: 'notification',
  columns: [
    { name: 'userId', storage: 'text', interpretation: 'plain' },
    {
      name: 'type',
      storage: 'text',
      interpretation: {
        kind: 'select',
        options: ['streak_at_risk', 'daily_ready', 'friend_request', 'friend_beat', 'challenge_answered'],
      },
    },
    { name: 'dateUTC', storage: 'text', interpretation: 'plain' },
    { name: 'payload', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'readAt', storage: 'text', interpretation: 'plain' }, // null = unread
  ],
  ownerField: 'userId',
  permissions: {
    '*': { read: false, create: false, update: false, delete: false },
    viewer: { read: false, create: false, update: false, delete: false },
    member: { read: 'own', create: false, update: 'own', delete: 'own', writableFields: ['readAt'] },
    admin: { read: true, create: true, update: true, delete: true },
  },
}
