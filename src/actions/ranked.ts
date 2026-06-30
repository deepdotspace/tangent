/**
 * Ranked settlement — Glicko-2 rating update on a RANKED live match end.
 *
 * The rating update is SERVER-AUTHORITATIVE: it is driven by the GameRoom DO at
 * finalize (onGameEnd path), never by a client call, so a player cannot spoof a
 * win. `settleRankedMatch` is the function the DO invokes; `rankedStanding` is
 * the registered, read-only action a client uses to fetch its own standing.
 *
 * Rules (FINAL-SPEC §5 / spec/7 ranked seam):
 *  - humans-only, exactly 1v1 (no ghosts, no anonymous guests — guests are
 *    unrated, so a match with a guest is not settled);
 *  - SPEED win: reached first wins; ties broken by earliest finish tick, then
 *    fewest clicks; a true tie voids (no rating change, a `voided` match row);
 *  - both players' rating_mu / rating_rd / rating_sigma + rankedTier +
 *    rankedWins / rankedLosses (+ games, placements, peak, lastRankedAt) update;
 *  - a `rankedMatch` row is written with before AND after snapshots (revertible).
 *
 * Glicko-2 constants live in src/game/constants.ts. // TODO tune with real data.
 */

import type { ActionContext, ActionResult } from 'deepspace/worker'
import type { Env } from '../../worker'
import {
  getRecord,
  createRecord,
  updateRecord,
  type RecordStoreEnv,
} from '../server/record-store'
import {
  GLICKO,
  RANKED_PLACEMENTS,
  tierForRating,
} from '../game/constants'

// ── Glicko-2 (single 1v1 match) ───────────────────────────────────────────

const SCALE = 173.7178 // Glicko-2 rating-scale conversion constant.

interface Rating {
  mu: number
  rd: number
  sigma: number
}

function g(phi: number): number {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI))
}

function expectation(mu: number, muOpp: number, phiOpp: number): number {
  return 1 / (1 + Math.exp(-g(phiOpp) * (mu - muOpp)))
}

/**
 * One rating-period Glicko-2 update against a single opponent.
 * `score`: 1 = win, 0 = loss, 0.5 = draw. `opp` is the opponent's PRE-match
 * rating (both sides update against the other's pre-match values).
 */
export function glicko2Update(player: Rating, opp: Rating, score: number, tau: number): Rating {
  // to the Glicko-2 internal scale
  const mu = (player.mu - GLICKO.mu0) / SCALE
  const phi = player.rd / SCALE
  const muOpp = (opp.mu - GLICKO.mu0) / SCALE
  const phiOpp = opp.rd / SCALE

  const gPhi = g(phiOpp)
  const E = expectation(mu, muOpp, phiOpp)
  const v = 1 / (gPhi * gPhi * E * (1 - E))
  const delta = v * gPhi * (score - E)

  // new volatility via the Illinois root-finder (Glickman, step 5)
  const a = Math.log(player.sigma * player.sigma)
  const phi2 = phi * phi
  const delta2 = delta * delta
  const f = (x: number): number => {
    const ex = Math.exp(x)
    const denom = phi2 + v + ex
    return (ex * (delta2 - phi2 - v - ex)) / (2 * denom * denom) - (x - a) / (tau * tau)
  }

  let A = a
  let B: number
  if (delta2 > phi2 + v) {
    B = Math.log(delta2 - phi2 - v)
  } else {
    let k = 1
    while (f(a - k * tau) < 0 && k < 100) k += 1
    B = a - k * tau
  }
  let fA = f(A)
  let fB = f(B)
  let iter = 0
  while (Math.abs(B - A) > 1e-6 && iter < 100) {
    const C = A + ((A - B) * fA) / (fB - fA)
    const fC = f(C)
    if (fC * fB <= 0) {
      A = B
      fA = fB
    } else {
      fA = fA / 2
    }
    B = C
    fB = fC
    iter += 1
  }
  const sigmaPrime = Math.exp(A / 2)

  const phiStar = Math.sqrt(phi2 + sigmaPrime * sigmaPrime)
  const phiPrime = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v)
  const muPrime = mu + phiPrime * phiPrime * gPhi * (score - E)

  return {
    mu: Math.max(GLICKO.floor, SCALE * muPrime + GLICKO.mu0),
    rd: SCALE * phiPrime,
    sigma: sigmaPrime,
  }
}

