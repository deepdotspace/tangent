/**
 * Series leg engine — unit tests for the off-by-one traps.
 *
 * Pure functions, plain objects, no ctx: `legResults.length` is the next leg's
 * zero-based index, and folding the same runId twice must never double-count.
 */

import { describe, it, expect } from 'vitest'
import {
  resolveSeriesLeg,
  applyLegResult,
  normalizeLegResults,
  normalizePairIds,
  sumLegs,
  type LegResult,
} from './series'

const FIVE = ['pair_a', 'pair_b', 'pair_c', 'pair_d', 'pair_e']
const THREE = ['pair_a', 'pair_b', 'pair_c']

function leg(i: number, clicks = 4, timeMs = 10_000): LegResult {
  return { pairId: FIVE[i] ?? `pair_${i}`, runId: `run_${i}`, clicks, timeMs }
}

describe('resolveSeriesLeg', () => {
  it('a fresh attempt plays leg 0', () => {
    expect(resolveSeriesLeg(FIVE, [])).toEqual({
      legIndex: 0,
      legCount: 5,
      pairId: 'pair_a',
      completed: false,
    })
  })

  it('two finished legs resume on the THIRD leg (index 2)', () => {
    const p = resolveSeriesLeg(FIVE, [leg(0), leg(1)])
    expect(p.legIndex).toBe(2)
    expect(p.pairId).toBe('pair_c')
    expect(p.legCount).toBe(5)
    expect(p.completed).toBe(false)
  })

  it('four finished legs resume on the FINAL leg (index 4)', () => {
    const p = resolveSeriesLeg(FIVE, [leg(0), leg(1), leg(2), leg(3)])
    expect(p.legIndex).toBe(4)
    expect(p.pairId).toBe('pair_e')
    expect(p.completed).toBe(false)
  })

  it('every leg finished -> completed, no pair, legIndex === legCount', () => {
    const p = resolveSeriesLeg(FIVE, [leg(0), leg(1), leg(2), leg(3), leg(4)])
    expect(p).toEqual({ legIndex: 5, legCount: 5, pairId: null, completed: true })
  })

  it('a 3-leg series completes after 3 legs', () => {
    expect(resolveSeriesLeg(THREE, [leg(0), leg(1)]).pairId).toBe('pair_c')
    expect(resolveSeriesLeg(THREE, [leg(0), leg(1), leg(2)])).toEqual({
      legIndex: 3,
      legCount: 3,
      pairId: null,
      completed: true,
    })
  })

  it('more results than legs (corrupt) clamps instead of indexing past the end', () => {
    const p = resolveSeriesLeg(THREE, [leg(0), leg(1), leg(2), leg(3), leg(4)])
    expect(p.legIndex).toBe(3)
    expect(p.legCount).toBe(3)
    expect(p.pairId).toBeNull()
    expect(p.completed).toBe(true)
  })

  it('empty pairIds is not a completed series — nothing to play, legCount 0', () => {
    expect(resolveSeriesLeg([], [])).toEqual({
      legIndex: 0,
      legCount: 0,
      pairId: null,
      completed: false,
    })
  })

  it('pairIds that is not an array (null / object / junk string) never crashes', () => {
    const bad: Array<unknown> = [null, undefined, {}, 42, 'not json', '{"a":1}']
    for (const b of bad) {
      const p = resolveSeriesLeg(b as unknown as string[], [])
      expect(p).toEqual({ legIndex: 0, legCount: 0, pairId: null, completed: false })
    }
  })

  it('pairIds arriving as a JSON string (json column round-trip) still resolves', () => {
    const p = resolveSeriesLeg(JSON.stringify(FIVE) as unknown as string[], [leg(0)])
    expect(p.legIndex).toBe(1)
    expect(p.legCount).toBe(5)
    expect(p.pairId).toBe('pair_b')
  })

  it('legResults that is not an array is treated as no progress', () => {
    const p = resolveSeriesLeg(FIVE, 'garbage' as unknown as LegResult[])
    expect(p.legIndex).toBe(0)
    expect(p.pairId).toBe('pair_a')
  })

  it('duplicate runIds in stored legResults do not advance the leg twice', () => {
    const p = resolveSeriesLeg(FIVE, [leg(0), leg(0), leg(1)])
    expect(p.legIndex).toBe(2)
    expect(p.pairId).toBe('pair_c')
  })
})

