/**
 * Live-race engine — the pure, server-authoritative race logic that the
 * AppGameRoom DO drives each tick (spec/7 + spec/1 + spec/5 + spec/6 + §6).
 *
 * Everything here is deterministic and side-effect-free: it mutates a
 * `TgGameState` and returns the IO the DO must perform (article freezes), so
 * the move gate, first-arrival adjudication, ghost replay, chaos netcode, and
 * cap ranking are all unit-testable without a Durable Object or a socket.
 *
 * Two authoritative-clock facts thread through:
 *  - the clock is the DO TICK COUNTER, never Date.now (spec/7 §4 hero invariant);
 *  - same-tick arrivals are ordered by input-buffer index = true server-arrival
 *    order, and `winner` is set ONCE and never overwritten (spec/7 §5).
 */

import type { GameInput } from 'deepspace/worker'
import { normalizeTitleKey, toCanonicalTitle } from '../server/article-pipeline'
import {
  COUNTDOWN_SEC,
  ROUND_CAP_SEC,
  TICK_RATE,
  CHAOS_CARDS,
  CHAOS_CAST_COST,
  CHAOS_CLICKS_PER_CHARGE,
  CHAOS_MAX_CHARGES,
  CHAOS_CLEAR_AIR_SEC,
  type ChaosCardId,
} from './constants'
import type {
  TgGameState,
  TgPlayer,
  LiveMode,
  RoomConfig,
  PathEntry,
  GhostSource,
} from './types'

// ── Engine context (server-side, never broadcast) ────────────────────────

export interface FreezeRequest {
  title: string
  /** Set when a player's move is waiting on this destination's allowed-set. */
  subjectId?: string
  moveTick?: number
  moveBufferIndex?: number
}

export interface EngineCtx {
  config: RoomConfig
  tickRate: number
  /** normalizedTitle -> frozen allowed normalized-title set (anti-cheat snapshot). */
  snapshots: Map<string, Set<string>>
  /** normalizedTitle -> resolved pageId (reach equality). */
  pageIds: Map<string, number | null>
  /** subjectId -> authoritative per-hop path (mirrors run.path[]). */
  paths: Map<string, PathEntry[]>
  /** subjectId -> last accepted seq (replay guard). */
  lastSeq: Map<string, number>
  /** subjectId -> chaos charges already spent. */
  chargesSpent: Map<string, number>
  /** subjectId -> tick until which they are immune to chaos offense. */
  immuneUntil: Map<string, number>
  /** subjectIds who forfeited (treated as done; DNF at finalize). */
  forfeited: Set<string>
  /** ghostId -> recorded timeline. */
  ghostSources: Map<string, GhostSource>
  /** navigates deferred because the from-snapshot was not ready (re-run next tick). */
  deferred: GameInput[]
  /** flips true once enterRacing has revealed the pair + seeded positions. */
  revealed: boolean
}

export interface TickResult {
  ended: boolean
  reason?: 'reach' | 'cap' | 'all'
  freezes: FreezeRequest[]
}

// ── Construction ──────────────────────────────────────────────────────────

export function newEngineCtx(config: RoomConfig): EngineCtx {
  const ghostSources = new Map<string, GhostSource>()
  for (const g of config.ghosts) ghostSources.set(`ghost:${g.ghostId}`, g)
  return {
    config,
    tickRate: TICK_RATE,
    snapshots: new Map(),
    pageIds: new Map(),
    paths: new Map(),
    lastSeq: new Map(),
    chargesSpent: new Map(),
    immuneUntil: new Map(),
    forfeited: new Set(),
    ghostSources,
    deferred: [],
    revealed: false,
  }
}

export function seedLobbyState(config: RoomConfig, mode: LiveMode): TgGameState {
  return {
    phase: 'lobby',
    pairId: null,
    startTitle: null,
    targetTitle: null,
    targetPageId: null,
    timeLimitSec: config.timeLimitSec || ROUND_CAP_SEC,
    mode,
    chaos: config.chaos,
    tick: 0,
    startedAtTick: null,
    winner: null,
    finishOrder: [],
    players: {},
    ghosts: {},
  }
}

