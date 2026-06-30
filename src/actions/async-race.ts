/**
 * Async race server actions (Daily / Solo / Series) — RESOLUTIONS B4/B9.
 *
 * No Durable Object: the authoritative in-progress state is a `run` row with
 * `status:'active'`, and every move is a stateless, server-validated action
 * against the frozen current-article allowed-set (shared `validateMove`).
 * Identity is the JWT subject or `anon:<guestId>` (resolved by the worker
 * route, passed as `ctx.userId`); moves and timing are never trusted.
 *
 * Scoring: async = fewest CLICKS (time is the tiebreaker). Par is revealed only
 * AFTER the race (finishAsyncRace), never before.
 */

import type { ActionContext, ActionResult } from 'deepspace/worker'
import type { Env } from '../../worker'
import {
  getArticle,
  validateMove,
  toCanonicalTitle,
  normalizeTitleKey,
} from '../server/article-pipeline'
import { getOrCreateTodayDaily } from '../server/daily'
import {
  computeStreak,
  addToHistogram,
  utcDateString,
  type HistogramData,
} from '../server/streak'
import type {
  PathEntry,
  StartAsyncResult,
  SubmitMoveResult,
  FinishAsyncResult,
} from '../game/types'

// ── Row shapes (mirror the locked schemas) ───────────────────────────────

interface PairData {
  startTitle: string
  startPageId: number | null
  targetTitle: string
  targetPageId: number | null
  par: number
  difficulty?: string
  isOnboarding?: number | boolean
  examplePaths?: unknown
  [key: string]: unknown
}

interface RunData {
  subjectId: string
  subjectDisplayName: string
  subjectEmoji: string
  isGuest: number
  context: string
  pairId: string
  seriesId?: string
  path: PathEntry[]
  clicks: number
  timeMs: number
  reachedTarget: number
  outcome?: string
  status: string
  parAtPlay: number
  finishedAt?: string
  [key: string]: unknown
}

interface UserData {
  displayName?: string
  name?: string
  emoji?: string
  totalRaces?: number
  wins?: number
  [key: string]: unknown
}

const GUEST_EMOJI = ['🦊', '🦉', '🐙', '🦄', '🐳', '🦋', '🦎', '🐝', '🦒', '🦓', '🦔', '🐢']

function isGuestSubject(subjectId: string): boolean {
  return subjectId.startsWith('anon:')
}

function defaultEmoji(subjectId: string): string {
  let h = 0
  for (let i = 0; i < subjectId.length; i++) h = (h * 31 + subjectId.charCodeAt(i)) >>> 0
  return GUEST_EMOJI[h % GUEST_EMOJI.length]
}

function asArray<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[]
  if (typeof v === 'string') {
    try {
      const p = JSON.parse(v)
      return Array.isArray(p) ? (p as T[]) : []
    } catch {
      return []
    }
  }
  return []
}

/**
 * Authoritative click count for a path: the number of voluntary hops AFTER the
 * start entry. Involuntary hops (chaos teleports, if present) never count. This
 * is the single source of truth for clicks so the value can never drift from the
 * path (the off-by-one that came from trusting a separately-tracked counter).
 */
function countHops(path: PathEntry[]): number {
  let hops = 0
  for (let i = 1; i < path.length; i++) {
    if (!path[i]?.involuntary) hops++
  }
  return hops
}

function asRecord(v: unknown): Record<string, number> {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, number>
  if (typeof v === 'string') {
    try {
      const p = JSON.parse(v)
      return p && typeof p === 'object' ? (p as Record<string, number>) : {}
    } catch {
      return {}
    }
  }
  return {}
}

function ok<T>(data: T): ActionResult {
  return { success: true, data: data as unknown }
}
function fail(error: string): ActionResult {
  return { success: false, error }
}

