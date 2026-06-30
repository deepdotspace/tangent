import type { CollectionSchema } from 'deepspace/worker'

/**
 * friendship — account-gated edge (canonical a/b ordering). Both parties may
 * read/write their own edge; the server validates the accept transition.
 *
 * RBAC: there is no built-in "two named parties" rule, so we use the closest
 * real one — `collaborator` (owner OR a member of `collaboratorsField`). We set
 * `ownerField: 'requestedBy'` and `collaboratorsField: 'participants'`
 * (the JSON `[aUserId, bUserId]` array), so either party passes. The accept
 * status flip is gated by a server action. NOTE/DEVIATION: this leans on the
 * generic collaborator rule rather than a bespoke two-party rule.
 */
export const friendshipSchema: CollectionSchema = {
  name: 'friendship',
  columns: [
    { name: 'aUserId', storage: 'text', interpretation: 'plain' },
    { name: 'bUserId', storage: 'text', interpretation: 'plain' },
    // [aUserId, bUserId] — backs the `collaborator` permission rule
    { name: 'participants', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'status', storage: 'text', interpretation: { kind: 'select', options: ['pending', 'accepted'] } },
    { name: 'requestedBy', storage: 'text', interpretation: 'plain' },
  ],
  uniqueOn: ['aUserId', 'bUserId'],
  ownerField: 'requestedBy',
  collaboratorsField: 'participants',
  permissions: {
    '*': { read: false, create: false, update: false, delete: false },
    viewer: { read: false, create: false, update: false, delete: false },
    member: { read: 'collaborator', create: true, update: 'collaborator', delete: 'collaborator' },
    admin: { read: true, create: true, update: true, delete: true },
  },
}
