/**
 * Streak + daily-histogram pure helpers (FINAL-SPEC §8, RESOLUTIONS B5/B6/B9).
 *
 * Streaks are SERVER-computed from a subject's completed daily runs (cheat-
 * proof) — never trusted from the client. These functions are pure so the
 * logic is unit-testable without a DO or network.
 */

/** UTC date string `YYYY-MM-DD` for a Date (defaults to now). */
export function utcDateString(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10)
}

/** Add `n` UTC days to a `YYYY-MM-DD` string. */
function addUtcDays(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00.000Z')
  d.setUTCDate(d.getUTCDate() + n)
  return utcDateString(d)
}

export interface StreakState {
  currentStreak: number
  bestStreak: number
  /** A single auto-freeze is held; it bridges exactly one missed day. */
  streakFreezeAvailable: boolean
}

/** Completions needed to (re)earn the single streak freeze. // TODO tune */
export const STREAK_FREEZE_REFILL = 7

/**
 * Fold a subject's set of completed daily-UTC days into a streak.
 *
 * Rules (TODO tune): completing the daily extends the streak; a missed day is
 * bridged by the freeze if one is held (freeze consumed); a missed day with no
 * freeze, or a second consecutive miss, resets the streak; the freeze refills
 * after STREAK_FREEZE_REFILL consecutive completions. `today` is not counted as
 * a miss until the UTC day rolls (an unplayed today never resets a live streak).
 */
export function computeStreak(completedDays: Iterable<string>, today: string): StreakState {
  const done = new Set(completedDays)
  if (done.size === 0) {
    return { currentStreak: 0, bestStreak: 0, streakFreezeAvailable: false }
  }

  const days = [...done].sort()
  let cursor = days[0]

  let streak = 0
  let best = 0
  let freeze = false
  let sinceGrant = 0

  while (cursor <= today) {
    if (done.has(cursor)) {
      streak += 1
      best = Math.max(best, streak)
      sinceGrant += 1
      if (sinceGrant >= STREAK_FREEZE_REFILL && !freeze) {
        freeze = true
        sinceGrant = 0
      }
    } else if (cursor !== today) {
      // A real missed UTC day (today, still in progress, never counts).
      if (freeze) {
        freeze = false
        sinceGrant = 0
      } else {
        streak = 0
        sinceGrant = 0
      }
    }
    cursor = addUtcDays(cursor, 1)
  }

  return { currentStreak: streak, bestStreak: best, streakFreezeAvailable: freeze }
}

export interface HistogramData {
  buckets: Record<string, number>
  completions: number
  median: number
}

/** Median click-count across a `clicks -> count` histogram (0 when empty). */
export function histogramMedian(buckets: Record<string, number>): number {
  const entries = Object.entries(buckets)
    .map(([k, v]) => [Number(k), v] as const)
    .filter(([k]) => Number.isFinite(k))
    .sort((a, b) => a[0] - b[0])
  const total = entries.reduce((s, [, v]) => s + v, 0)
  if (total === 0) return 0
  const mid = (total - 1) / 2
  let seen = 0
  for (const [clicks, count] of entries) {
    seen += count
    if (seen > mid) return clicks
  }
  return entries[entries.length - 1][0]
}

/** Apply one completed daily result to a histogram aggregate (pure). */
export function addToHistogram(prev: Partial<HistogramData> | null, clicks: number): HistogramData {
  const buckets: Record<string, number> = { ...(prev?.buckets ?? {}) }
  const key = String(clicks)
  buckets[key] = (buckets[key] ?? 0) + 1
  const completions = (prev?.completions ?? 0) + 1
  return { buckets, completions, median: histogramMedian(buckets) }
}