/** Resolve the display name + emoji to denormalize onto the run. */
async function resolveIdentity(
  ctx: ActionContext<Env>,
): Promise<{ displayName: string; emoji: string; isGuest: boolean }> {
  const isGuest = isGuestSubject(ctx.userId)
  // Cap client-supplied identity: these land on PUBLIC run rows (leaderboards),
  // so bound the length to prevent storage abuse / unbounded display strings.
  const pName = (typeof ctx.params.displayName === 'string' ? ctx.params.displayName : '')
    .slice(0, 40)
    .trim()
  const pEmoji = (typeof ctx.params.emoji === 'string' ? ctx.params.emoji : '').slice(0, 8)
  if (!isGuest) {
    const u = await ctx.tools.get<UserData>('users', ctx.userId)
    if (u.success) {
      const d = u.data.record.data
      return {
        displayName: d.displayName || d.name || pName || 'Racer',
        emoji: d.emoji || pEmoji || defaultEmoji(ctx.userId),
        isGuest,
      }
    }
  }
  return {
    displayName: pName || (isGuest ? 'Guest' : 'Racer'),
    emoji: pEmoji || defaultEmoji(ctx.userId),
    isGuest,
  }
}

async function loadPair(ctx: ActionContext<Env>, pairId: string): Promise<PairData | null> {
  const r = await ctx.tools.get<PairData>('pairs', pairId)
  return r.success ? r.data.record.data : null
}

interface SolutionData {
  par: number
  examplePaths?: unknown
  // Index signature so this satisfies the `tools.get<T extends Record<string,
  // unknown>>` constraint (mirrors PairData/RunData/UserData above).
  [key: string]: unknown
}

/**
 * Load the SECRET half of a pair (par + optimal example paths) from the
 * server-only `pairSolutions` collection (keyed by pairId). Never reaches a
 * client except as the post-race reveal in the finish result.
 */
async function loadSolution(ctx: ActionContext<Env>, pairId: string): Promise<SolutionData> {
  const r = await ctx.tools.get<SolutionData>('pairSolutions', pairId)
  if (r.success) {
    const d = r.data.record.data
    return { par: typeof d.par === 'number' ? d.par : 0, examplePaths: d.examplePaths }
  }
  return { par: 0, examplePaths: [] }
}

/** Pick a random non-onboarding pair in a difficulty band (solo). */
async function pickSoloPair(ctx: ActionContext<Env>, difficulty: string): Promise<string | null> {
  const r = await ctx.tools.query<PairData>('pairs', {
    where: { difficulty },
    limit: 200,
  })
  if (!r.success) return null
  const pool = r.data.records.filter((p) => !p.data.isOnboarding)
  if (pool.length === 0) return null
  return pool[Math.floor(Math.random() * pool.length)].recordId
}

// ── startAsyncRace ────────────────────────────────────────────────────────

export async function startAsyncRace(ctx: ActionContext<Env>): Promise<ActionResult> {
  const mode = ctx.params.mode
  if (mode !== 'daily' && mode !== 'solo' && mode !== 'series') {
    return fail('startAsyncRace: mode must be daily | solo | series')
  }

  let pairId: string | null = null
  let seriesId: string | undefined
  if (mode === 'daily') {
    const daily = await getOrCreateTodayDaily(ctx.env)
    pairId = daily?.pairId ?? null
  } else if (mode === 'solo') {
    const difficulty =
      typeof ctx.params.difficulty === 'string' ? ctx.params.difficulty : 'medium'
    pairId = await pickSoloPair(ctx, difficulty)
  } else {
    pairId = typeof ctx.params.pairId === 'string' ? ctx.params.pairId : null
    seriesId = typeof ctx.params.seriesId === 'string' ? ctx.params.seriesId : undefined
    if (!pairId) return fail('startAsyncRace: series requires pairId')
  }
  if (!pairId) return fail('startAsyncRace: no eligible pair found')

  const pair = await loadPair(ctx, pairId)
  if (!pair) return fail('startAsyncRace: pair not found')

  const id = await resolveIdentity(ctx)
  const solution = await loadSolution(ctx, pairId)
  const startEntry: PathEntry = {
    title: toCanonicalTitle(pair.startTitle),
    pageId: pair.startPageId ?? null,
    atMs: 0,
  }
  const run: RunData = {
    subjectId: ctx.userId,
    subjectDisplayName: id.displayName,
    subjectEmoji: id.emoji,
    isGuest: id.isGuest ? 1 : 0,
    context: mode,
    pairId,
    ...(seriesId ? { seriesId } : {}),
    path: [startEntry],
    clicks: 0,
    timeMs: 0,
    reachedTarget: 0,
    status: 'active',
    parAtPlay: solution.par,
  }

  const created = await ctx.tools.create('run', run as unknown as Record<string, unknown>)
  if (!created.success) return fail('startAsyncRace: could not create run')

  const result: StartAsyncResult = {
    runId: created.data.recordId,
    pairId,
    startTitle: pair.startTitle,
    targetTitle: pair.targetTitle,
  }
  return ok(result)
}

