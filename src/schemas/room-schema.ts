import type { CollectionSchema } from 'deepspace/worker'

/**
 * room — durable private/live metadata. The live race state lives in the
 * AppGameRoom DO, not here; this row is for listing + by-code join + history.
 *
 * RBAC: public-read by code (no-signup join); host edits settings pre-race
 * (member `update: 'own'` limited to `writableFields`); `status` is mirrored
 * from the DO by a server action (server-only-write). Guest-hosted rooms are
 * created via a server action (X-App-Action), not a client mutation.
 */
export const roomSchema: CollectionSchema = {
  name: 'room',
  columns: [
    { name: 'code', storage: 'text', interpretation: 'plain' }, // 6-char
    { name: 'hostSubjectId', storage: 'text', interpretation: 'plain' },
    {
      name: 'mode',
      storage: 'text',
      interpretation: { kind: 'select', options: ['quick', 'chaos', 'ranked', 'private'] },
    },
    { name: 'pairId', storage: 'text', interpretation: 'plain' },
    { name: 'isCustomPair', storage: 'number', interpretation: { kind: 'boolean' }, default: 0 },
    // { allowStepBack, timeLimitSec, maxPlayers, chaos }
    { name: 'settings', storage: 'text', interpretation: { kind: 'json' } },
    {
      name: 'status',
      storage: 'text',
      interpretation: { kind: 'select', options: ['lobby', 'racing', 'finished'] },
    },
    { name: 'createdAt', storage: 'text', interpretation: 'plain' },
  ],
  uniqueOn: ['code'],
  permissions: {
    '*': { read: true, create: false, update: false, delete: false },
    viewer: { read: true, create: false, update: false, delete: false },
    member: {
      read: true,
      create: true,
      // host edits settings pre-race; status stays server-only.
      update: 'own',
      delete: 'own',
      writableFields: ['settings', 'pairId', 'isCustomPair'],
    },
    admin: { read: true, create: true, update: true, delete: true },
  },
}
