/** App name — replaced by the CLI during scaffolding */
export const APP_NAME = 'tangent'

/** Primary scope ID for the app's RecordRoom DO */
export const SCOPE_ID = `app:${APP_NAME}`

/** Roles and display config — imported from SDK (single source of truth) */
export { ROLES, ROLE_CONFIG, type Role } from 'deepspace'

/** Game constants (tick rate, room caps, Glicko, tiers, matchmaking, chaos,
 *  difficulty bands, article-cache key/TTL). Defined in ./game/constants. */
export * from './game/constants'