// ── submitAsyncMove ───────────────────────────────────────────────────────

export async function submitAsyncMove(ctx: ActionContext<Env>): Promise<ActionResult> {
  const runId = typeof ctx.params.runId === 'string' ? ctx.params.runId : ''
  const fromTitle = typeof ctx.params.fromTitle === 'string' ? ctx.params.fromTitle : ''
  const toTitle = typeof ctx.params.toTitle === 'string' ? ctx.params.toTitle : ''
  const seq = typeof ctx.params.seq === 'number' ? ctx.params.seq : -1
  if (!runId || !fromTitle || !toTitle) {
    return ok<SubmitMoveResult>({ ok: false, reason: 'NOT_FOUND' })
  }

  const runRec = await ctx.tools.get<RunData>('run', runId)
  if (!runRec.success || runRec.data.record.data.subjectId !== ctx.userId) {
    return ok<SubmitMoveResult>({ ok: false, reason: 'NOT_FOUND' })
  }
  const run = runRec.data.record.data
  const createdAt = runRec.data.record.createdAt
  if (run.status !== 'active') {
    return ok<SubmitMoveResult>({ ok: false, reason: 'STALE_MOVE' })
  }

  const path = asArray<PathEntry>(run.path)
  const current = path.length > 0 ? path[path.length - 1].title : ''
  const clicks = typeof run.clicks === 'number' ? run.clicks : path.length - 1

  // Replay guard: seq must be the next expected click count. We deliberately do
  // NOT require the client's fromTitle to equal the server's current title. A
  // clicked link can be a REDIRECT whose raw link title differs from the resolved
  // canonical the server stored as `current`; requiring an exact match desynced the
  // run on the first redirect hop and then rejected every later move (the "count
  // flashes up then snaps back, stuck" bug). The origin is ALWAYS the server's own
  // authoritative current article; the move is validated against ITS links, so a
  // teleport is still impossible. fromTitle is only a fallback before the first hop.
  if (seq !== clicks) {
    return ok<SubmitMoveResult>({ ok: false, reason: 'STALE_MOVE' })
  }
  const origin = current || fromTitle
  if (!origin) {
    return ok<SubmitMoveResult>({ ok: false, reason: 'STALE_MOVE' })
  }

  const pair = await loadPair(ctx, run.pairId)
  if (!pair) return ok<SubmitMoveResult>({ ok: false, reason: 'NOT_FOUND' })

  let fromArticle
  let destArticle
  try {
    fromArticle = await getArticle(ctx.env, origin)
    if (!validateMove(fromArticle.allowedTitles, toTitle)) {
      return ok<SubmitMoveResult>({ ok: false, reason: 'ILLEGAL_MOVE' })
    }
    destArticle = await getArticle(ctx.env, toTitle)
  } catch {
    return ok<SubmitMoveResult>({ ok: false, reason: 'ARTICLE_LOAD_FAILED' })
  }

  const startMs = Date.parse(createdAt)
  const atMs = Number.isFinite(startMs) ? Date.now() - startMs : path.length * 1000
  const newCurrentTitle = destArticle.canonicalTitle || toCanonicalTitle(toTitle)
  const newEntry: PathEntry = { title: newCurrentTitle, pageId: destArticle.pageId, atMs }
  const newPath = [...path, newEntry]
  const newClicks = clicks + 1

  // Reach by pageId (authoritative), with a canonical-TITLE fallback for the case
  // where the destination HTML carried no mw:pageId meta (pageId null) or a redirect
  // made the resolved pageId differ from the stored target. Mirrors the live engine,
  // which reaches by title. A title match against the frozen target can never be a
  // false accept (the move was already validated against the current allowed-set).
  const reached =
    (destArticle.pageId != null &&
      pair.targetPageId != null &&
      destArticle.pageId === pair.targetPageId) ||
    normalizeTitleKey(newCurrentTitle) === normalizeTitleKey(pair.targetTitle)
  const oneAway = validateMove(destArticle.allowedTitles, pair.targetTitle)

  if (reached) {
    await finalizeRun(ctx, runId, { ...run, path: newPath, clicks: newClicks }, pair, {
      reached: true,
      forfeit: false,
      timeMs: atMs,
    })
  } else {
    await ctx.tools.update<RunData>('run', runId, { path: newPath, clicks: newClicks })
  }

  return ok<SubmitMoveResult>({
    ok: true,
    reached,
    clicks: newClicks,
    currentTitle: newCurrentTitle,
    oneAway,
  })
}

