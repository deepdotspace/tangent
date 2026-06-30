/**
 * Read-only data hooks over the run / dailyChallenge / pairs / dailyHistogram /
 * dailyStats collections (FINAL-SPEC 9). These power the home ticker + hero,
 * the leaderboard, the profile, and the daily result. All gracefully report
 * empty / loading so a not-yet-seeded server renders a designed empty state
 * rather than a broken screen. Identity is the signed-in user id or anon:guestId.
 */

import { useMemo } from 'react'
import { useQuery, useUser } from 'deepspace'
import { useGuestId, guestDisplayName } from './guest'
import { todayUtc } from './format'

// ── Wire row shapes (subset of the schema columns we read) ───────────────

export interface RunRow {
  subjectId: string
  subjectDisplayName?: string
  subjectEmoji?: string
  isGuest?: boolean
  context?: string
  pairId?: string
  path?: Array<{ title: string; pageId?: number }>
  clicks?: number
  timeMs?: number
  reachedTarget?: boolean
  outcome?: string
  status?: string
  parAtPlay?: number
  finishedAt?: string
}

export interface PairRow {
  startTitle: string
  targetTitle: string
  par: number
  difficulty?: string
  examplePaths?: Array<Array<{ title: string; pageId?: number }>>
}

export interface DailyChallengeRow {
  dateUTC: string
  pairId: string
  number: number
}

export interface DailyHistogramRow {
  dateUTC: string
  buckets: Record<string, number>
  completions?: number
  median?: number
}

export interface DailyStatsRow {
  dateUTC: string
  racesToday: number
  racingNow: number
}

export type LoadStatus = 'loading' | 'ready' | 'error'

/** Stable identity for the current player (matches run.subjectId). */
export function useIdentity(): { id: string; displayName: string; isSignedIn: boolean } {
  const guestId = useGuestId()
  const { user } = useUser()
  if (user?.id) {
    return { id: user.id, displayName: user.name ?? guestDisplayName(guestId), isSignedIn: true }
  }
  return { id: `anon:${guestId}`, displayName: guestDisplayName(guestId), isSignedIn: false }
}

/** Today's daily challenge + the resolved pair (start/target/number). */
export function useDailyChallenge(): {
  status: LoadStatus
  number: number | null
  pairId: string | null
  start: string | null
  target: string | null
} {
  const date = todayUtc()
  const dc = useQuery<DailyChallengeRow>('dailyChallenge', { where: { dateUTC: date }, limit: 1 })
  const challenge = dc.records[0]?.data ?? null
  // The store filters on columns, not recordId, so resolve the referenced pair
  // by matching recordId over a bounded query (the pool is small). We do NOT
  // filter on the isDailyEligible boolean here: boolean where-values are stored
  // as 0/1 and the column filter does not match a JS `true`, so we load the
  // pool and match by recordId client-side.
  const pq = useQuery<PairRow>('pairs', { limit: 500 })
  const pair = useMemo(() => {
    if (!challenge) return null
    return pq.records.find((r) => r.recordId === challenge.pairId)?.data ?? null
  }, [pq.records, challenge])
  const status: LoadStatus = dc.status === 'error' ? 'error' : dc.status
  return {
    status,
    number: pair ? challenge?.number ?? null : null,
    pairId: challenge?.pairId ?? null,
    start: pair?.startTitle ?? null,
    target: pair?.targetTitle ?? null,
  }
}

/** The home activity ticker — honest recent non-daily finishes only. */
export function useTicker(): { status: LoadStatus; items: Array<{ who: string; text: string }> } {
  // reachedTarget is a boolean-interpretation column stored as the number 1/0.
  // A `where` value of JS `true` never matches the stored 1 (neither the SQL
  // bind nor the realtime-subscription `!==` check), so filter on the numeric 1.
  const q = useQuery<RunRow>('run', { where: { status: 'final', reachedTarget: 1 }, orderBy: 'finishedAt', orderDir: 'desc', limit: 12 })
  const items = useMemo(() => {
    return q.records
      .map((r) => r.data)
      .filter((d) => d.context && d.context !== 'daily' && Array.isArray(d.path) && d.path.length > 1)
      .slice(0, 8)
      .map((d) => {
        const path = d.path!
        const from = path[0]?.title ?? '?'
        const to = path[path.length - 1]?.title ?? '?'
        return { who: d.subjectDisplayName ?? 'someone', text: `connected ${from} to ${to} in ${d.clicks ?? path.length - 1}` }
      })
  }, [q.records])
  return { status: q.status, items }
}

