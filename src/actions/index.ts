import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import {
  startAsyncRace,
  submitAsyncMove,
  finishAsyncRace,
  forfeitAsyncRace,
} from './async-race'
import { joinQuickRace } from './matchmaking'
import { rankedStanding } from './ranked'
import { seedCollections } from './seed'

/**
 * Server actions, invoked via POST /api/actions/:name (worker.ts).
 *
 * Identity is the verified JWT subject or `anon:<guestId>` (resolved at the
 * route), passed as `ctx.userId`. Each handler returns an `ActionResult`; the
 * frontend reads `.data` for the payloads documented in the protocol report.
 */
export const actions: Record<string, ActionHandler<Env>> = {
  // Async race (Daily / Solo / Series) — no DO, records + stateless validation.
  startAsyncRace,
  submitAsyncMove,
  finishAsyncRace,
  forfeitAsyncRace,
  // Live race entry (Quick / Chaos / Ranked) via the matchmaker.
  joinQuickRace,
  // Ranked standing read (the rating UPDATE is server-authoritative in the DO).
  rankedStanding,
  // Admin-only curation seeding.
  seedCollections,
}
