/**
 * Tangent game constants (wave-0 shared contract).
 *
 * Single source of truth for the tunable numbers every later wave reads:
 * the tick loop, the room caps, the Glicko-2 rating, tier cutoffs, the
 * chaos charge economy, difficulty bands, and the article-cache key/TTL.
 *
 * Pure values only (no SDK imports) so this module is safe to import from
 * the frontend, the worker, and the Durable Objects alike. Anything marked
 * `// TODO tune` ships with a documented default and is meant to be tuned
 * once we have real play data.
 */

// ── Live race loop ───────────────────────────────────────────────────────

/** Authoritative ticks per second for AppGameRoom (vs the SDK default 20). */
export const TICK_RATE = 6
/** Hard cap on a single live round, in seconds (no winner -> cap-rank). */
export const ROUND_CAP_SEC = 180
/** Visible 3-2-1 GO countdown, in seconds. */
export const COUNTDOWN_SEC = 3
/** Length of a human-shareable room / friend / challenge code. */
export const ROOM_CODE_LEN = 6
/** Hard upper bound on racers in one live room (private rooms). */
export const ROOM_MAX = 12
/** Default lower bound on racers (solo-with-ghosts starts immediately). */
export const ROOM_MIN = 1 // TODO tune
/** Quick-race target headcount before ghost fill stops topping up. */
export const QUICK_RACE_TARGET = 6 // TODO tune

// ── Glicko-2 rating (ranked, lifetime) ───────────────────────────────────

/** Initial rating (mu). */
export const GLICKO_MU0 = 1500
/** Initial rating deviation (RD). */
export const GLICKO_RD0 = 350
/** Initial volatility (sigma). */
export const GLICKO_SIGMA0 = 0.06
/** System constant constraining volatility change over time. */
export const GLICKO_TAU = 0.5
/** Hard rating floor (cannot drop below this). */
export const GLICKO_RATING_FLOOR = 100
/** Placement matches before a tier badge is shown. */
export const RANKED_PLACEMENTS = 5

export const GLICKO = {
  mu0: GLICKO_MU0,
  rd0: GLICKO_RD0,
  sigma0: GLICKO_SIGMA0,
  tau: GLICKO_TAU,
  floor: GLICKO_RATING_FLOOR,
} as const

// ── Tiers (cutoffs are the LOWER bound of each tier) ─────────────────────
// Bronze is everything below Silver's cutoff. // TODO tune cutoffs with data.

export type RankedTier =
  | 'bronze'
  | 'silver'
  | 'gold'
  | 'platinum'
  | 'diamond'
  | 'master'

/** Lower-bound rating for each tier, ascending. Bronze has no floor. */
export const TIER_CUTOFFS: ReadonlyArray<{ tier: RankedTier; minRating: number }> = [
  { tier: 'bronze', minRating: 0 },
  { tier: 'silver', minRating: 1300 },
  { tier: 'gold', minRating: 1450 },
  { tier: 'platinum', minRating: 1600 },
  { tier: 'diamond', minRating: 1750 },
  { tier: 'master', minRating: 1900 },
] // TODO tune

/** Resolve a rating (mu) to its tier. */
export function tierForRating(mu: number): RankedTier {
  let result: RankedTier = 'bronze'
  for (const { tier, minRating } of TIER_CUTOFFS) {
    if (mu >= minRating) result = tier
  }
  return result
}

// ── Chaos charge economy (unranked, humans-only) ─────────────────────────

/** Voluntary clicks needed to earn one power-up charge. */
export const CHAOS_CLICKS_PER_CHARGE = 3
/** Maximum charges a player can hold at once. */
export const CHAOS_MAX_CHARGES = 2
/** Charges spent per cast. */
export const CHAOS_CAST_COST = 1
/** Clear-air immunity after an effect ends, in seconds (anti-grief). */
export const CHAOS_CLEAR_AIR_SEC = 6 // TODO tune

export type ChaosCardId = 'redact' | 'vanish' | 'boomerang' | 'bubble' | 'peek'
export type ChaosCardKind = 'offense' | 'defense' | 'utility'

/** The 5 power-up cards. `durationSec: 0` means instant. */
export const CHAOS_CARDS: ReadonlyArray<{
  id: ChaosCardId
  kind: ChaosCardKind
  durationSec: number
  cost: number
}> = [
  { id: 'redact', kind: 'offense', durationSec: 5, cost: 1 },
  { id: 'vanish', kind: 'offense', durationSec: 7, cost: 1 },
  { id: 'boomerang', kind: 'offense', durationSec: 0, cost: 1 },
  { id: 'bubble', kind: 'defense', durationSec: 20, cost: 1 },
  { id: 'peek', kind: 'utility', durationSec: 8, cost: 1 },
] // TODO tune

// ── Difficulty bands ─────────────────────────────────────────────────────
// Competitive par is held in [3,5]; onboarding pairs are an explicit par-2
// carve-out (exempt from the band + hub-ban invariants).

export const PAR_MIN = 3
export const PAR_MAX = 5
export const ONBOARDING_PAR = 2

export type Difficulty = 'easy' | 'medium' | 'hard'

/** Par band + shortest-path requirement per difficulty. // TODO tune */
export const DIFFICULTY_BANDS: ReadonlyArray<{
  difficulty: Difficulty
  par: number
  minShortestPaths: number
}> = [
  { difficulty: 'easy', par: 3, minShortestPaths: 2 },
  { difficulty: 'medium', par: 4, minShortestPaths: 2 },
  { difficulty: 'hard', par: 5, minShortestPaths: 1 },
] // TODO tune

/** Reverse-BFS distance map hop cap (per target endpoint). */
export const DISTANCE_MAP_HOP_CAP = 6 // TODO tune

// ── Article cache (DeepSpace KV, global/shared) ──────────────────────────

/** KV key prefix for the processed-article artifact. */
export const ART_CACHE_PREFIX = 'art:v1:'
/** KV TTL for a cached article, in seconds (24h). */
export const ART_CACHE_TTL_SEC = 24 * 60 * 60
/** Max concurrent upstream article fetches (respects the public fallback). */
export const ARTICLE_FETCH_CONCURRENCY = 3 // TODO tune

/** Build the KV key for a canonical (underscored) title. */
export function articleCacheKey(canonicalTitle: string): string {
  return `${ART_CACHE_PREFIX}${canonicalTitle}`
}
