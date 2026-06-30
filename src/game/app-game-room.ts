/**
 * TangentGameRoom — the live race Durable Object (spec/7).
 *
 * One DO per race, addressed by roomId via `idFromName(roomId)`. Authoritative
 * state lives in `gameState` (broadcast every GAME_TICK at 6 Hz); the heavy
 * server-only data (per-article frozen allowed-sets, full paths, the reverse-
 * BFS distance map) lives off `gameState` so the fan-out stays small.
 *
 * The matchmaker CONFIGURES the room (pair, ghosts, distance map) via an
 * internal `POST /configure` before any client connects, so the target is
 * server-chosen and hidden until GO (anti-spoiler). Clients then connect with
 * `useGameRoom(roomId)`; movement, adjudication, chaos, and run-writes are all
 * server-authoritative — the client is never trusted for identity/moves/timing.
 */

import { GameRoom, MSG } from 'deepspace/worker'
import type { GameInput, Player } from 'deepspace/worker'
import { TICK_RATE, ROOM_MIN, ROOM_MAX, ROUND_CAP_SEC } from './constants'
import {
  newEngineCtx,
  seedLobbyState,
  seedJoiningPlayer,
  enterCountdown,
  applyTick,
  applyFreeze,
  type EngineCtx,
  type FreezeRequest,
} from './engine'
import type { RoomConfig, TgGameState, PathEntry } from './types'
import { getArticle, type ArticlePipelineEnv } from '../server/article-pipeline'
import { createRecord, type RecordStoreEnv } from '../server/record-store'
import { settleRankedMatch } from '../actions/ranked'

/** Env the game DO needs: article pipeline + record store + the internal token. */
export interface GameRoomEnv extends ArticlePipelineEnv, RecordStoreEnv {
  APP_IDENTITY_TOKEN: string
}

interface StoredConfig {
  roomId: string
  config: RoomConfig
}

export class TangentGameRoom extends GameRoom<GameRoomEnv> {
  private tgConfig: RoomConfig | null = null
  private tgCtx: EngineCtx | null = null
  private tgRoomId = ''
  private tgEnded = false
  private pendingFreezes = new Set<string>()

  constructor(state: DurableObjectState, env: GameRoomEnv) {
    super(state, env, { tickRate: TICK_RATE, minPlayers: ROOM_MIN, maxPlayers: ROOM_MAX })
    // Re-hydrate config (and the finished flag) so a re-awoken DO does not
    // double-write runs or lose its pair.
    void this.state.blockConcurrencyWhile(async () => {
      const stored = (await this.state.storage.get('tg:config')) as StoredConfig | undefined
      if (stored) {
        this.tgRoomId = stored.roomId
        this.tgConfig = stored.config
        this.tgCtx = newEngineCtx(stored.config)
        this.tgCtx.tickRate = TICK_RATE
      }
      this.tgEnded = ((await this.state.storage.get('tg:ended')) as boolean) === true
    })
  }

  // ── Internal configure (matchmaker → DO, never the client) ───────────────