/** Live count for the home ribbon (approximate presence; honest null if absent). */
export function useLiveCount(): number | null {
  const date = todayUtc()
  const q = useQuery<DailyStatsRow>('dailyStats', { where: { dateUTC: date }, limit: 1 })
  const row = q.records[0]?.data
  return typeof row?.racingNow === 'number' ? row.racingNow : null
}

/** Today's daily leaderboard — fewest clicks, then fastest. */
export function useDailyLeaderboard(pairId: string | null): { status: LoadStatus; rows: RunRow[] } {
  // reachedTarget stored as number 1/0 — filter on numeric 1, not JS true (see useTicker).
  const q = useQuery<RunRow>('run', pairId ? { where: { context: 'daily', pairId, status: 'final', reachedTarget: 1 }, orderBy: 'clicks', orderDir: 'asc', limit: 50 } : { limit: 0 })
  const rows = useMemo(() => q.records.map((r) => r.data), [q.records])
  // A null pairId means the daily is not seeded yet: that is a READY-but-empty
  // board (the page renders EmptyBlock), not a permanent spinner.
  return { status: pairId ? q.status : 'ready', rows }
}

/** This player's finished runs (profile history + stats). */
export function useMyRuns(identityId: string): { status: LoadStatus; rows: RunRow[] } {
  const q = useQuery<RunRow>('run', { where: { subjectId: identityId, status: 'final' }, orderBy: 'finishedAt', orderDir: 'desc', limit: 50 })
  const rows = useMemo(() => q.records.map((r) => r.data), [q.records])
  return { status: q.status, rows }
}

/**
 * The signed-in player's persisted stats. The streak mirror + ranked fields live
 * on the `users` collection row (server-written), NOT on the auth user returned
 * by useUser(), so read the row directly by recordId. Guests have no row, so the
 * stats are zero (their streak is not persisted across devices by design).
 */
export interface MyStats {
  currentStreak: number
  bestStreak: number
  totalRaces: number
  wins: number
  rating: number | null
  rankedTier: string | null
}

export function useMyStats(): MyStats {
  const { id, isSignedIn } = useIdentity()
  const q = useQuery<{
    currentStreak?: number
    bestStreak?: number
    totalRaces?: number
    wins?: number
    rating_mu?: number
    rankedTier?: string
  }>('users', isSignedIn ? { where: { recordId: id }, limit: 1 } : { limit: 0 })
  const row = q.records[0]?.data
  return {
    currentStreak: Number(row?.currentStreak) || 0,
    bestStreak: Number(row?.bestStreak) || 0,
    totalRaces: Number(row?.totalRaces) || 0,
    wins: Number(row?.wins) || 0,
    rating: typeof row?.rating_mu === 'number' ? row.rating_mu : null,
    rankedTier: typeof row?.rankedTier === 'string' ? row.rankedTier : null,
  }
}

/** Today's click distribution (daily result histogram). */
export function useDailyHistogram(): { status: LoadStatus; buckets: Record<string, number>; completions: number } {
  const date = todayUtc()
  const q = useQuery<DailyHistogramRow>('dailyHistogram', { where: { dateUTC: date }, limit: 1 })
  const row = q.records[0]?.data
  return { status: q.status, buckets: row?.buckets ?? {}, completions: row?.completions ?? 0 }
}

/** Themed series (Series select grid). */
export interface SeriesRow {
  title: string
  themeTag?: string
  length: number
  pairIds?: string[]
  difficultyArc?: string[]
}

export function useSeriesList(): { status: LoadStatus; rows: Array<{ id: string; data: SeriesRow }> } {
  const q = useQuery<SeriesRow>('series', { limit: 30 })
  const rows = useMemo(() => q.records.map((r) => ({ id: r.recordId, data: r.data })), [q.records])
  return { status: q.status, rows }
}