export function freshPlayer(displayName: string, emoji: string, chaos: boolean): TgPlayer {
  const p: TgPlayer = {
    displayName,
    emoji,
    isGhost: false,
    currentTitle: null,
    clicks: 0,
    reached: false,
    finishedAtTick: null,
    connState: 'live',
    progress: 0,
    remainingDist: null,
    oneAway: false,
    lastRejected: null,
  }
  if (chaos) {
    p.charges = 0
    p.activeEffects = []
    p.bubble = false
  }
  return p
}

// ── Clock + distance helpers ──────────────────────────────────────────────

export function raceClockMs(state: TgGameState, tick: number, tickRate: number): number {
  if (state.startedAtTick == null) return 0
  return Math.max(0, (tick - state.startedAtTick) * (1000 / tickRate))
}

function distOf(titleKey: string, ctx: EngineCtx): number | null {
  const d = ctx.config.distances[titleKey]
  return typeof d === 'number' ? d : null
}

function startDist(ctx: EngineCtx): number {
  const d = distOf(normalizeTitleKey(ctx.config.startTitle), ctx)
  return d != null && d > 0 ? d : ctx.config.par || 1
}

function progressOf(player: TgPlayer, ctx: EngineCtx): number {
  if (player.reached) return 100
  const total = startDist(ctx)
  const rem = player.remainingDist
  if (rem != null && total > 0) {
    return Math.max(0, Math.min(99, Math.round((100 * (total - rem)) / total)))
  }
  return Math.min(player.clicks * 8, 80)
}

// ── Lifecycle transitions ─────────────────────────────────────────────────

export function enterCountdown(state: TgGameState, currentTick: number, tickRate: number): void {
  state.phase = 'countdown'
  state.startedAtTick = currentTick + COUNTDOWN_SEC * tickRate
}

/** At GO: reveal the pair (anti-spoiler until now) and seed every racer at start. */
function enterRacing(state: TgGameState, ctx: EngineCtx, freezes: FreezeRequest[]): void {
  state.phase = 'racing'
  state.pairId = ctx.config.pairId
  state.startTitle = ctx.config.startTitle
  state.targetTitle = ctx.config.targetTitle
  state.targetPageId = ctx.config.targetPageId
  const startTitle = toCanonicalTitle(ctx.config.startTitle)
  const startKey = normalizeTitleKey(startTitle)
  const sDist = startDist(ctx)
  for (const [subjectId, p] of Object.entries(state.players)) {
    if (p.isGhost) continue
    p.currentTitle = startTitle
    p.remainingDist = sDist
    p.oneAway = sDist === 1
    p.progress = 0
    ctx.paths.set(subjectId, [{ title: startTitle, pageId: ctx.config.startPageId, atMs: 0 }])
    ctx.lastSeq.set(subjectId, -1)
  }
  for (const [ghostId, src] of ctx.ghostSources) {
    state.ghosts[ghostId] = seedGhost(src, ctx)
  }
  ctx.pageIds.set(startKey, ctx.config.startPageId)
  ctx.revealed = true
  freezes.push({ title: ctx.config.startTitle })
}

function seedGhost(src: GhostSource, ctx: EngineCtx): TgPlayer {
  const first = src.path[0]
  const title = first ? first.title : null
  const g: TgPlayer = {
    displayName: src.displayName,
    emoji: src.emoji,
    isGhost: true,
    currentTitle: title,
    clicks: 0,
    reached: false,
    finishedAtTick: null,
    connState: 'live',
    progress: 0,
    remainingDist: title ? distOf(normalizeTitleKey(title), ctx) : null,
    oneAway: false,
  }
  return g
}

/** Seed (or re-seed) a connecting human at the current race position. */
export function seedJoiningPlayer(
  state: TgGameState,
  ctx: EngineCtx,
  subjectId: string,
  displayName: string,
  emoji: string,
): void {
  const existing = state.players[subjectId]
  if (existing) {
    existing.connState = 'live'
    if (displayName) existing.displayName = displayName
    return
  }
  const p = freshPlayer(displayName, emoji, state.chaos)
  if (state.phase === 'racing') {
    const startTitle = toCanonicalTitle(ctx.config.startTitle)
    p.currentTitle = startTitle
    p.remainingDist = startDist(ctx)
    p.oneAway = p.remainingDist === 1
    ctx.paths.set(subjectId, [{ title: startTitle, pageId: ctx.config.startPageId, atMs: 0 }])
    ctx.lastSeq.set(subjectId, -1)
  }
  state.players[subjectId] = p
}