// ── Settlement (called server-side by the GameRoom DO) ─────────────────────

export interface RankedResultPlayer {
  subjectId: string
  reached: boolean
  finishedAtTick: number | null
  clicks: number
  /** True if the player forfeited / ragequit. A forfeiter never outranks a
   *  non-forfeiter, so a 0-click quit cannot win the fewest-clicks tiebreak. */
  forfeited?: boolean
  runId?: string | null
}

interface UserRatingRow {
  rating_mu?: number | null
  rating_rd?: number | null
  rating_sigma?: number | null
  rankedWins?: number | null
  rankedLosses?: number | null
  rankedGames?: number | null
  placementsRemaining?: number | null
  peakRating?: number | null
}

function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function ratingFrom(d: UserRatingRow): Rating {
  return {
    mu: num(d.rating_mu, GLICKO.mu0),
    rd: num(d.rating_rd, GLICKO.rd0),
    sigma: num(d.rating_sigma, GLICKO.sigma0),
  }
}

function seasonId(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}

/** Rank two results by SPEED. Returns the winner's subjectId, or null on a tie. */
function speedWinner(a: RankedResultPlayer, b: RankedResultPlayer): string | null {
  // Forfeit ranks below everything: a forfeiter (often 0 clicks, not reached) must
  // never win the fewest-clicks tiebreak over an opponent who actually played. Both
  // forfeited -> void (no rating movement).
  const af = a.forfeited === true
  const bf = b.forfeited === true
  if (af && bf) return null
  if (af !== bf) return af ? b.subjectId : a.subjectId

  if (a.reached !== b.reached) return a.reached ? a.subjectId : b.subjectId
  if (a.reached && b.reached) {
    const ta = a.finishedAtTick ?? Number.MAX_SAFE_INTEGER
    const tb = b.finishedAtTick ?? Number.MAX_SAFE_INTEGER
    if (ta !== tb) return ta < tb ? a.subjectId : b.subjectId
  }
  // Neither reached (or same finish tick): fewer clicks wins; else void.
  if (a.clicks !== b.clicks) return a.clicks < b.clicks ? a.subjectId : b.subjectId
  return null
}

export interface RankedSettleResult {
  settled: boolean
  reason?: string
  winnerSubjectId?: string | null
}