// ── finishAsyncRace ───────────────────────────────────────────────────────

export async function finishAsyncRace(ctx: ActionContext<Env>): Promise<ActionResult> {
  const runId = typeof ctx.params.runId === 'string' ? ctx.params.runId : ''
  if (!runId) return fail('finishAsyncRace: runId required')

  const runRec = await ctx.tools.get<RunData>('run', runId)
  if (!runRec.success || runRec.data.record.data.subjectId !== ctx.userId) {
    return fail('finishAsyncRace: run not found')
  }
  const run = runRec.data.record.data
  const createdAt = runRec.data.record.createdAt
  const pair = await loadPair(ctx, run.pairId)
  if (!pair) return fail('finishAsyncRace: pair not found')
  const solution = await loadSolution(ctx, run.pairId)

  const path = asArray<PathEntry>(run.path)
  const last = path[path.length - 1]
  // Clicks are ALWAYS derived from the path (the source of truth), never from the
  // separately-tracked counter — that decoupling is what produced the off-by-one.
  const clicks = countHops(path)
  // Reach is true if the run was already settled as reached OR the final article
  // is the target. (A reached async run auto-finalizes the instant the target is
  // clicked, so the explicit call here is usually idempotent.)
  const reachedFromPath =
    (last?.pageId != null && pair.targetPageId != null && last.pageId === pair.targetPageId) ||
    (last != null && normalizeTitleKey(last.title) === normalizeTitleKey(pair.targetTitle))
  const reached = run.reachedTarget === 1 || reachedFromPath

  if (run.status === 'active') {
    const startMs = Date.parse(createdAt)
    const timeMs = last?.atMs ?? (Number.isFinite(startMs) ? Date.now() - startMs : 0)
    await finalizeRun(ctx, runId, run, pair, { reached: reachedFromPath, forfeit: false, timeMs })
  }

  const par = solution.par
  const result: FinishAsyncResult = {
    clicks,
    par,
    // Solution paths come from the server-only pairSolutions row; this finish
    // result is the ONLY place they are revealed to the client (post-race).
    examplePaths: asArray<Array<{ title: string; pageId: number | null }>>(solution.examplePaths),
    reached,
    // Strictly fewer clicks than par = beat it; clicks === par is meeting par, not beating.
    beatPar: reached && clicks < par,
  }
  return ok(result)
}

// ── forfeitAsyncRace ──────────────────────────────────────────────────────

export async function forfeitAsyncRace(ctx: ActionContext<Env>): Promise<ActionResult> {
  const runId = typeof ctx.params.runId === 'string' ? ctx.params.runId : ''
  if (!runId) return fail('forfeitAsyncRace: runId required')

  const runRec = await ctx.tools.get<RunData>('run', runId)
  if (!runRec.success || runRec.data.record.data.subjectId !== ctx.userId) {
    return fail('forfeitAsyncRace: run not found')
  }
  const run = runRec.data.record.data
  if (run.status === 'final') return ok({ ok: true })

  const pair = await loadPair(ctx, run.pairId)
  const path = asArray<PathEntry>(run.path)
  const timeMs = path[path.length - 1]?.atMs ?? 0
  await finalizeRun(ctx, runId, run, pair, { reached: false, forfeit: true, timeMs })
  return ok({ ok: true })
}

// ── shared finalize (writes run, streak, histogram) ───────────────────────

