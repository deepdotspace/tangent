/**
 * useAsyncRace — drives a Daily / Solo / Series run (fewest clicks, no DO).
 *
 * Prefers the real server actions (startAsyncRace / submitAsyncMove /
 * finishAsyncRace / forfeitAsyncRace) and the /api/article render endpoint.
 * When those are not callable yet it falls back to the self-contained demo
 * engine so the screen stays fully playable. The orchestrator swaps in the
 * live path with zero UI changes once the server answers.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useGuestId } from './guest'
import { invokeAction, fetchArticle } from './actionClient'
import {
  DEMO_DAILY,
  DEMO_ONBOARDING,
  demoOneAway,
  demoPairFor,
  getDemoArticle,
  type DemoArticle,
  type DemoDaily,
} from './demo'
import type {
  Difficulty,
  FinishAsyncRaceResult,
  Mode,
  StartAsyncRaceResult,
  SubmitAsyncMoveResult,
} from './types'

export type AsyncPhase = 'starting' | 'racing' | 'finished' | 'error'

export interface AsyncRaceOptions {
  mode: Mode
  difficulty?: Difficulty
  seriesId?: string
  pairId?: string
  onboarding?: boolean
}

export interface AsyncArticle {
  title: string
  cat: string
  html?: string
  demo?: DemoArticle
  loading: boolean
}

export interface AsyncRace {
  phase: AsyncPhase
  isDemo: boolean
  runId: string | null
  startTitle: string
  targetTitle: string
  par: number
  currentTitle: string
  clicks: number
  path: string[]
  oneAway: boolean
  article: AsyncArticle
  startMs: number
  result: FinishAsyncRaceResult | null
  parPath: string[]
  hop: (title: string) => void
  forfeit: () => void
}

function pickDemoPair(opts: AsyncRaceOptions): DemoDaily {
  if (opts.onboarding) return DEMO_ONBOARDING
  if (opts.mode === 'solo') return demoPairFor(opts.difficulty)
  return DEMO_DAILY
}

export function useAsyncRace(opts: AsyncRaceOptions): AsyncRace {
  const guestId = useGuestId()
  const startedRef = useRef(false)
  const hopInFlightRef = useRef(false)

  const [phase, setPhase] = useState<AsyncPhase>('starting')
  const [isDemo, setIsDemo] = useState(false)
  const [runId, setRunId] = useState<string | null>(null)
  const [startTitle, setStartTitle] = useState('')
  const [targetTitle, setTargetTitle] = useState('')
  const [par, setPar] = useState(0)
  const [parPath, setParPath] = useState<string[]>([])
  const [currentTitle, setCurrentTitle] = useState('')
  const [path, setPath] = useState<string[]>([])
  const [oneAway, setOneAway] = useState(false)
  const [startMs, setStartMs] = useState(0)
  const [result, setResult] = useState<FinishAsyncRaceResult | null>(null)
  const [article, setArticle] = useState<AsyncArticle>({
    title: '', cat: '', loading: true,
  })

  const isDemoRef = useRef(false)

  // Load an article body (real served HTML, else the demo graph).
  const loadArticle = useCallback(async (title: string, demoMode: boolean) => {
    setArticle((a) => ({ ...a, title, loading: true }))
    if (!demoMode) {
      const real = await fetchArticle(title, guestId)
      if (real) {
        setArticle({ title: real.canonicalTitle, cat: 'Wikipedia', html: real.servedHtml, loading: false })
        return
      }
    }
    const demo = getDemoArticle(title)
    setArticle({ title, cat: demo.cat, demo, loading: false })
  }, [guestId])

  // Start the run once.
  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    let cancelled = false

    ;(async () => {
      const res = await invokeAction<StartAsyncRaceResult>('startAsyncRace', {
        mode: opts.mode,
        difficulty: opts.difficulty,
        seriesId: opts.seriesId,
        pairId: opts.pairId,
        onboarding: opts.onboarding,
      }, guestId)

      if (cancelled) return

      if (res.ok && res.data && res.data.startTitle && res.data.targetTitle) {
        isDemoRef.current = false
        setIsDemo(false)
        setRunId(res.data.runId)
        setStartTitle(res.data.startTitle)
        setTargetTitle(res.data.targetTitle)
        setCurrentTitle(res.data.startTitle)
        setPath([res.data.startTitle])
        setStartMs(Date.now())
        setPhase('racing')
        void loadArticle(res.data.startTitle, false)
        return
      }

      // The live call failed. Outside DEV / ?demo, the demo engine would mask a
      // real prod outage, so surface an error the page can retry instead.
      const allowDemo = import.meta.env.DEV || new URLSearchParams(window.location.search).has('demo')
      if (!allowDemo) {
        setPhase('error')
        return
      }

      // Demo fallback — fully playable (DEV / opt-in only).
      const pair = pickDemoPair(opts)
      isDemoRef.current = true
      setIsDemo(true)
      setRunId(`demo:${Date.now()}`)
      setStartTitle(pair.start)
      setTargetTitle(pair.target)
      setPar(pair.par)
      setParPath(pair.parPath)
      setCurrentTitle(pair.start)
      setPath([pair.start])
      setStartMs(Date.now())
      setPhase('racing')
      const demo = getDemoArticle(pair.start)
      setOneAway(demoOneAway(demo, pair.target))
      void loadArticle(pair.start, true)
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const finish = useCallback(async (finalPath: string[], demoMode: boolean) => {
    const clicks = finalPath.length - 1
    if (!demoMode && runId && !runId.startsWith('demo:')) {
      const res = await invokeAction<FinishAsyncRaceResult>('finishAsyncRace', { runId }, guestId)
      if (res.ok && res.data) {
        setPar(res.data.par)
        setParPath(res.data.examplePaths?.[0]?.map((n) => n.title) ?? [])
        setResult(res.data)
        setPhase('finished')
        return
      }
    }
    // Demo finish.
    const pair = pickDemoPair(opts)
    const beatPar = clicks <= pair.par
    setResult({
      clicks,
      par: pair.par,
      examplePaths: [pair.parPath.map((title) => ({ title }))],
      reached: true,
      beatPar,
    })
    setPar(pair.par)
    setParPath(pair.parPath)
    setPhase('finished')
  }, [runId, guestId])

  const hop = useCallback((to: string) => {
    if (phase !== 'racing') return
    // Ignore further link clicks while a server move is reconciling, so a fast
    // second click cannot send a stale fromTitle and get silently dropped.
    if (hopInFlightRef.current) return
    const demoMode = isDemoRef.current
    const from = currentTitle
    // seq is the count of moves ALREADY made (= current clicks), which the server
    // asserts equals its own click count as a replay guard. The first move from
    // the start article is seq 0, so derive it from the confirmed path length.
    const seq = path.length - 1
    const nextPath = [...path, to]
    setPath(nextPath)
    setCurrentTitle(to)

    if (!demoMode && runId && !runId.startsWith('demo:')) {
      // Lock input and show the read pane as loading until the server reconciles
      // this hop; the skeleton disables links so the next move cannot race ahead.
      hopInFlightRef.current = true
      setArticle((a) => ({ ...a, loading: true }))
      void (async () => {
        const res = await invokeAction<SubmitAsyncMoveResult>('submitAsyncMove', {
          runId, fromTitle: from, toTitle: to, seq,
        }, guestId)
        hopInFlightRef.current = false
        if (res.ok && res.data && res.data.ok) {
          setOneAway(res.data.oneAway)
          if (res.data.reached) {
            void finish(nextPath, false)
          } else {
            // Reconcile to the server's AUTHORITATIVE canonical title: the link we
            // clicked may have been a redirect, so the resolved article title can
            // differ from `to`. Without this the next move's origin would not match
            // the server's current article and every later move would be rejected.
            const serverTitle = res.data.currentTitle ?? to
            setCurrentTitle(serverTitle)
            setPath((p) => {
              if (!p.length) return p
              const np = [...p]
              np[np.length - 1] = serverTitle
              return np
            })
            void loadArticle(serverTitle, false)
          }
        } else {
          // Rejected move (illegal / stale) — keep the player where they were.
          setPath(path)
          setCurrentTitle(from)
          setArticle((a) => ({ ...a, loading: false }))
        }
      })()
      return
    }

    // Demo hop.
    if (to === targetTitle) {
      void finish(nextPath, true)
      return
    }
    const demo = getDemoArticle(to)
    setOneAway(demoOneAway(demo, targetTitle))
    void loadArticle(to, true)
  }, [phase, currentTitle, path, runId, guestId, targetTitle, finish, loadArticle])

  const forfeit = useCallback(() => {
    if (runId && !runId.startsWith('demo:')) {
      void invokeAction('forfeitAsyncRace', { runId }, guestId)
    }
  }, [runId, guestId])

  return {
    phase,
    isDemo,
    runId,
    startTitle,
    targetTitle,
    par,
    currentTitle,
    clicks: Math.max(0, path.length - 1),
    path,
    oneAway,
    article,
    startMs,
    result,
    parPath,
    hop,
    forfeit,
  }
}
