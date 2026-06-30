/**
 * seedCollections — ADMIN-ONLY generic bulk insert, used by the curation
 * pipeline to seed pairs / targetDistanceMaps / dailyChallenge / series, etc.
 *
 * Gated on the verified caller being the app owner (the action route only
 * resolves `ctx.userId` from a verified JWT or a guest id; a guest can never
 * equal OWNER_USER_ID). Each record may carry an optional `recordId` to upsert
 * against a known key (e.g. a stable pairId).
 */

import type { ActionContext, ActionResult } from 'deepspace/worker'
import type { Env } from '../../worker'

export async function seedCollections(ctx: ActionContext<Env>): Promise<ActionResult> {
  if (!ctx.userId || ctx.userId !== ctx.env.OWNER_USER_ID) {
    return { success: false, error: 'seedCollections: owner only' }
  }
  const collection = ctx.params.collection
  const records = ctx.params.records
  if (typeof collection !== 'string' || !Array.isArray(records)) {
    return { success: false, error: 'seedCollections: { collection, records[] } required' }
  }

  let inserted = 0
  for (const rec of records) {
    if (!rec || typeof rec !== 'object') continue
    const { recordId, ...data } = rec as Record<string, unknown> & { recordId?: unknown }
    const r = await ctx.tools.create(
      collection,
      data,
      typeof recordId === 'string' ? recordId : undefined,
    )
    if (r.success) inserted += 1
  }
  return { success: true, data: { inserted } }
}
