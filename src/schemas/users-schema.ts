import type { CollectionSchema } from 'deepspace/worker'
import { USERS_COLUMNS } from 'deepspace/worker'

/**
 * users — SDK baseline (USERS_COLUMNS) extended with Tangent's profile,
 * streak mirror, and ranked fields.
 *
 * RBAC intent (see FINAL-SPEC §9):
 *  - profile fields (displayName, emoji, email prefs, ranked-anonymous,
 *    profile privacy) are OWNER-write -> member `update: 'own'` limited to
 *    `writableFields`.
 *  - all competitive / derived fields (rating_*, tier, streak*, totalRaces,
 *    wins, ranked*) are SERVER-only-write: they are NOT in `writableFields`,
 *    so only privileged server actions (X-App-Action, bypass RBAC) write them.
 *  - public display of name/emoji for boards/cards is satisfied by the
 *    DENORMALIZED subjectDisplayName/subjectEmoji on `run` (RESOLUTIONS M3), so
 *    the users row is read 'own' ONLY. It carries email/PII and the app never
 *    reads another user's row from the client, so member-read:true would let any
 *    signed-in account harvest every user's email — read must be 'own'.
 */
export const usersSchema: CollectionSchema = {
  name: 'users',
  columns: [
    ...USERS_COLUMNS,
    // profile (owner-write)
    { name: 'displayName', storage: 'text', interpretation: 'plain' },
    { name: 'emoji', storage: 'text', interpretation: 'plain' },
    { name: 'profilePublic', storage: 'number', interpretation: { kind: 'boolean' }, default: 1 },
    { name: 'emailDailyReady', storage: 'number', interpretation: { kind: 'boolean' }, default: 0 },
    { name: 'emailStreakAtRisk', storage: 'number', interpretation: { kind: 'boolean' }, default: 1 },
    { name: 'rankedAnonymous', storage: 'number', interpretation: { kind: 'boolean' }, default: 0 },
    // guest provenance (server-write)
    { name: 'isAnonymousClaimedFrom', storage: 'text', interpretation: 'plain' },
    // streak mirror (server-write; computed from runs)
    { name: 'totalRaces', storage: 'number', interpretation: 'plain', default: 0 },
    { name: 'wins', storage: 'number', interpretation: 'plain', default: 0 },
    { name: 'currentStreak', storage: 'number', interpretation: 'plain', default: 0 },
    { name: 'bestStreak', storage: 'number', interpretation: 'plain', default: 0 },
    { name: 'streakFreezeAvailable', storage: 'number', interpretation: { kind: 'boolean' }, default: 0 },
    // ranked / Glicko-2 (server-write; null until first placement)
    { name: 'rating_mu', storage: 'number', interpretation: 'plain' },
    { name: 'rating_rd', storage: 'number', interpretation: 'plain' },
    { name: 'rating_sigma', storage: 'number', interpretation: 'plain' },
    {
      name: 'rankedTier',
      storage: 'text',
      interpretation: { kind: 'select', options: ['bronze', 'silver', 'gold', 'platinum', 'diamond', 'master'] },
    },
    { name: 'placementsRemaining', storage: 'number', interpretation: 'plain', default: 5 },
    { name: 'peakRatingThisSeason', storage: 'number', interpretation: 'plain' },
    { name: 'peakRating', storage: 'number', interpretation: 'plain' },
    { name: 'rankedWins', storage: 'number', interpretation: 'plain', default: 0 },
    { name: 'rankedLosses', storage: 'number', interpretation: 'plain', default: 0 },
    { name: 'rankedGames', storage: 'number', interpretation: 'plain', default: 0 },
    { name: 'lastRankedAt', storage: 'text', interpretation: 'plain' },
  ],
  permissions: {
    viewer: { read: 'own', create: false, update: false, delete: false },
    member: {
      read: 'own',
      create: false,
      update: 'own',
      delete: false,
      // Only profile fields are member-writable; competitive fields are
      // server-only (written by privileged server actions).
      writableFields: [
        'displayName',
        'emoji',
        'profilePublic',
        'emailDailyReady',
        'emailStreakAtRisk',
        'rankedAnonymous',
      ],
    },
    admin: { read: true, create: false, update: true, delete: true },
  },
}