async function finalizeRun(
  ctx: ActionContext<Env>,
  runId: string,
  run: RunData,
  pair: PairData | null,
  opts: { reached: boolean; forfeit: boolean; timeMs: number },
): Promise<void> {
  // The given run carries the final path (submitAsyncMove passes the move that
  // reached the target). Persist BOTH the path and the path-derived clicks so the
  // settled row is the truth: a finalize reached via auto-finalize and one reached
  // via an explicit finishAsyncRace land on the same clicks + path.
  const path = asArray<PathEntry>(run.path)
  const clicks = countHops(path)
  const outcome = opts.forfeit ? 'forfeit' : opts.reached ? 'reached' : 'dnf'
  const finishedAt = new Date().toISOString()

  await ctx.tools.update<RunData>('run', runId, {
    path,
    clicks,
    status: 'final',
    outcome,
    reachedTarget: opts.reached ? 1 : 0,
    timeMs: opts.timeMs,
    // parAtPlay was stamped at start from the server-only pairSolutions row; the
    // public pair.par is now neutered, so always prefer the stored value.
    parAtPlay: run.parAtPlay ?? 0,
    finishedAt,
  })

  // Daily completion drives the streak mirror + the click histogram — but ONLY
  // the FIRST reached completion of today's daily counts. A replay (the daily can
  // be restarted) or a concurrent double-submit must not double-bump the public
  // histogram or inflate wins/totalRaces. The streak itself is day-set deduped, so
  // it is safe either way; we gate the non-idempotent bumps.
  if (run.context === 'daily' && opts.reached) {
    const today = utcDateString()
    if (await isFirstDailyCompletionToday(ctx, today, runId)) {
      await bumpDailyHistogram(ctx, today, clicks)
      if (!isGuestSubject(ctx.userId)) {
        await recomputeStreak(ctx, today)
      }
    }
  }
}

/**
 * True iff this run is the subject's FIRST reached+final daily run finished today
 * (no other such run shares today's UTC date). finalizeRun marks this run final
 * BEFORE calling, so this run is included; we look for ANY other one today.
 */
async function isFirstDailyCompletionToday(
  ctx: ActionContext<Env>,
  today: string,
  runId: string,
): Promise<boolean> {
  const runs = await ctx.tools.query<RunData & { finishedAt?: string }>('run', {
    where: { subjectId: ctx.userId, context: 'daily', reachedTarget: 1, status: 'final' },
    limit: 1000,
  })
  if (!runs.success) return true
  for (const r of runs.data.records) {
    if (r.recordId === runId) continue
    const fin = r.data.finishedAt
    if (typeof fin === 'string' && fin.slice(0, 10) === today) return false
  }
  return true
}

async function bumpDailyHistogram(
  ctx: ActionContext<Env>,
  dateUTC: string,
  clicks: number,
): Promise<void> {
  const existing = await ctx.tools.query<{
    dateUTC: string
    buckets: unknown
    completions: number
    median: number
    [key: string]: unknown
  }>('dailyHistogram', { where: { dateUTC }, limit: 1 })
  const prev = existing.success && existing.data.records.length > 0 ? existing.data.records[0] : null
  const next: HistogramData = addToHistogram(
    prev
      ? {
          buckets: asRecord(prev.data.buckets),
          completions: Number(prev.data.completions) || 0,
          median: Number(prev.data.median) || 0,
        }
      : null,
    clicks,
  )
  if (prev) {
    await ctx.tools.update('dailyHistogram', prev.recordId, next as unknown as Record<string, unknown>)
  } else {
    await ctx.tools.create('dailyHistogram', {
      dateUTC,
      ...next,
    } as unknown as Record<string, unknown>)
  }
}

async function recomputeStreak(ctx: ActionContext<Env>, today: string): Promise<void> {
  const runs = await ctx.tools.query<RunData & { finishedAt?: string }>('run', {
    where: { subjectId: ctx.userId, context: 'daily', reachedTarget: 1, status: 'final' },
    limit: 1000,
  })
  if (!runs.success) return
  const days = new Set<string>()
  for (const r of runs.data.records) {
    const fin = r.data.finishedAt
    if (typeof fin === 'string' && fin.length >= 10) days.add(fin.slice(0, 10))
  }
  const streak = computeStreak(days, today)

  const u = await ctx.tools.get<UserData>('users', ctx.userId)
  const totalRaces = (u.success ? Number(u.data.record.data.totalRaces) || 0 : 0) + 1
  const wins = (u.success ? Number(u.data.record.data.wins) || 0 : 0) + 1
  await ctx.tools.update('users', ctx.userId, {
    currentStreak: streak.currentStreak,
    bestStreak: streak.bestStreak,
    streakFreezeAvailable: streak.streakFreezeAvailable ? 1 : 0,
    totalRaces,
    wins,
  })
}
