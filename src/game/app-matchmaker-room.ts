/**
 * TangentMatchmakerRoom — the matchmaking allocator (spec/7 §7).
 *
 * One DO per mode (`mm:quick`, `mm:chaos`, `mm:ranked`): the single-threaded
 * serialization point for room allocation, so two players never each create
 * their own room and miss each other. `joinQuickRace` calls the internal
 * `POST /allocate`; the DO returns an open room to join, or mints a fresh
 * GameRoom (picking the pair, loading the reverse-BFS distance map, and — for
 * Quick only — seeding ghosts from recent reached runs so a room is never
 * empty). Ranked/Chaos are humans-only (no ghost fill).
 */

import { BaseRoom } from 'deepspace/worker'
import type { UserAttachment } from 'deepspace/worker'
import { normalizeTitleKey, toCanonicalTitle } from '../server/article-pipeline'
import {
  queryRecords,
  getRecord,
  createRecord,
  type RecordStoreEnv,
} from '../server/record-store'
import {
  ROUND_CAP_SEC,
  ROOM_MAX,
  QUICK_RACE_TARGET,
  ROOM_CODE_LEN,
} from './constants'
import type { RoomConfig, GhostSource, LiveMode, PathEntry } from './types'

export interface MatchmakerEnv extends RecordStoreEnv {
  GAME_ROOMS: DurableObjectNamespace
  APP_IDENTITY_TOKEN: string
}

interface OpenRoom {
  roomId: string
  pairId: string
  assigned: number
  cap: number
  createdAtMs: number
}

interface PairRow {
  startTitle: string
  startPageId: number | null
  targetTitle: string
  targetPageId: number | null
  par: number
  difficulty?: string
  isOnboarding?: number | boolean
  targetDistanceMapId?: string
}

/** Room stays joinable for this long before a new one is minted. // TODO tune */
const OPEN_ROOM_TTL_MS = 30_000

function capFor(mode: LiveMode): number {
  if (mode === 'ranked') return 2
  if (mode === 'chaos') return Math.min(ROOM_MAX, 8)
  return Math.min(ROOM_MAX, QUICK_RACE_TARGET)
}

function shortCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  const bytes = crypto.getRandomValues(new Uint8Array(ROOM_CODE_LEN))
  for (let i = 0; i < ROOM_CODE_LEN; i++) s += alphabet[bytes[i] % alphabet.length]
  return s
}

export class TangentMatchmakerRoom extends BaseRoom<MatchmakerEnv> {
  // The WS surface is unused for allocation (handled via onRequest), but
  // BaseRoom requires a message handler.
  protected onMessage(_ws: WebSocket, _user: UserAttachment, _message: { type: string }): void {
    // no-op
  }

  protected async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (request.method !== 'POST' || !url.pathname.endsWith('/allocate')) {
      return new Response('Not found', { status: 404 })
    }
    // Internal-only route (an action's DO stub fetch -> this DO). The token is
    // defense-in-depth, enforced only once the platform has minted it (it exists
    // only after the first deploy), so pre-deploy local dev is not 403-walled.
    const expected = this.env.APP_IDENTITY_TOKEN
    const token = request.headers.get('x-tg-internal')
    if (expected && token !== expected) {
      return new Response('Forbidden', { status: 403 })
    }
    const body = (await request.json()) as { mode?: string; subjectId?: string }
    const mode = body.mode
    if (mode !== 'quick' && mode !== 'chaos' && mode !== 'ranked') {
      return Response.json({ error: 'bad mode' }, { status: 400 })
    }
    const subjectId = typeof body.subjectId === 'string' ? body.subjectId : 'anon:unknown'