// ── The tick ──────────────────────────────────────────────────────────────

export function applyTick(
  state: TgGameState,
  rawInputs: GameInput[],
  tick: number,
  ctx: EngineCtx,
): TickResult {
  const freezes: FreezeRequest[] = []
  state.tick = tick

  if (state.phase === 'countdown' && state.startedAtTick != null && tick >= state.startedAtTick) {
    enterRacing(state, ctx, freezes)
  }
  if (state.phase !== 'racing') {
    return { ended: false, freezes }
  }

  // Deferred navigates (waiting on a snapshot) run first, in original order.
  const deferred = ctx.deferred
  ctx.deferred = []
  const inputs = [...deferred, ...rawInputs]

  let bufferIndex = -1
  for (const input of inputs) {
    bufferIndex += 1
    switch (input.action) {
      case 'navigate':
        handleNavigate(state, input, tick, bufferIndex, ctx, freezes)
        break
      case 'reset':
        handleReset(state, input, tick, ctx, freezes)
        break
      case 'stepback':
        handleStepBack(state, input, tick, ctx)
        break
      case 'powerup':
        handlePowerup(state, input, tick, ctx)
        break
      case 'forfeit':
        handleForfeit(state, input, ctx)
        break
      case 'profile':
        handleProfile(state, input)
        break
      default:
        break
    }
  }

  replayGhosts(state, tick, ctx)
  if (state.chaos) expireEffects(state, tick)

  // End conditions: cap, or every human reached/forfeited.
  const elapsedSec = raceClockMs(state, tick, ctx.tickRate) / 1000
  const humans = Object.entries(state.players).filter(([, p]) => !p.isGhost)
  const allDone =
    humans.length > 0 && humans.every(([id, p]) => p.reached || ctx.forfeited.has(id))

  if (elapsedSec >= state.timeLimitSec) {
    finalizeFinishOrder(state, ctx)
    state.phase = 'finished'
    return { ended: true, reason: 'cap', freezes }
  }
  if (allDone) {
    finalizeFinishOrder(state, ctx)
    state.phase = 'finished'
    return { ended: true, reason: 'all', freezes }
  }
  return { ended: false, freezes }
}

function reject(player: TgPlayer, seq: number, toTitle: string, reason: string): void {
  player.lastRejected = { seq, toTitle, reason }
}

function appendPath(ctx: EngineCtx, subjectId: string, entry: PathEntry): void {
  const path = ctx.paths.get(subjectId) ?? []
  path.push(entry)
  ctx.paths.set(subjectId, path)
}

function setReached(
  state: TgGameState,
  ctx: EngineCtx,
  subjectId: string,
  tick: number,
  bufferIndex: number,
  isGhost = false,
): void {
  const slice = isGhost ? state.ghosts[subjectId] : state.players[subjectId]
  if (!slice || slice.reached) return
  slice.reached = true
  slice.finishedAtTick = tick
  slice.progress = 100
  slice.remainingDist = 0
  slice.oneAway = false
  state.finishOrder.push({
    subjectId,
    tick,
    bufferIndex,
    reached: true,
    clicks: slice.clicks,
    isGhost,
  })
  // winner is set ONCE, in buffer order (spec/7 §5).
  if (state.winner == null) state.winner = subjectId
}

