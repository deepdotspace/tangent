/**
 * Series leg engine — the PURE half of Series mode.
 *
 * A series is an ordered list of pair ids (the legs). A subject's progress is a
 * `seriesAttempt` row holding `legResults`, one entry per FINISHED leg, in play
 * order. Everything derivable — which leg is next, the cumulative totals, and
 * whether the gauntlet is done — is derived from `legResults` and never from a
 * separately-tracked counter. That decoupling is exactly what produced the
 * off-by-one in the run click counter (see `countHops` in actions/async-race),
 * so the same rule applies here: `legResults` is the single source of truth.
 *
 * No DeepSpace / ctx dependency lives in this file so the whole engine is unit
 * testable with plain objects in the `node` vitest environment.
 */

export interface LegResult {
  pairId: string
  runId: string
  clicks: number
  timeMs: number
}

export interface SeriesProgress {
  /** Zero-based index of the leg to play next. Equals legCount when finished. */
  legIndex: number
  /** Number of legs in the series (0 for a missing / corrupt pairIds list). */
  legCount: number
  /** The pair to play for this leg, or null when there is nothing left to play. */
  pairId: string | null
  /** True once every leg has a recorded result. */
  completed: boolean
}

export interface AppliedLeg {
  legResults: LegResult[]
  totalClicks: number
  totalTimeMs: number
  completed: boolean
  status: 'active' | 'final'
  /** Zero-based index of the leg carrying `leg.runId` in the returned list. */
  legIndex: number
}

function finiteOrZero(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * The legs of a series, defensively. `pairIds` arrives through a json-interpreted
 * column, so it can come back as a real array OR as the raw JSON string; anything
 * else (null, an object, a broken string) is treated as "no legs" and the caller
 * fails cleanly rather than crashing mid-request.
 */
export function normalizePairIds(v: unknown): string[] {
  let raw: unknown = v
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw)
    } catch {
      return []
    }
  }
  if (!Array.isArray(raw)) return []
  return raw.filter((x): x is string => typeof x === 'string' && x.length > 0)
}

/**
 * The recorded legs of an attempt, defensively. Same json-or-string handling as
 * `normalizePairIds`, plus: entries without a usable runId are dropped, and a
 * repeated runId keeps only its FIRST occurrence. Deduping here is what makes a
 * double-fold (finalize racing an explicit finish) a no-op for the totals.
 */
export function normalizeLegResults(v: unknown): LegResult[] {
  let raw: unknown = v
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw)
    } catch {
      return []
    }
  }
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: LegResult[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const e = entry as Partial<LegResult>
    const runId = typeof e.runId === 'string' ? e.runId : ''
    if (!runId || seen.has(runId)) continue
    seen.add(runId)
    out.push({
      pairId: typeof e.pairId === 'string' ? e.pairId : '',
      runId,
      clicks: finiteOrZero(e.clicks),
      timeMs: finiteOrZero(e.timeMs),
    })
  }
  return out
}

/** Cumulative clicks + time, always re-summed from the leg list. */
export function sumLegs(legResults: readonly LegResult[]): {
  totalClicks: number
  totalTimeMs: number
} {
  let totalClicks = 0
  let totalTimeMs = 0
  for (const leg of legResults) {
    totalClicks += finiteOrZero(leg.clicks)
    totalTimeMs += finiteOrZero(leg.timeMs)
  }
  return { totalClicks, totalTimeMs }
}

/**
 * Which leg does this subject play next?
 *
 * `legResults.length` IS the next leg's zero-based index: 0 recorded legs -> play
 * pairIds[0]; 2 recorded legs -> play the THIRD leg, pairIds[2]. When every leg
 * has a result the attempt is complete, `pairId` is null and `legIndex` lands on
 * `legCount` (one past the last leg — never an out-of-range read). Corrupt data
 * with MORE results than legs clamps to the same place instead of running past
 * the end or going negative.
 */
export function resolveSeriesLeg(
  pairIds: readonly string[] | null | undefined,
  legResults: readonly LegResult[] | null | undefined,
): SeriesProgress {
  const legs = normalizePairIds(pairIds)
  const done = normalizeLegResults(legResults)
  const legCount = legs.length
  if (legCount === 0) {
    // A series with no legs can never be "completed" — there is nothing to play,
    // so the caller must fail cleanly rather than treat it as a finished gauntlet.
    return { legIndex: 0, legCount: 0, pairId: null, completed: false }
  }
  const legIndex = Math.min(Math.max(done.length, 0), legCount)
  const completed = legIndex >= legCount
  return {
    legIndex,
    legCount,
    pairId: completed ? null : legs[legIndex],
    completed,
  }
}

/**
 * Fold a finished leg into an attempt and return the attempt's new fields.
 *
 * IDEMPOTENT on `runId`: finalizeRun settles a run exactly once, but a concurrent
 * explicit finishAsyncRace can reach it a second time, so re-folding the same run
 * must not double-count its clicks or time. A repeat returns the existing state
 * (and the index the leg already occupies) unchanged.
 *
 * Totals are always re-summed from the resulting `legResults`; they are never
 * incremented off a stored counter, so they cannot drift from the leg list.
 */
export function applyLegResult(
  pairIds: readonly string[] | null | undefined,
  legResults: readonly LegResult[] | null | undefined,
  leg: LegResult,
): AppliedLeg {
  const legs = normalizePairIds(pairIds)
  const existing = normalizeLegResults(legResults)
  const legCount = legs.length

  const alreadyAt = existing.findIndex((l) => l.runId === leg.runId)
  // Already recorded (repeat finalize), or the attempt is somehow already full —
  // in both cases the stored legs win and nothing is appended. A full-but-active
  // attempt should be impossible (startAsyncRace retires a completed attempt and
  // opens a fresh one) so this is a clamp, not a path we expect to take.
  const full = legCount > 0 && existing.length >= legCount
  const next =
    alreadyAt >= 0 || full
      ? existing
      : [
          ...existing,
          {
            pairId: typeof leg.pairId === 'string' ? leg.pairId : '',
            runId: leg.runId,
            clicks: finiteOrZero(leg.clicks),
            timeMs: finiteOrZero(leg.timeMs),
          },
        ]

  const { totalClicks, totalTimeMs } = sumLegs(next)
  const completed = legCount > 0 && next.length >= legCount
  // Index of THIS run's leg. When the clamp above refused the append, the run is
  // not in the list at all, so we report one past the end rather than pointing at
  // some other leg's slot.
  const legIndex = alreadyAt >= 0 ? alreadyAt : next === existing ? next.length : next.length - 1

  return {
    legResults: next,
    totalClicks,
    totalTimeMs,
    completed,
    status: completed ? 'final' : 'active',
    legIndex,
  }
}