describe('applyLegResult', () => {
  it('folds the first leg and stays active', () => {
    const r = applyLegResult(FIVE, [], leg(0, 3, 12_000))
    expect(r.legResults).toHaveLength(1)
    expect(r.legIndex).toBe(0)
    expect(r.totalClicks).toBe(3)
    expect(r.totalTimeMs).toBe(12_000)
    expect(r.completed).toBe(false)
    expect(r.status).toBe('active')
  })

  it('sums totals across legs from the leg list, never a stored counter', () => {
    let legs: LegResult[] = []
    const clicks = [3, 5, 2, 7, 4]
    const times = [1_000, 2_500, 900, 4_000, 3_100]
    for (let i = 0; i < 5; i++) {
      const r = applyLegResult(FIVE, legs, leg(i, clicks[i], times[i]))
      legs = r.legResults
      expect(r.legIndex).toBe(i)
    }
    const final = applyLegResult(FIVE, legs.slice(0, 4), leg(4, clicks[4], times[4]))
    expect(final.totalClicks).toBe(21)
    expect(final.totalTimeMs).toBe(11_500)
    expect(final.completed).toBe(true)
    expect(final.status).toBe('final')
  })

  it('is IDEMPOTENT on runId — a repeated fold does not double-count', () => {
    const first = applyLegResult(FIVE, [], leg(0, 4, 8_000))
    const again = applyLegResult(FIVE, first.legResults, leg(0, 4, 8_000))
    expect(again.legResults).toHaveLength(1)
    expect(again.totalClicks).toBe(4)
    expect(again.totalTimeMs).toBe(8_000)
    expect(again.legIndex).toBe(0)
    expect(again.status).toBe('active')

    // A repeat with DIFFERENT numbers (a re-read of the same settled run) still
    // keeps the already-recorded values rather than appending a second row.
    const conflicting = applyLegResult(FIVE, first.legResults, {
      ...leg(0),
      clicks: 99,
      timeMs: 99_999,
    })
    expect(conflicting.legResults).toHaveLength(1)
    expect(conflicting.totalClicks).toBe(4)
  })

  it('idempotent on the LAST leg — re-folding keeps completed/final and totals', () => {
    const four = [leg(0, 1, 100), leg(1, 2, 200), leg(2, 3, 300), leg(3, 4, 400)]
    const done = applyLegResult(FIVE, four, leg(4, 5, 500))
    expect(done.completed).toBe(true)
    expect(done.status).toBe('final')
    expect(done.legIndex).toBe(4)
    expect(done.totalClicks).toBe(15)

    const repeat = applyLegResult(FIVE, done.legResults, leg(4, 5, 500))
    expect(repeat.legResults).toHaveLength(5)
    expect(repeat.totalClicks).toBe(15)
    expect(repeat.totalTimeMs).toBe(1_500)
    expect(repeat.completed).toBe(true)
    expect(repeat.legIndex).toBe(4)
  })

  it('refuses to append past the end of a full attempt (clamp, not growth)', () => {
    const five = [leg(0), leg(1), leg(2), leg(3), leg(4)]
    const overflow = applyLegResult(FIVE, five, { pairId: 'pair_x', runId: 'run_x', clicks: 9, timeMs: 9 })
    expect(overflow.legResults).toHaveLength(5)
    expect(overflow.totalClicks).toBe(20)
    expect(overflow.completed).toBe(true)
    // The run was not recorded, so its index is reported one past the end.
    expect(overflow.legIndex).toBe(5)
  })

  it('drops duplicate stored rows while folding, then sums the deduped list', () => {
    const dirty = [leg(0, 4, 100), leg(0, 4, 100), leg(1, 6, 200)]
    const r = applyLegResult(FIVE, dirty, leg(2, 2, 300))
    expect(r.legResults.map((l) => l.runId)).toEqual(['run_0', 'run_1', 'run_2'])
    expect(r.totalClicks).toBe(12)
    expect(r.totalTimeMs).toBe(600)
    expect(r.legIndex).toBe(2)
  })

  it('coerces non-numeric clicks / time to 0 rather than producing NaN totals', () => {
    const r = applyLegResult(FIVE, [], {
      pairId: 'pair_a',
      runId: 'run_0',
      clicks: undefined as unknown as number,
      timeMs: 'x' as unknown as number,
    })
    expect(r.totalClicks).toBe(0)
    expect(r.totalTimeMs).toBe(0)
  })

  it('a legResults JSON string (json column round-trip) folds correctly', () => {
    const stored = JSON.stringify([leg(0, 3, 300)])
    const r = applyLegResult(FIVE, stored as unknown as LegResult[], leg(1, 4, 400))
    expect(r.legResults).toHaveLength(2)
    expect(r.totalClicks).toBe(7)
    expect(r.legIndex).toBe(1)
  })

  it('resolveSeriesLeg after applyLegResult always points at the NEXT leg', () => {
    let legs: LegResult[] = []
    for (let i = 0; i < 5; i++) {
      const before = resolveSeriesLeg(FIVE, legs)
      expect(before.legIndex).toBe(i)
      expect(before.pairId).toBe(FIVE[i])
      legs = applyLegResult(FIVE, legs, leg(i)).legResults
    }
    expect(resolveSeriesLeg(FIVE, legs).completed).toBe(true)
  })
})

describe('normalizers', () => {
  it('normalizePairIds keeps only non-empty strings', () => {
    expect(normalizePairIds(['a', '', null, 3, 'b'])).toEqual(['a', 'b'])
    expect(normalizePairIds('["a","b"]')).toEqual(['a', 'b'])
    expect(normalizePairIds('nope')).toEqual([])
    expect(normalizePairIds(undefined)).toEqual([])
  })

  it('normalizeLegResults drops runId-less entries and keeps the first duplicate', () => {
    const rows = normalizeLegResults([
      { pairId: 'a', runId: 'r1', clicks: 1, timeMs: 10 },
      { pairId: 'a', runId: 'r1', clicks: 99, timeMs: 99 },
      { pairId: 'b', clicks: 2, timeMs: 20 },
      null,
      { pairId: 'c', runId: 'r3', clicks: 3, timeMs: 30 },
    ])
    expect(rows.map((r) => r.runId)).toEqual(['r1', 'r3'])
    expect(rows[0].clicks).toBe(1)
  })

  it('sumLegs is a plain sum', () => {
    expect(sumLegs([leg(0, 2, 20), leg(1, 3, 30)])).toEqual({ totalClicks: 5, totalTimeMs: 50 })
    expect(sumLegs([])).toEqual({ totalClicks: 0, totalTimeMs: 0 })
  })
})