function handleNavigate(
  state: TgGameState,
  input: GameInput,
  tick: number,
  bufferIndex: number,
  ctx: EngineCtx,
  freezes: FreezeRequest[],
): void {
  const subjectId = input.userId
  const player = state.players[subjectId]
  if (!player || player.isGhost || player.connState !== 'live' || player.reached) return

  const data = input.data as { seq?: number; fromTitle?: string; toTitle?: string }
  const fromTitle = typeof data.fromTitle === 'string' ? data.fromTitle : ''
  const toTitle = typeof data.toTitle === 'string' ? data.toTitle : ''
  const seq = typeof data.seq === 'number' ? data.seq : -1
  if (!fromTitle || !toTitle) return

  const lastSeq = ctx.lastSeq.get(subjectId) ?? -1
  const curKey = normalizeTitleKey(player.currentTitle ?? '')
  if (seq <= lastSeq) {
    reject(player, seq, toTitle, 'STALE_MOVE')
    return
  }
  // We deliberately do NOT require the client's fromTitle to equal the server's
  // current title. A clicked link can be a REDIRECT whose raw title differs from
  // the canonical the server resolved into currentTitle; requiring exact equality
  // desynced the run on the first redirect hop and rejected every later move (the
  // same bug already fixed in the async gate). The origin is ALWAYS the server's
  // own authoritative current article (curKey) and the move is validated against
  // ITS frozen allowed-set, so a teleport is still impossible. `seq` guards replay.

  const fromSet = ctx.snapshots.get(curKey)
  if (!fromSet) {
    // From-article not frozen yet — defer (never reject a legitimate move on a
    // cold snapshot; B13: defer only THIS player's move, never the room). Re-kick
    // the freeze so a snapshot that failed or expired is re-fetched, instead of
    // deferring this move forever (kickFreeze dedupes via pendingFreezes).
    ctx.deferred.push(input)
    if (player.currentTitle) freezes.push({ title: player.currentTitle })
    return
  }
  if (!fromSet.has(normalizeTitleKey(toTitle))) {
    reject(player, seq, toTitle, 'ILLEGAL_MOVE')
    return
  }

  // ACCEPT
  ctx.lastSeq.set(subjectId, seq)
  player.lastRejected = null
  const atMs = raceClockMs(state, tick, ctx.tickRate)
  const targetKey = normalizeTitleKey(ctx.config.targetTitle)

  if (normalizeTitleKey(toTitle) === targetKey) {
    // Synchronous reach by title (the common competitive finish) — adjudicated
    // in buffer order this very tick, so the hero invariant holds exactly.
    const canonTarget = toCanonicalTitle(ctx.config.targetTitle)
    appendPath(ctx, subjectId, { title: canonTarget, pageId: ctx.config.targetPageId, atMs })
    player.clicks += 1
    player.currentTitle = canonTarget
    if (state.chaos) recomputeCharges(state, ctx, subjectId)
    setReached(state, ctx, subjectId, tick, bufferIndex)
    return
  }

  const canonTo = toCanonicalTitle(toTitle)
  appendPath(ctx, subjectId, { title: canonTo, pageId: null, atMs })
  player.clicks += 1
  player.currentTitle = canonTo
  player.remainingDist = distOf(normalizeTitleKey(toTitle), ctx)
  player.oneAway = player.remainingDist === 1
  player.progress = progressOf(player, ctx)
  if (state.chaos) recomputeCharges(state, ctx, subjectId)
  // Async: fetch+freeze the destination's allowed-set; reach via redirect is
  // confirmed when that resolves (applyFreeze).
  freezes.push({ title: toTitle, subjectId, moveTick: tick, moveBufferIndex: bufferIndex })
}

/** Back-to-start: always available, costs 1 click, resets path to start. */
function handleReset(
  state: TgGameState,
  input: GameInput,
  tick: number,
  ctx: EngineCtx,
  _freezes: FreezeRequest[],
): void {
  const subjectId = input.userId
  const player = state.players[subjectId]
  if (!player || player.isGhost || player.connState !== 'live' || player.reached) return
  const startTitle = toCanonicalTitle(ctx.config.startTitle)
  if (normalizeTitleKey(player.currentTitle ?? '') === normalizeTitleKey(startTitle)) return // no-op at start
  const atMs = raceClockMs(state, tick, ctx.tickRate)
  appendPath(ctx, subjectId, { title: startTitle, pageId: ctx.config.startPageId, atMs })
  player.clicks += 1
  player.currentTitle = startTitle
  player.remainingDist = startDist(ctx)
  player.oneAway = player.remainingDist === 1
  player.progress = progressOf(player, ctx)
  if (state.chaos) recomputeCharges(state, ctx, subjectId)
}