    // Serialize allocation so concurrent joins share a room correctly.
    const result = await this.state.blockConcurrencyWhile(() => this.allocate(mode, subjectId))
    if (!result) return Response.json({ error: 'no pair available' }, { status: 503 })
    return Response.json(result)
  }

  private async allocate(
    mode: LiveMode,
    subjectId: string,
  ): Promise<{ roomId: string; pairId: string } | null> {
    const now = Date.now()
    const open = ((await this.state.storage.get('mm:open')) as OpenRoom[] | undefined) ?? []
    const live = open.filter((r) => now - r.createdAtMs < OPEN_ROOM_TTL_MS && r.assigned < r.cap)

    // Join an existing open room when possible.
    const join = live.find((r) => r.assigned < r.cap)
    if (join) {
      join.assigned += 1
      await this.state.storage.put('mm:open', live)
      return { roomId: join.roomId, pairId: join.pairId }
    }

    // Otherwise mint a fresh room.
    const pair = await this.pickPair(mode)
    if (!pair) return null
    const roomId = `${mode}:${crypto.randomUUID()}`
    const distances = await this.loadDistances(pair)
    // The real par lives in the server-only pairSolutions row (pairs.par is
    // neutered so clients can't read it); load it for the engine's progress math.
    const par = await this.loadPar(pair.recordId)
    // Quick AND Chaos fill with ghosts so a room is never empty (Chaos is
    // humans-only for OFFENSE — ghosts are immune — but they still keep the
    // rail lively when a second human has not arrived). Ranked stays pure.
    const ghosts = mode === 'quick' || mode === 'chaos' ? await this.pickGhosts(pair.recordId) : []

    const config: RoomConfig = {
      pairId: pair.recordId,
      mode,
      chaos: mode === 'chaos',
      startTitle: pair.data.startTitle,
      startPageId: pair.data.startPageId ?? null,
      targetTitle: pair.data.targetTitle,
      targetPageId: pair.data.targetPageId ?? null,
      par,
      allowStepBack: mode !== 'ranked',
      timeLimitSec: ROUND_CAP_SEC,
      ghosts,
      distances,
    }

    const configured = await this.configureGameRoom(roomId, config)
    if (!configured) return null

    // Best-effort durable room record (listing / history). Non-fatal.
    void createRecord(this.env, 'room', {
      code: shortCode(),
      hostSubjectId: subjectId,
      mode,
      pairId: pair.recordId,
      isCustomPair: 0,
      settings: {
        allowStepBack: config.allowStepBack,
        timeLimitSec: config.timeLimitSec,
        maxPlayers: capFor(mode),
        chaos: config.chaos,
      },
      status: 'lobby',
      createdAt: new Date().toISOString(),
    })

    live.push({ roomId, pairId: pair.recordId, assigned: 1, cap: capFor(mode), createdAtMs: now })
    await this.state.storage.put('mm:open', live)
    return { roomId, pairId: pair.recordId }
  }

  /** Pick a non-onboarding pair. Quick/Chaos prefer a pair with replayable
   *  ghosts so the room is never empty; ranked banding is the ranked seam. */
  private async pickPair(mode: LiveMode): Promise<{ recordId: string; data: PairRow } | null> {
    const rows = await queryRecords<PairRow>(this.env, 'pairs', { limit: 200 })
    const pool = rows.filter((r) => !r.data.isOnboarding)
    if (pool.length === 0) return null

    if (mode === 'quick' || mode === 'chaos') {
      const ghostable = await this.pairsWithReachedRuns()
      const candidates = pool.filter((p) => ghostable.has(p.recordId))
      if (candidates.length > 0) {
        const pick = candidates[Math.floor(Math.random() * candidates.length)]
        return { recordId: pick.recordId, data: pick.data }
      }
    }
    const pick = pool[Math.floor(Math.random() * pool.length)]
    return { recordId: pick.recordId, data: pick.data }
  }

  /** Distinct pairIds that have at least one reached, final run (a ghost
   *  source). Filtered client-side: `reachedTarget` is a boolean-interpreted
   *  (0/1) column and a `where` filter on it does not reliably match. */
  private async pairsWithReachedRuns(): Promise<Set<string>> {
    const rows = await queryRecords<{ pairId?: string; reachedTarget?: unknown; status?: string }>(
      this.env,
      'run',
      { orderBy: 'createdAt', orderDir: 'desc', limit: 200 },
    )
    const ids = new Set<string>()
    for (const r of rows) {
      if (r.data.status === 'final' && isReached(r.data.reachedTarget) && typeof r.data.pairId === 'string') {
        ids.add(r.data.pairId)
      }
    }
    return ids
  }

  /** Real par from the server-only pairSolutions row (pairs.par is neutered). */
  private async loadPar(pairId: string): Promise<number> {
    const r = await getRecord<{ par?: number }>(this.env, 'pairSolutions', pairId)
    return r && typeof r.data.par === 'number' ? r.data.par : 0
  }

  /** Load + normalize the reverse-BFS distance map for the pair's target. */
  private async loadDistances(pair: { recordId: string; data: PairRow }): Promise<Record<string, number>> {
    let raw: unknown = null
    if (pair.data.targetDistanceMapId) {
      const r = await getRecord<{ distances: unknown }>(
        this.env,
        'targetDistanceMaps',
        pair.data.targetDistanceMapId,
      )
      raw = r?.data.distances ?? null
    }
    if (!raw && pair.data.targetPageId != null) {
      const rows = await queryRecords<{ distances: unknown }>(this.env, 'targetDistanceMaps', {
        where: { targetPageId: pair.data.targetPageId },
        limit: 1,
      })
      raw = rows.length > 0 ? rows[0].data.distances : null
    }
    const parsed = parseDistances(raw)
    const normalized: Record<string, number> = {}
    for (const [title, dist] of Object.entries(parsed)) {
      normalized[normalizeTitleKey(title)] = dist
    }
    return normalized
  }

  /** Ghost fill: recent reached runs for this pair as pace cars. `reachedTarget`
   *  is filtered client-side (boolean-interpreted 0/1 column; a `where` on it is
   *  unreliable per the documented footgun). `pairId` is a plain-text filter. */
  private async pickGhosts(pairId: string): Promise<GhostSource[]> {
    const rows = await queryRecords<{
      path: unknown
      reachedTarget?: unknown
      status?: string
      subjectDisplayName?: string
      subjectEmoji?: string
    }>(this.env, 'run', {
      where: { pairId },
      orderBy: 'createdAt',
      orderDir: 'desc',
      limit: 50,
    })
    const reached = rows.filter((r) => r.data.status === 'final' && isReached(r.data.reachedTarget))
    const ghosts: GhostSource[] = []
    for (const r of reached.slice(0, Math.max(0, QUICK_RACE_TARGET - 1))) {
      const path = parsePath(r.data.path)
      if (path.length === 0) continue
      ghosts.push({
        ghostId: r.recordId,
        runId: r.recordId,
        displayName: r.data.subjectDisplayName || 'Ghost',
        emoji: r.data.subjectEmoji || '👻',
        path: path.map((e) => ({
          title: toCanonicalTitle(e.title),
          pageId: e.pageId ?? null,
          atMs: typeof e.atMs === 'number' ? e.atMs : 0,
        })),
      })
    }
    return ghosts
  }

  private async configureGameRoom(roomId: string, config: RoomConfig): Promise<boolean> {
    const stub = this.env.GAME_ROOMS.get(this.env.GAME_ROOMS.idFromName(roomId))
    try {
      const res = await stub.fetch(
        new Request('https://do/configure', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-tg-internal': this.env.APP_IDENTITY_TOKEN,
          },
          body: JSON.stringify({ roomId, config }),
        }),
      )
      return res.ok
    } catch {
      return false
    }
  }
}

/** Coerce a boolean-interpreted (0/1, true, "1") column value to a flag. */
function isReached(v: unknown): boolean {
  return v === 1 || v === true || v === '1'
}

function parseDistances(raw: unknown): Record<string, number> {
  let obj = raw
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw)
    } catch {
      return {}
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {}
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v
  }
  return out
}

function parsePath(raw: unknown): PathEntry[] {
  let arr = raw
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw)
    } catch {
      return []
    }
  }
  if (!Array.isArray(arr)) return []
  return arr.filter(
    (e): e is PathEntry => !!e && typeof e === 'object' && typeof (e as PathEntry).title === 'string',
  )
}