export async function settleRankedMatch(
  env: RecordStoreEnv,
  args: { roomId: string; pairId: string; players: RankedResultPlayer[] },
): Promise<RankedSettleResult> {
  // Humans-only, rated-only (guests are unrated), exactly 1v1.
  const rated = args.players.filter((p) => p.subjectId && !p.subjectId.startsWith('anon:'))
  if (rated.length !== 2) {
    return { settled: false, reason: 'ranked settle needs exactly 2 rated humans' }
  }
  const [a, b] = rated

  const ua = await getRecord<UserRatingRow>(env, 'users', a.subjectId)
  const ub = await getRecord<UserRatingRow>(env, 'users', b.subjectId)
  if (!ua || !ub) return { settled: false, reason: 'rated user row missing' }

  const ra = ratingFrom(ua.data)
  const rb = ratingFrom(ub.data)
  const winner = speedWinner(a, b)
  const season = seasonId()

  if (winner == null) {
    // True tie -> void: snapshot before == after, no rating movement.
    await createRecord(env, 'rankedMatch', {
      aSubjectId: a.subjectId,
      bSubjectId: b.subjectId,
      pairId: args.pairId,
      winnerSubjectId: '',
      aMuBefore: ra.mu, aRdBefore: ra.rd, aSigmaBefore: ra.sigma,
      bMuBefore: rb.mu, bRdBefore: rb.rd, bSigmaBefore: rb.sigma,
      aMuAfter: ra.mu, aRdAfter: ra.rd, aSigmaAfter: ra.sigma,
      bMuAfter: rb.mu, bRdAfter: rb.rd, bSigmaAfter: rb.sigma,
      seasonId: season,
      runIds: [a.runId ?? null, b.runId ?? null],
      state: 'voided',
    })
    return { settled: false, reason: 'tie -> voided', winnerSubjectId: null }
  }

  const scoreA = winner === a.subjectId ? 1 : 0
  const scoreB = 1 - scoreA
  const naA = glicko2Update(ra, rb, scoreA, GLICKO.tau)
  const naB = glicko2Update(rb, ra, scoreB, GLICKO.tau)
  const nowIso = new Date().toISOString()

  await updateRecord(env, 'users', a.subjectId, {
    rating_mu: naA.mu,
    rating_rd: naA.rd,
    rating_sigma: naA.sigma,
    rankedTier: tierForRating(naA.mu),
    rankedWins: num(ua.data.rankedWins) + scoreA,
    rankedLosses: num(ua.data.rankedLosses) + (1 - scoreA),
    rankedGames: num(ua.data.rankedGames) + 1,
    placementsRemaining: Math.max(0, num(ua.data.placementsRemaining, RANKED_PLACEMENTS) - 1),
    peakRating: Math.max(num(ua.data.peakRating, naA.mu), naA.mu),
    lastRankedAt: nowIso,
  })
  await updateRecord(env, 'users', b.subjectId, {
    rating_mu: naB.mu,
    rating_rd: naB.rd,
    rating_sigma: naB.sigma,
    rankedTier: tierForRating(naB.mu),
    rankedWins: num(ub.data.rankedWins) + scoreB,
    rankedLosses: num(ub.data.rankedLosses) + (1 - scoreB),
    rankedGames: num(ub.data.rankedGames) + 1,
    placementsRemaining: Math.max(0, num(ub.data.placementsRemaining, RANKED_PLACEMENTS) - 1),
    peakRating: Math.max(num(ub.data.peakRating, naB.mu), naB.mu),
    lastRankedAt: nowIso,
  })

  await createRecord(env, 'rankedMatch', {
    aSubjectId: a.subjectId,
    bSubjectId: b.subjectId,
    pairId: args.pairId,
    winnerSubjectId: winner,
    aMuBefore: ra.mu, aRdBefore: ra.rd, aSigmaBefore: ra.sigma,
    bMuBefore: rb.mu, bRdBefore: rb.rd, bSigmaBefore: rb.sigma,
    aMuAfter: naA.mu, aRdAfter: naA.rd, aSigmaAfter: naA.sigma,
    bMuAfter: naB.mu, bRdAfter: naB.rd, bSigmaAfter: naB.sigma,
    seasonId: season,
    runIds: [a.runId ?? null, b.runId ?? null],
    state: 'final',
  })

  return { settled: true, winnerSubjectId: winner }
}

// ── Registered action: read the caller's own ranked standing (safe read) ───

export async function rankedStanding(ctx: ActionContext<Env>): Promise<ActionResult> {
  // Guests are unrated; only an authed caller has a rated users row.
  if (!ctx.userId || ctx.userId.startsWith('anon:')) {
    return { success: true, data: { placed: false } }
  }
  const me = await getRecord<UserRatingRow & { rankedTier?: string | null }>(
    ctx.env,
    'users',
    ctx.userId,
  )
  if (!me) return { success: true, data: { placed: false } }
  const d = me.data
  const placed = num(d.placementsRemaining, RANKED_PLACEMENTS) <= 0
  const mu = num(d.rating_mu, GLICKO.mu0)
  return {
    success: true,
    data: {
      placed,
      ratingMu: d.rating_mu ?? null,
      ratingRd: d.rating_rd ?? null,
      tier: d.rankedTier ?? (d.rating_mu != null ? tierForRating(mu) : null),
      wins: num(d.rankedWins),
      losses: num(d.rankedLosses),
      games: num(d.rankedGames),
      placementsRemaining: num(d.placementsRemaining, RANKED_PLACEMENTS),
    },
  }
}