/** Step-back (undo one hop): costs 1 click; gated by allowStepBack. */
function handleStepBack(
  state: TgGameState,
  input: GameInput,
  tick: number,
  ctx: EngineCtx,
): void {
  if (!ctx.config.allowStepBack) return
  const subjectId = input.userId
  const player = state.players[subjectId]
  if (!player || player.isGhost || player.connState !== 'live' || player.reached) return
  const path = ctx.paths.get(subjectId) ?? []
  // Find the previous DISTINCT article (skip involuntary markers).
  const voluntary = path.filter((e) => !e.involuntary)
  if (voluntary.length < 2) return
  const prev = voluntary[voluntary.length - 2]
  const atMs = raceClockMs(state, tick, ctx.tickRate)
  appendPath(ctx, subjectId, { title: prev.title, pageId: prev.pageId, atMs })
  player.clicks += 1
  player.currentTitle = prev.title
  player.remainingDist = distOf(normalizeTitleKey(prev.title), ctx)
  player.oneAway = player.remainingDist === 1
  player.progress = progressOf(player, ctx)
  if (state.chaos) recomputeCharges(state, ctx, subjectId)
}

function handleForfeit(state: TgGameState, input: GameInput, ctx: EngineCtx): void {
  const player = state.players[input.userId]
  if (!player || player.isGhost) return
  ctx.forfeited.add(input.userId)
  player.connState = 'dropped'
}

function handleProfile(state: TgGameState, input: GameInput): void {
  const player = state.players[input.userId]
  if (!player) return
  const data = input.data as { displayName?: string; emoji?: string }
  if (typeof data.displayName === 'string' && data.displayName) player.displayName = data.displayName
  if (typeof data.emoji === 'string' && data.emoji) player.emoji = data.emoji
}

// ── Async freeze confirmation (called by the DO when getArticle resolves) ──

export function applyFreeze(
  state: TgGameState,
  ctx: EngineCtx,
  fr: FreezeRequest,
  article: { pageId: number | null; canonicalTitle: string; allowedTitles: Set<string> },
  tick: number,
): void {
  const clickedKey = normalizeTitleKey(fr.title)
  const canonKey = normalizeTitleKey(article.canonicalTitle || fr.title)
  ctx.snapshots.set(clickedKey, article.allowedTitles)
  ctx.snapshots.set(canonKey, article.allowedTitles)
  ctx.pageIds.set(clickedKey, article.pageId)
  ctx.pageIds.set(canonKey, article.pageId)

  if (!fr.subjectId) return
  const player = state.players[fr.subjectId]
  if (!player || player.isGhost || player.reached) return
  // A freeze can resolve AFTER the race ended (the cap fired while this fetch was
  // in flight). Never mutate a finished race: the durable run is already written,
  // and a late reach here would disagree with the recorded result.
  if (state.phase !== 'racing') return

  // Resolve the canonical title (redirect-aware) the player actually landed on.
  if (article.canonicalTitle) player.currentTitle = toCanonicalTitle(article.canonicalTitle)
  const last = (ctx.paths.get(fr.subjectId) ?? []).at(-1)
  if (last) {
    last.pageId = article.pageId
    if (article.canonicalTitle) last.title = toCanonicalTitle(article.canonicalTitle)
  }
  player.remainingDist = distOf(canonKey, ctx)
  player.oneAway = player.remainingDist === 1

  const reached =
    article.pageId != null &&
    ctx.config.targetPageId != null &&
    article.pageId === ctx.config.targetPageId
  if (reached) {
    // Mark the reach using the TRUE arrival tick + buffer index of the move (not
    // this freeze-resolution tick, which is inflated by fetch latency). The race
    // ENDS on the next onTick (one unified end path: applyTick sets phase=finished,
    // builds the cap finishOrder, and signals run-writes). The authoritative winner
    // is re-resolved from these arrival keys at finalize (resolveWinnerByArrival).
    setReached(state, ctx, fr.subjectId, fr.moveTick ?? tick, fr.moveBufferIndex ?? 9000)
    return
  }
  player.progress = progressOf(player, ctx)
}

// ── Ghosts ────────────────────────────────────────────────────────────────

