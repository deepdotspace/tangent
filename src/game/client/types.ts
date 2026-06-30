/**
 * Shared client protocol types for Tangent.
 *
 * These mirror the wire contract the server agent implements in parallel
 * (server actions under /api/actions/:name, the article render endpoint, and
 * the AppGameRoom gameState). The frontend is built against these typed shapes
 * so it compiles and renders graceful states before the server is callable.
 *
 * See docs/founder/FINAL-SPEC.md sections 1, 3, 5, 9, 10.
 */

export type Mode =
  | 'daily'
  | 'quick'
  | 'chaos'
  | 'ranked'
  | 'series'
  | 'private'
  | 'solo'

export type Difficulty = 'easy' | 'medium' | 'hard'

/** LIVE = race-to-arrive (real DO room). ASYNC = fewest clicks (stateless). */
export const LIVE_MODES: readonly Mode[] = ['quick', 'chaos', 'ranked', 'private']
export const ASYNC_MODES: readonly Mode[] = ['daily', 'solo', 'series']

export function isLiveMode(mode: Mode): boolean {
  return LIVE_MODES.includes(mode)
}

// ── Article render endpoint ──────────────────────────────────────────────
// GET /api/article?title=<title> -> ArticleResponse
// servedHtml carries <a class="tg-link" data-tg-to="Title"> for legal links.

export interface ArticleResponse {
  servedHtml: string
  pageId: number
  canonicalTitle: string
}

// ── Async race server actions ────────────────────────────────────────────

export interface StartAsyncRaceParams {
  mode: Mode
  difficulty?: Difficulty
  seriesId?: string
  pairId?: string
}

export interface StartAsyncRaceResult {
  runId: string
  pairId: string
  startTitle: string
  targetTitle: string
}

export interface SubmitAsyncMoveParams {
  runId: string
  fromTitle: string
  toTitle: string
  seq: number
}

export interface SubmitAsyncMoveOk {
  ok: true
  reached: boolean
  clicks: number
  currentTitle: string
  oneAway: boolean
}

export interface SubmitAsyncMoveErr {
  ok: false
  reason: string
}

export type SubmitAsyncMoveResult = SubmitAsyncMoveOk | SubmitAsyncMoveErr

export interface ExamplePathNode {
  title: string
  pageId?: number
}

export interface FinishAsyncRaceResult {
  clicks: number
  par: number
  examplePaths: ExamplePathNode[][]
  reached: boolean
  beatPar: boolean
}

// ── Live race (AppGameRoom gameState) ────────────────────────────────────

export type RacePhase = 'lobby' | 'countdown' | 'racing' | 'finished'

export type ChaosEffect = 'redact' | 'vanish' | 'boomerang' | 'bubble' | 'peek'

export interface LivePlayer {
  displayName: string
  emoji?: string
  isGhost?: boolean
  currentTitle?: string
  clicks: number
  reached?: boolean
  /** 0..100 proximity-to-target progress. */
  progress: number
  /** Server-derived: one hop from target (drives the target-link glow). */
  oneAway?: boolean
  charges?: number
  activeEffects?: ChaosEffect[]
  bubble?: boolean
}

export interface GameState {
  phase: RacePhase
  startTitle?: string
  targetTitle?: string
  timeLimitSec?: number
  mode?: Mode
  chaos?: boolean
  tick?: number
  countdown?: number
  winner?: string | null
  finishOrder?: string[]
  players: Record<string, LivePlayer>
}

export interface JoinQuickRaceResult {
  roomId: string
}

/** sendInput('navigate', NavigateInput) */
export interface NavigateInput {
  seq: number
  fromTitle: string
  toTitle: string
}

/** sendInput('powerup', PowerupInput) */
export interface PowerupInput {
  ptype: ChaosEffect
  target?: string
}

// ── A single hop in a recorded line (for the finish + result line) ────────

export interface LineNode {
  title: string
  pageId?: number
  involuntary?: boolean
}