  protected async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (request.method === 'POST' && url.pathname.endsWith('/configure')) {
      // This route is only reachable via a DO stub fetch (matchmaker -> this DO),
      // never from a public worker route, so it is internal/trusted. The token is
      // defense-in-depth and is only ENFORCED when the platform has minted it
      // (APP_IDENTITY_TOKEN exists only after the first deploy). Pre-deploy local
      // dev has no token, so skip the check there rather than 403 every room.
      const expected = this.env.APP_IDENTITY_TOKEN
      const token = request.headers.get('x-tg-internal')
      if (expected && token !== expected) {
        return new Response('Forbidden', { status: 403 })
      }
      const body = (await request.json()) as StoredConfig
      // Idempotent: never reconfigure a room that already has a pair.
      if (!this.tgConfig) {
        this.tgRoomId = body.roomId
        this.tgConfig = body.config
        this.tgCtx = newEngineCtx(body.config)
        this.tgCtx.tickRate = TICK_RATE
        await this.state.storage.put('tg:config', body)
      }
      return Response.json({ ok: true })
    }
    return new Response('Not found', { status: 404 })
  }

  // ── Lobby seeding ────────────────────────────────────────────────────────

  private ensureLobbySeeded(): void {
    if (!this.tgConfig) return
    const state = this.getGameState() as Partial<TgGameState>
    if (!state.phase) {
      this.setGameState(seedLobbyState(this.tgConfig, this.tgConfig.mode) as unknown as Record<string, unknown>)
    }
  }

  private syncState(): void {
    this.broadcast({
      type: MSG.GAME_TICK,
      payload: { state: this.getGameState(), tick: this.getCurrentTick() },
    })
  }

  protected onPlayerJoin(player: Player): void {
    if (!this.tgConfig || !this.tgCtx) return
    this.ensureLobbySeeded()
    const state = this.getGameState() as unknown as TgGameState
    seedJoiningPlayer(state, this.tgCtx, player.userId, player.userName || 'Racer', '')
    this.setGameState(state as unknown as Record<string, unknown>)
    this.syncState()
  }

  protected onPlayerLeave(player: Player): void {
    const state = this.getGameState() as unknown as TgGameState
    const p = state.players?.[player.userId]
    if (p) {
      p.connState = 'dropped'
      this.setGameState(state as unknown as Record<string, unknown>)
      this.syncState()
    }
  }

  // ── Lifecycle: countdown begins when the loop starts ─────────────────────

  protected onGameStart(): void {
    if (!this.tgConfig || !this.tgCtx) return
    const state = this.getGameState() as unknown as TgGameState
    if (state.phase === 'lobby') {
      enterCountdown(state, this.getCurrentTick(), TICK_RATE)
      this.setGameState(state as unknown as Record<string, unknown>)
      // Pre-warm the start article during the countdown so the first move
      // validates from a warm snapshot (B13).
      this.kickFreeze({ title: this.tgConfig.startTitle })
    }
  }

  // ── The authoritative tick (never awaits KV) ─────────────────────────────

  protected async onTick(
    state: Record<string, unknown>,
    inputs: GameInput[],
    tick: number,
  ): Promise<Record<string, unknown> | undefined> {
    if (this.tgEnded || !this.tgConfig || !this.tgCtx) return undefined
    const gs = state as unknown as TgGameState
    const result = applyTick(gs, inputs, tick, this.tgCtx)
    for (const fr of result.freezes) this.kickFreeze(fr)
    // AWAIT finalize (the SDK awaits onTick's returned promise) so the durable
    // run-writes + ranked settle complete while the isolate is still alive. A
    // floated finalize could be dropped if the DO is evicted right after the tick
    // returns. Best-effort: finalize sets tg:ended first so it never re-runs, and
    // a throw here must not break the SDK loop.
    if (result.ended) {
      try {
        await this.finalizeRace(gs)
      } catch {
        // run-writes use allSettled and the ranked settle is already guarded;
        // swallow so a write hiccup never crashes the final tick.
      }
    }
    return state
  }

  // ── Article freeze (fire-and-forget; resolves on a later tick) ───────────

  private kickFreeze(fr: FreezeRequest): void {
    if (!this.tgCtx) return
    const key = `${fr.subjectId ?? ''}|${fr.title}`
    if (this.pendingFreezes.has(key)) return
    this.pendingFreezes.add(key)
    void getArticle(this.env, fr.title)
      .then((article) => {
        if (!this.tgCtx) return
        const gs = this.getGameState() as unknown as TgGameState
        applyFreeze(
          gs,
          this.tgCtx,
          fr,
          {
            pageId: article.pageId,
            canonicalTitle: article.canonicalTitle,
            allowedTitles: article.allowedTitles,
          },
          this.getCurrentTick(),
        )
        // The reach (if any) is picked up + finalized by the next onTick, which
        // is the single race-ending path (sets phase, finishOrder, writes runs).
        this.setGameState(gs as unknown as Record<string, unknown>)
      })
      .catch(() => {
        // Article load failed: leave the snapshot cold. The player can retry or
        // use Back-to-start; the room is never blocked (per-player failure, B7).
      })
      .finally(() => this.pendingFreezes.delete(key))
  }

  // ── Finalize: write a durable run per human (ghosts already have runs) ───

  private async finalizeRace(state: TgGameState): Promise<void> {
    if (this.tgEnded || !this.tgConfig || !this.tgCtx) return
    this.tgEnded = true
    await this.state.storage.put('tg:ended', true)

    const config = this.tgConfig
    const ctx = this.tgCtx
    const finishedAt = new Date().toISOString()

    const writes: Array<Promise<unknown>> = []
    for (const [subjectId, p] of Object.entries(state.players)) {
      if (p.isGhost) continue
      const path: PathEntry[] = ctx.paths.get(subjectId) ?? []
      const forfeited = ctx.forfeited.has(subjectId)
      const outcome = forfeited ? 'forfeit' : p.reached ? 'reached' : 'dnf'
      const timeMs = p.reached && p.finishedAtTick != null
        ? Math.max(0, (p.finishedAtTick - (state.startedAtTick ?? 0)) * (1000 / TICK_RATE))
        : (config.timeLimitSec || ROUND_CAP_SEC) * 1000
      writes.push(
        createRecord(this.env, 'run', {
          subjectId,
          subjectDisplayName: p.displayName,
          subjectEmoji: p.emoji,
          isGuest: subjectId.startsWith('anon:') ? 1 : 0,
          context: config.mode,
          pairId: config.pairId,
          roomId: this.tgRoomId,
          path,
          clicks: p.clicks,
          timeMs,
          reachedTarget: p.reached ? 1 : 0,
          outcome,
          status: 'final',
          parAtPlay: config.par,
          finishedAt,
        }),
      )
    }
    await Promise.allSettled(writes)

    // Ranked: settle Glicko-2 from the authoritative result (humans-only, 1v1,
    // SPEED win). Server-authoritative — the DO is the only caller. Best-effort:
    // a settle failure never breaks finalize (runs are already written).
    if (config.mode === 'ranked') {
      const humans = Object.entries(state.players).filter(([, p]) => !p.isGhost)
      try {
        await settleRankedMatch(this.env, {
          roomId: this.tgRoomId,
          pairId: config.pairId,
          players: humans.map(([subjectId, p]) => ({
            subjectId,
            reached: p.reached,
            finishedAtTick: p.finishedAtTick,
            clicks: p.clicks,
            forfeited: ctx.forfeited.has(subjectId),
          })),
        })
      } catch {
        // rating update is non-fatal; the rankedMatch row simply is not written.
      }
    }
  }

  // onGameEnd fires when all sockets close or a client sends GAME_END; cover
  // the path where the race ends by attrition rather than reach/cap.
  protected onGameEnd(finalState: Record<string, unknown>): void {
    if (this.tgEnded) return
    void this.finalizeRace(finalState as unknown as TgGameState)
  }
}
