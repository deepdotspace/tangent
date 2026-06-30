/**
 * Collection Schemas
 *
 * All collections with columns and RBAC permissions.
 * Single source of truth — imported by both worker and frontend.
 *
 * Add schemas by creating a file in src/schemas/ and importing it here.
 *
 * Tangent data model (FINAL-SPEC §9 + spec/10-data-model.md + RESOLUTIONS):
 * users (extended) + 13 game collections. Nav is TITLE-keyed; pageId is for
 * reach only (RESOLUTIONS B1). Identity is always the JWT subject or
 * `anon:<guestId>` — never trusted from the client.
 */

import type { CollectionSchema } from 'deepspace/worker'
import { usersSchema } from './schemas/users-schema'
import { settingsSchema } from './schemas/admin-schema'
import { pairsSchema } from './schemas/pairs-schema'
import { pairSolutionsSchema } from './schemas/pairSolutions-schema'
import { targetDistanceMapsSchema } from './schemas/targetDistanceMaps-schema'
import { dailyChallengeSchema } from './schemas/dailyChallenge-schema'
import { runSchema } from './schemas/run-schema'
import { roomSchema } from './schemas/room-schema'
import { rankedMatchSchema } from './schemas/rankedMatch-schema'
import { seriesSchema } from './schemas/series-schema'
import { seriesAttemptSchema } from './schemas/seriesAttempt-schema'
import { friendshipSchema } from './schemas/friendship-schema'
import { challengeSchema } from './schemas/challenge-schema'
import { notificationSchema } from './schemas/notification-schema'
import { dailyStatsSchema } from './schemas/dailyStats-schema'
import { dailyHistogramSchema } from './schemas/dailyHistogram-schema'

export const schemas: CollectionSchema[] = [
  usersSchema,
  settingsSchema,
  pairsSchema,
  pairSolutionsSchema,
  targetDistanceMapsSchema,
  dailyChallengeSchema,
  runSchema,
  roomSchema,
  rankedMatchSchema,
  seriesSchema,
  seriesAttemptSchema,
  friendshipSchema,
  challengeSchema,
  notificationSchema,
  dailyStatsSchema,
  dailyHistogramSchema,
]
