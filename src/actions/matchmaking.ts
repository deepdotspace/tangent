/**
 * joinQuickRace — allocate (or join) a live race room via the per-mode
 * AppMatchmakerRoom DO, then hand the client a roomId to connect with
 * `useGameRoom(roomId)`. Quick fills with ghosts; Ranked/Chaos are humans-only.
 */

import type { ActionContext, ActionResult } from 'deepspace/worker'
import type { Env } from '../../worker'

export async function joinQuickRace(ctx: ActionContext<Env>): Promise<ActionResult> {
  const mode = ctx.params.mode
  if (mode !== 'quick' && mode !== 'chaos' && mode !== 'ranked') {
    return { success: false, error: 'joinQuickRace: mode must be quick | chaos | ranked' }
  }
  // Ranked is rated, account-only: a guest can never be settled (no users row), so
  // keep guests out of the ranked queue rather than wasting a real opponent's match.
  if (mode === 'ranked' && (!ctx.userId || ctx.userId.startsWith('anon:'))) {
    return { success: false, error: 'joinQuickRace: ranked requires a signed-in account' }
  }

  const ns = ctx.env.MATCHMAKER_ROOMS
  const stub = ns.get(ns.idFromName(`mm:${mode}`))
  let res: Response
  try {
    res = await stub.fetch(
      new Request('https://mm/allocate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tg-internal': ctx.env.APP_IDENTITY_TOKEN,
        },
        body: JSON.stringify({ mode, subjectId: ctx.userId }),
      }),
    )
  } catch {
    return { success: false, error: 'joinQuickRace: matchmaker unavailable' }
  }
  if (!res.ok) {
    return { success: false, error: 'joinQuickRace: no room available' }
  }
  const data = (await res.json()) as { roomId?: string }
  if (!data.roomId) return { success: false, error: 'joinQuickRace: allocation failed' }
  return { success: true, data: { roomId: data.roomId } }
}
