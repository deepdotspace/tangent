/**
 * Live race (Quick / Chaos / Ranked) — true WebSocket rooms via AppGameRoom.
 *
 * Flow: joinQuickRace({mode}) -> {roomId}, then useGameRoom(roomId). Presence,
 * lobby, countdown, and finish are all driven by the authoritative gameState.
 * Moves go over sendInput('navigate', {seq, fromTitle, toTitle}); chaos casts
 * over sendInput('powerup', {ptype, target?}).
 *
 * `useDemoLiveRace` produces the SAME GameState shape locally so the live
 * screens are demonstrable before the matchmaker/DO is callable. Both feed one
 * GameState-driven race stage.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth, useGameRoom } from 'deepspace'
import { useGuestId, guestDisplayName } from './guest'
import { invokeAction } from './actionClient'
import { COUNTDOWN_SEC, TICK_RATE } from '../constants'
import type { TgGameState, TgPlayer } from '../types'
import {
  DEMO_DAILY,
  advanceDemoRivals,
  getDemoArticle,
  makeDemoRivals,
  type DemoDaily,
} from './demo'
import type {
  ChaosEffect,
  GameState,
  JoinQuickRaceResult,
  LivePlayer,
  Mode,
} from './types'

/** Project the authoritative server slice (TgPlayer) onto the client LivePlayer. */
function toLivePlayer(p: TgPlayer): LivePlayer {
  return {
    displayName: p.displayName,
    emoji: p.emoji,
    isGhost: p.isGhost,
    currentTitle: p.currentTitle ?? undefined,
    clicks: p.clicks,
    reached: p.reached,
    progress: p.progress,
    oneAway: p.oneAway,
    charges: p.charges,
    activeEffects: p.activeEffects?.map((e) => e.type) as ChaosEffect[] | undefined,
    bubble: p.bubble,
  }
}

export type JoinStatus = 'joining' | 'joined' | 'demo' | 'error'

export interface JoinState {
  status: JoinStatus
  roomId: string | null
  error: string | null
}

