/**
 * Shared live-race protocol types (the contract the frontend builds against).
 *
 * Pure type declarations only — no runtime imports beyond the pure
 * `ChaosCardId` union — so this module is safe to import from the frontend
 * (`useGameRoom().state` narrowing), the worker, and the Durable Object alike.
 *
 * The authoritative `gameState` shape broadcast every GAME_TICK is
 * `TgGameState`. It is server-written only; clients never author presence.
 */

import type { ChaosCardId } from './constants'

/** Lifecycle phase (GameRoom has one running flag, so phase lives in state). */
export type RacePhase = 'lobby' | 'countdown' | 'racing' | 'finished'

/** Live race modes (async modes never spin a DO). */
export type LiveMode = 'quick' | 'chaos' | 'ranked' | 'private'

/** A timed chaos effect currently riding on a player. */
export interface ActiveEffect {
  /** Which card produced it (boomerang is instant, never stored here). */
  type: ChaosCardId
  /** Caster subjectId (for the "Redacted by Sam!" toast). */
  by: string
  /** Authoritative tick at which the effect expires. */
  untilTick: number
  /** For peek: the revealed rival's subjectId. */
  target?: string
}

/**
 * One participant slice (human OR ghost). Server-written only; broadcast every
 * tick inside `TgGameState.players` / `.ghosts`.
 *
 * `currentTitle` is the navigation key (RESOLUTIONS B1); the pageId used for
 * reach equality is kept server-side and never broadcast (anti-spoiler). The
 * distance fields are additive to the brief's shape (design A1/A2 + M5): a
 * single broadcast int per player plus a derived `oneAway` boolean, so the
 * client can render proximity pips + the target glow without ever showing the
 * raw remaining-hop number.
 */
export interface TgPlayer {
  displayName: string
  emoji: string
  isGhost: boolean
  /** Where they are now (null until the race reveals the start at GO). */
  currentTitle: string | null
  clicks: number
  reached: boolean
  /** Authoritative tick of arrival, or null. */
  finishedAtTick: number | null
  connState: 'live' | 'dropped'
  /** 0..100 closeness proxy for the presence rail. */
  progress: number
  /** Reverse-BFS hops to target from `currentTitle` (M5: one int broadcast). */
  remainingDist: number | null
  /** Derived: remainingDist === 1 (drives the target glow; never the number). */
  oneAway: boolean
  // ── chaos (present only in chaos rooms) ──
  charges?: number
  activeEffects?: ActiveEffect[]
  bubble?: boolean
  /**
   * Own-slice reconcile signal. When the server rejects an optimistic move it
   * stamps the rejected seq here so the mover can snap its article pane back
   * (useGameRoom surfaces state, not targeted messages).
   */
  lastRejected?: { seq: number; toTitle: string; reason: string } | null
}

/** One arrival/placement record (server-arrival order is authoritative). */
export interface TgFinish {
  subjectId: string
  tick: number
  /** Index within the tick's input buffer = true server-arrival order. */
  bufferIndex: number
  reached: boolean
  clicks: number
  isGhost: boolean
}

/**
 * The authoritative live-race state. Broadcast in full every GAME_TICK.
 * Kept deliberately small (full per-hop paths + allowed-sets + the distance
 * map live server-side, never here) so the 6 Hz fan-out stays cheap.
 */
export interface TgGameState {
  phase: RacePhase
  /** Null until GO (anti-spoiler: pairId would let a client read the pair). */
  pairId: string | null
  /** Null until GO (both titles revealed simultaneously at racing start). */
  startTitle: string | null
  targetTitle: string | null
  /** Server-side reach id; broadcast is harmless (an opaque int) but unused by UI. */
  targetPageId: number | null
  timeLimitSec: number
  mode: LiveMode
  chaos: boolean
  /** Authoritative clock (the DO tick counter, never Date.now). */
  tick: number
  /** Tick at which movement unlocks (countdown ends). */
  startedAtTick: number | null
  /** Set ONCE on first reach (buffer order); never overwritten. */
  winner: string | null
  finishOrder: TgFinish[]
  players: Record<string, TgPlayer>
  ghosts: Record<string, TgPlayer>
}

/** A stored ghost timeline passed to the room at configure (never broadcast). */
export interface GhostSource {
  ghostId: string
  runId: string
  displayName: string
  emoji: string
  /** Recorded run path, atMs relative to that run's start. */
  path: Array<{ title: string; pageId: number | null; atMs: number }>
}

/**
 * The internal room configuration written by the matchmaker before any client
 * connects (stored in DO storage, NOT in `gameState` so the pair stays hidden
 * until GO). `distances` is the reverse-BFS map keyed by normalized title.
 */
export interface RoomConfig {
  pairId: string
  mode: LiveMode
  chaos: boolean
  startTitle: string
  startPageId: number | null
  targetTitle: string
  targetPageId: number | null
  par: number
  allowStepBack: boolean
  timeLimitSec: number
  ghosts: GhostSource[]
  /** normalizedTitle -> reverse-BFS hops to target (capped). */
  distances: Record<string, number>
}

/** One server-authoritative path entry (mirrors run.path[] in the schema). */
export interface PathEntry {
  title: string
  pageId: number | null
  atMs: number
  involuntary?: boolean
}

// ── Async race server-action result shapes (the frontend builds against these) ──

export interface StartAsyncResult {
  runId: string
  pairId: string
  startTitle: string
  targetTitle: string
}

export type SubmitMoveResult =
  | {
      ok: true
      reached: boolean
      clicks: number
      currentTitle: string
      oneAway: boolean
    }
  | { ok: false; reason: 'ILLEGAL_MOVE' | 'STALE_MOVE' | 'ARTICLE_LOAD_FAILED' | 'NOT_FOUND' }

export interface FinishAsyncResult {
  clicks: number
  par: number
  examplePaths: Array<Array<{ title: string; pageId: number | null }>>
  reached: boolean
  beatPar: boolean
}