function replayGhosts(state: TgGameState, tick: number, ctx: EngineCtx): void {
  const clockMs = raceClockMs(state, tick, ctx.tickRate)
  for (const [ghostId, src] of ctx.ghostSources) {
    const g = state.ghosts[ghostId]
    if (!g) continue
    let idx = 0
    for (let k = 0; k < src.path.length; k++) {
      if (src.path[k].atMs <= clockMs) idx = k
      else break
    }
    const entry = src.path[idx]
    g.currentTitle = entry.title
    g.clicks = idx
    g.remainingDist = distOf(normalizeTitleKey(entry.title), ctx)
    g.oneAway = g.remainingDist === 1
    const atFinal = idx === src.path.length - 1
    const reachedNow =
      atFinal && entry.pageId != null && ctx.config.targetPageId != null && entry.pageId === ctx.config.targetPageId
    if (!g.reached && reachedNow) {
      g.reached = true
      g.finishedAtTick = tick
      g.progress = 100
      g.remainingDist = 0
      g.oneAway = false
      state.finishOrder.push({ subjectId: ghostId, tick, bufferIndex: 9999, reached: true, clicks: idx, isGhost: true })
      if (state.winner == null) state.winner = ghostId
    } else if (!g.reached) {
      // A ghost replays a recorded path, so its honest progress is how far
      // along that path it is — smooth even when no distance map is present.
      const total = src.path.length - 1
      g.progress = total > 0 ? Math.max(0, Math.min(98, Math.round((idx / total) * 100))) : progressOf(g, ctx)
    }
  }
}

// ── Chaos ───────────────────────────────────────────────────────────────────

function recomputeCharges(state: TgGameState, ctx: EngineCtx, subjectId: string): void {
  const player = state.players[subjectId]
  if (!player) return
  const earned = Math.floor(player.clicks / CHAOS_CLICKS_PER_CHARGE)
  const spent = ctx.chargesSpent.get(subjectId) ?? 0
  player.charges = Math.max(0, Math.min(CHAOS_MAX_CHARGES, earned - spent))
}

function pushEffect(
  player: TgPlayer,
  type: ChaosCardId,
  by: string,
  untilTick: number,
  target?: string,
): void {
  player.activeEffects = player.activeEffects ?? []
  player.activeEffects.push({ type, by, untilTick, ...(target ? { target } : {}) })
}

function autoTargetLeader(state: TgGameState, ctx: EngineCtx, casterId: string): string | null {
  let best: string | null = null
  let bestDist = Infinity
  let bestClicks = Infinity
  for (const [id, p] of Object.entries(state.players)) {
    if (id === casterId || p.isGhost || p.reached || p.connState !== 'live') continue
    const d = p.remainingDist ?? Infinity
    if (d < bestDist || (d === bestDist && p.clicks < bestClicks)) {
      best = id
      bestDist = d
      bestClicks = p.clicks
    }
  }
  return best
}

function handlePowerup(state: TgGameState, input: GameInput, tick: number, ctx: EngineCtx): void {
  if (!state.chaos) return
  const caster = state.players[input.userId]
  if (!caster || caster.isGhost || caster.reached || caster.connState !== 'live') return

  const data = input.data as { ptype?: string; target?: string }
  const card = CHAOS_CARDS.find((c) => c.id === data.ptype)
  if (!card) return

  recomputeCharges(state, ctx, input.userId)
  if ((caster.charges ?? 0) < CHAOS_CAST_COST) return

  const until = tick + card.durationSec * ctx.tickRate
  // Spend only when the cast actually commits, so a whiffed offense (no valid /
  // immune target) does NOT burn a charge. Self-cast cards always commit.
  const spend = (): void => {
    ctx.chargesSpent.set(input.userId, (ctx.chargesSpent.get(input.userId) ?? 0) + CHAOS_CAST_COST)
    recomputeCharges(state, ctx, input.userId)
  }

  if (card.id === 'bubble') {
    spend()
    caster.bubble = true
    pushEffect(caster, 'bubble', input.userId, until)
    return
  }
  if (card.id === 'peek') {
    spend()
    const peekTarget = typeof data.target === 'string' ? data.target : undefined
    pushEffect(caster, 'peek', input.userId, until, peekTarget)
    return
  }

  // Offense: resolve + fully validate the target BEFORE spending.
  let targetId = typeof data.target === 'string' ? data.target : null
  if (!targetId) targetId = autoTargetLeader(state, ctx, input.userId)
  if (!targetId) return
  const target = state.players[targetId]
  if (!target || target.isGhost || target.reached || target.connState !== 'live') return
  // Anti-grief: immune while an effect is active or during clear-air.
  if ((ctx.immuneUntil.get(targetId) ?? 0) > tick) return
  if ((target.activeEffects ?? []).some((e) => e.type !== 'peek')) return

  // Committed: this cast will either land or be bubble-blocked. Both consume it.
  spend()
  // Bubble blocks the next incoming offense, then pops.
  if (target.bubble) {
    target.bubble = false
    target.activeEffects = (target.activeEffects ?? []).filter((e) => e.type !== 'bubble')
    ctx.immuneUntil.set(targetId, tick + CHAOS_CLEAR_AIR_SEC * ctx.tickRate)
    return
  }

  if (card.id === 'boomerang') {
    boomerang(state, ctx, targetId, tick)
  } else {
    pushEffect(target, card.id, input.userId, until)
  }
  ctx.immuneUntil.set(targetId, until + CHAOS_CLEAR_AIR_SEC * ctx.tickRate)
}