/** Resolve a live room for a mode. Falls to demo if the matchmaker is unreachable. */
export function useJoinRoom(mode: Mode): JoinState {
  const guestId = useGuestId()
  const [state, setState] = useState<JoinState>({ status: 'joining', roomId: null, error: null })
  const onceRef = useRef(false)

  useEffect(() => {
    if (onceRef.current) return
    onceRef.current = true
    let cancelled = false
    // A short visible "finding racers" beat before resolving.
    const minDelay = new Promise<void>((r) => setTimeout(r, 1400))
    ;(async () => {
      const res = await invokeAction<JoinQuickRaceResult>('joinQuickRace', { mode }, guestId)
      await minDelay
      if (cancelled) return
      if (res.ok && res.data?.roomId) {
        setState({ status: 'joined', roomId: res.data.roomId, error: null })
      } else {
        // Outside DEV / ?demo the local demo room would mask a real matchmaker
        // outage, so surface an error the page can retry instead.
        const allowDemo = import.meta.env.DEV || new URLSearchParams(window.location.search).has('demo')
        if (allowDemo) {
          setState({ status: 'demo', roomId: null, error: res.ok ? null : res.error })
        } else {
          setState({ status: 'error', roomId: null, error: res.ok ? 'No room available' : res.error })
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [mode, guestId])

  return state
}

export interface LiveRace {
  state: GameState
  meId: string
  connected: boolean
  canWrite: boolean
  isDemo: boolean
  navigate: (fromTitle: string, toTitle: string) => void
  powerup: (ptype: ChaosEffect, target?: string) => void
}

/** Real live room — maps useGameRoom to the typed GameState. */
export function useLiveRoom(roomId: string, mode: Mode): LiveRace {
  const guestId = useGuestId()
  const { isSignedIn, userId } = useAuth()
  const room = useGameRoom(roomId)
  const seqRef = useRef(0)

  // Identity must match the key the worker route assigns on the DO socket: the
  // verified JWT subject when signed in, else a stable `anon:<guestId>` guest.
  const meId = isSignedIn && userId ? userId : `anon:${guestId}`

  // ── Start handshake (the lobby-stuck fix) ──────────────────────────────
  // A GameRoom only begins its tick loop (firing onGameStart -> enterCountdown)
  // when a client signals readiness. We declare ready as soon as we have write
  // access; with minPlayers:1 the SDK auto-starts (checkAutoStart), and a second
  // human readying brings the auto-start to both. Idempotent + harmless if the
  // race is already running (late join). Re-armed on reconnect.
  const readiedRef = useRef(false)
  useEffect(() => {
    if (!room.connected) {
      readiedRef.current = false
      return
    }
    if (room.canWrite && !readiedRef.current) {
      readiedRef.current = true
      room.setReady()
    }
    // room.setReady identity tracks canWrite; primitives are the real triggers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.connected, room.canWrite])

  const state = useMemo<GameState>(() => {
    const raw = room.state as Partial<TgGameState> | undefined
    const tick = raw?.tick ?? room.tick

    // Merge humans + ghosts into one presence map (ghosts ride the same rail).
    const players: Record<string, LivePlayer> = {}
    for (const [id, p] of Object.entries(raw?.players ?? {})) players[id] = toLivePlayer(p)
    for (const [id, g] of Object.entries(raw?.ghosts ?? {})) players[id] = toLivePlayer(g)

    // Countdown number is derived from the authoritative tick clock; the server
    // broadcasts startedAtTick, not a 3-2-1 integer.
    let countdown: number | undefined
    if (raw?.phase === 'countdown' && typeof raw?.startedAtTick === 'number') {
      countdown = Math.max(0, Math.ceil((raw.startedAtTick - tick) / TICK_RATE))
    } else if (raw?.phase === 'countdown') {
      countdown = COUNTDOWN_SEC
    }

    return {
      phase: raw?.phase ?? 'lobby',
      startTitle: raw?.startTitle ?? undefined,
      targetTitle: raw?.targetTitle ?? undefined,
      timeLimitSec: raw?.timeLimitSec,
      mode: (raw?.mode as Mode | undefined) ?? mode,
      chaos: raw?.chaos ?? mode === 'chaos',
      tick,
      countdown,
      winner: raw?.winner ?? null,
      finishOrder: (raw?.finishOrder ?? []).map((f) => f.subjectId),
      players,
    }
  }, [room.state, room.tick, mode])

  const navigate = useCallback((fromTitle: string, toTitle: string) => {
    seqRef.current += 1
    room.sendInput('navigate', { seq: seqRef.current, fromTitle, toTitle })
  }, [room])

  const powerup = useCallback((ptype: ChaosEffect, target?: string) => {
    room.sendInput('powerup', { ptype, target })
  }, [room])

  return {
    state,
    meId,
    connected: room.connected,
    canWrite: room.canWrite,
    isDemo: false,
    navigate,
    powerup,
  }
}

/** Demo live room — a local simulation matching the GameState contract. */
export function useDemoLiveRace(mode: Mode, pair: DemoDaily = DEMO_DAILY): LiveRace {
  const guestId = useGuestId()
  const meId = 'you'
  const [phase, setPhase] = useState<GameState['phase']>('countdown')
  const [countdown, setCountdown] = useState(3)
  const [tick, setTick] = useState(0)
  const [winner, setWinner] = useState<string | null>(null)
  const [me, setMe] = useState<LivePlayer>({
    displayName: guestDisplayName(guestId),
    emoji: '🟣',
    clicks: 0,
    progress: 0,
    reached: false,
    charges: mode === 'chaos' ? 1 : undefined,
  })
  const [rivals, setRivals] = useState<Record<string, LivePlayer>>(() => makeDemoRivals(mode))

  // Countdown 3 -> 2 -> 1 -> GO, then race.
  useEffect(() => {
    if (phase !== 'countdown') return
    if (countdown <= 0) {
      const t = setTimeout(() => setPhase('racing'), 600)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 800)
    return () => clearTimeout(t)
  }, [phase, countdown])

  // Rivals advance + a tick counter while racing.
  useEffect(() => {
    if (phase !== 'racing') return
    const tk = setInterval(() => setTick((t) => t + 1), 1000)
    const riv = setInterval(() => {
      setRivals((r) => advanceDemoRivals(r, pair.par))
    }, 850)
    return () => {
      clearInterval(tk)
      clearInterval(riv)
    }
  }, [phase, pair.par])

  // A rival who reaches first becomes the winner (unless you already won).
  useEffect(() => {
    if (phase !== 'racing' || winner) return
    const done = Object.entries(rivals).find(([, r]) => r.reached)
    if (done) setWinner(done[0])
  }, [rivals, phase, winner])

  const navigate = useCallback((_from: string, to: string) => {
    setMe((m) => {
      if (m.reached) return m
      const clicks = m.clicks + 1
      const reached = to === pair.target
      const progress = reached ? 100 : Math.min(96, Math.round((clicks / (pair.par + 1)) * 100))
      return { ...m, clicks, currentTitle: to, progress, reached }
    })
    if (to === pair.target) {
      setWinner((w) => w ?? meId)
      setTimeout(() => setPhase('finished'), 700)
    }
  }, [pair.target, pair.par])

  const powerup = useCallback((_ptype: ChaosEffect, _target?: string) => {
    setMe((m) => (m.charges && m.charges > 0 ? { ...m, charges: m.charges - 1 } : m))
  }, [])

  const players = useMemo<Record<string, LivePlayer>>(() => ({ [meId]: me, ...rivals }), [me, rivals])

  const state: GameState = {
    phase,
    startTitle: pair.start,
    targetTitle: pair.target,
    timeLimitSec: 180,
    mode,
    chaos: mode === 'chaos',
    tick,
    countdown,
    winner,
    finishOrder: winner ? [winner] : [],
    players,
  }

  return { state, meId, connected: true, canWrite: true, isDemo: true, navigate, powerup }
}

/** The demo article current-title for the "you" player (used by the demo stage). */
export function demoCurrentArticle(state: GameState, meId: string): string {
  return state.players[meId]?.currentTitle ?? state.startTitle ?? DEMO_DAILY.start
}

export { getDemoArticle }