function boomerang(state: TgGameState, ctx: EngineCtx, targetId: string, tick: number): void {
  const target = state.players[targetId]
  const path = ctx.paths.get(targetId) ?? []
  const voluntary = path.filter((e) => !e.involuntary)
  if (!target || voluntary.length < 2) return
  const prev = voluntary[voluntary.length - 2]
  const atMs = raceClockMs(state, tick, ctx.tickRate)
  appendPath(ctx, targetId, { title: prev.title, pageId: prev.pageId, atMs, involuntary: true })
  // involuntary: no click added to score (spec/6), progress recedes.
  target.currentTitle = prev.title
  target.remainingDist = distOf(normalizeTitleKey(prev.title), ctx)
  target.oneAway = target.remainingDist === 1
  target.progress = progressOf(target, ctx)
}

function expireEffects(state: TgGameState, tick: number): void {
  for (const p of Object.values(state.players)) {
    if (!p.activeEffects || p.activeEffects.length === 0) continue
    const before = p.activeEffects.length
    p.activeEffects = p.activeEffects.filter((e) => e.untilTick > tick)
    if (p.activeEffects.length !== before) {
      p.bubble = p.activeEffects.some((e) => e.type === 'bubble')
    }
  }
}

// ── Cap ranking (closest-to-target PRIMARY, fewest-clicks TIEBREAK; B2/R2) ──

/**
 * Authoritative winner = the EARLIEST reached arrival by (tick, bufferIndex), not
 * whoever's article freeze happened to confirm first. The greedy set-once during
 * the race is only a live-display hint; an async (redirect/pageId) reach can
 * confirm out of buffer order, so the true winner is re-resolved here at finalize.
 */
function resolveWinnerByArrival(state: TgGameState): void {
  let best: { subjectId: string; tick: number; bufferIndex: number } | null = null
  for (const f of state.finishOrder) {
    if (!f.reached) continue
    if (
      best == null ||
      f.tick < best.tick ||
      (f.tick === best.tick && f.bufferIndex < best.bufferIndex)
    ) {
      best = { subjectId: f.subjectId, tick: f.tick, bufferIndex: f.bufferIndex }
    }
  }
  if (best) state.winner = best.subjectId
}

export function finalizeFinishOrder(state: TgGameState, ctx: EngineCtx): void {
  resolveWinnerByArrival(state)
  const inOrder = new Set(state.finishOrder.map((f) => f.subjectId))
  const remaining: Array<{ id: string; slice: TgPlayer; isGhost: boolean }> = []
  for (const [id, p] of Object.entries(state.players)) {
    if (!inOrder.has(id)) remaining.push({ id, slice: p, isGhost: false })
  }
  for (const [id, g] of Object.entries(state.ghosts)) {
    if (!inOrder.has(id)) remaining.push({ id, slice: g, isGhost: true })
  }
  remaining.sort((a, b) => {
    const da = a.slice.remainingDist ?? Number.MAX_SAFE_INTEGER
    const db = b.slice.remainingDist ?? Number.MAX_SAFE_INTEGER
    if (da !== db) return da - db // closest first (B2 primary)
    if (a.slice.clicks !== b.slice.clicks) return a.slice.clicks - b.slice.clicks // fewest clicks tiebreak
    return b.slice.progress - a.slice.progress
  })
  for (const r of remaining) {
    state.finishOrder.push({
      subjectId: r.id,
      tick: state.tick,
      bufferIndex: 10000,
      reached: false,
      clicks: r.slice.clicks,
      isGhost: r.isGhost,
    })
  }
}
