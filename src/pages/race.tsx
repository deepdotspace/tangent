/**
 * Race — the single race screen for every mode (FINAL-SPEC 1, 2, 10). A mode
 * only changes the rules + HUD chrome. Async modes (Daily / Solo / Series) run
 * fewest-clicks via server actions; live modes (Quick / Chaos / Ranked /
 * Private) run race-to-arrive over a real AppGameRoom. Both prefer the live
 * server and fall back to the self-contained demo so the screen always works.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  LightScreen,
  LoadingBlock,
  ErrorBlock,
  Spinner,
  RaceStage,
  FinishView,
  Lobby,
  C,
  FONT,
  type LobbySeed,
  type RivalRow,
} from '../components/tangent'
import {
  useAsyncRace,
  useDailyChallenge,
  useMyStats,
  useJoinRoom,
  useLiveRoom,
  useDemoLiveRace,
  useRaceArticle,
  isLiveMode,
  dailyShareText,
  lineShareText,
  shareOrCopy,
  DEMO_DAILY,
  guestDisplayName,
  useGuestId,
  type Difficulty,
  type GameState,
  type LiveRace,
  type Mode,
} from '../game/client'

const VALID_MODES: Mode[] = ['daily', 'quick', 'chaos', 'ranked', 'series', 'private', 'solo']
const RIVAL_PALETTE = ['#16cfd6', '#ffce2e', '#8b5cf6', '#8df03a', '#ff5a3c', '#4b5cff']

interface ModeMeta {
  label: string
  color: string
  bg: string
}

const MODE_META: Record<Mode, ModeMeta> = {
  daily: { label: 'Daily', color: 'var(--pink)', bg: '#fbfcff' },
  quick: { label: 'Quick Race', color: 'var(--indigo)', bg: '#fbfcff' },
  chaos: { label: 'Chaos', color: 'var(--coral)', bg: 'linear-gradient(180deg,#fff4f1,#fbfcff 240px)' },
  ranked: { label: 'Ranked 1v1', color: 'var(--violet)', bg: '#fbfcff' },
  series: { label: 'Series', color: 'var(--cyan)', bg: '#fbfcff' },
  private: { label: 'Private room', color: '#b08400', bg: '#fbfcff' },
  solo: { label: 'Solo', color: '#5a9e1f', bg: '#fbfcff' },
}

export default function RacePage() {
  const [params] = useSearchParams()
  const raw = params.get('mode')
  const mode: Mode = (VALID_MODES.includes(raw as Mode) ? raw : 'daily') as Mode
  const difficulty = (params.get('difficulty') as Difficulty | null) ?? undefined
  const seriesId = params.get('seriesId') ?? undefined
  const pairId = params.get('pairId') ?? undefined
  const onboarding = params.get('onboarding') === '1'

  // Re-key per mode/params so a fresh navigation always starts a fresh race.
  const key = `${mode}:${difficulty ?? ''}:${seriesId ?? ''}:${pairId ?? ''}:${onboarding}`

  if (isLiveMode(mode)) {
    return <LiveRaceFlow key={key} mode={mode} />
  }
  return <AsyncRaceFlow key={key} mode={mode} difficulty={difficulty} seriesId={seriesId} pairId={pairId} onboarding={onboarding} />
}

// ─────────────────────────────────────────────────────────────────────────
// Async flow (Daily / Solo / Series)
// ─────────────────────────────────────────────────────────────────────────

function AsyncRaceFlow(props: { mode: Mode; difficulty?: Difficulty; seriesId?: string; pairId?: string; onboarding: boolean }) {
  const [runKey, setRunKey] = useState(0)
  return <AsyncRaceInner key={runKey} {...props} onRestart={() => setRunKey((k) => k + 1)} />
}

function AsyncRaceInner({
  mode,
  difficulty,
  seriesId,
  pairId,
  onboarding,
  onRestart,
}: {
  mode: Mode
  difficulty?: Difficulty
  seriesId?: string
  pairId?: string
  onboarding: boolean
  onRestart: () => void
}) {
  const navigate = useNavigate()
  const race = useAsyncRace({ mode, difficulty, seriesId, pairId, onboarding })
  const daily = useDailyChallenge()
  const stats = useMyStats()
  const [coach, setCoach] = useState(mode === 'daily' || onboarding)
  const [copied, setCopied] = useState(false)
  const [ghostProg, setGhostProg] = useState(6)

  const streak = stats.currentStreak
  const meta = MODE_META[mode]

  // A faint client par-ghost so the rail is alive on a solo line.
  useEffect(() => {
    if (race.phase !== 'racing') return
    const id = setInterval(() => setGhostProg((p) => Math.min(100, p + 7 + Math.random() * 8)), 950)
    return () => clearInterval(id)
  }, [race.phase])

  if (race.phase === 'starting') {
    return (
      <LightScreen style={{ display: 'grid', placeItems: 'center' }}>
        <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 460, padding: 20 }}>
          <LoadingBlock label="Finding today's line" />
        </div>
      </LightScreen>
    )
  }

  if (race.phase === 'error') {
    return (
      <LightScreen style={{ display: 'grid', placeItems: 'center' }}>
        <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 460, padding: 20 }}>
          <ErrorBlock
            title="Could not start the race"
            body="The line server did not answer. Check your connection and try again."
            onRetry={() => window.location.reload()}
          />
        </div>
      </LightScreen>
    )
  }

  if (race.phase === 'finished' && race.result) {
    const r = race.result
    const shareText =
      mode === 'daily'
        ? dailyShareText({ number: daily.number ?? DEMO_DAILY.number, start: race.startTitle, target: race.targetTitle, clicks: r.clicks, par: r.par, streak })
        : lineShareText(race.startTitle, race.targetTitle, r.clicks)
    return (
      <FinishView
        yourTitles={race.path}
        parTitles={race.parPath.length ? race.parPath : [race.startTitle, race.targetTitle]}
        clicks={r.clicks}
        par={r.par}
        reached={r.reached}
        shareText={shareText}
        shareLabel={copied ? 'Copied' : 'Share your line'}
        onCopyShare={async () => {
          await shareOrCopy(shareText)
          setCopied(true)
          setTimeout(() => setCopied(false), 1800)
        }}
        onRestart={onRestart}
        onHome={() => navigate('/home')}
        showDailyStats={mode === 'daily'}
        onDailyStats={() => navigate('/daily')}
      />
    )
  }

  const parForProgress = race.par || 4
  const youProgress = Math.min(100, Math.round((race.clicks / (parForProgress + 1)) * 100))
  const rivals: RivalRow[] = [
    { id: 'par-ghost', name: 'the par line', color: 'var(--indigo)', ghost: true, clicks: Math.round((ghostProg / 100) * parForProgress), progress: ghostProg },
  ]

  return (
    <RaceStage
      raceBg={meta.bg}
      modeLabel={meta.label}
      modeColor={meta.color}
      onBack={() => { race.forfeit(); navigate('/home') }}
      onGiveUp={() => { race.forfeit(); navigate('/home') }}
      start={race.startTitle}
      target={race.targetTitle}
      oneAway={race.oneAway}
      clicks={race.clicks}
      par={race.par}
      pathLen={race.path.length}
      startMs={race.startMs}
      running
      isChaos={false}
      charges={0}
      onPowerup={() => {}}
      article={race.article}
      onHop={(t) => { setCoach(false); race.hop(t) }}
      presenceLabel="On this line"
      youProgress={youProgress}
      rivals={rivals}
      showCoach={coach}
      onDismissCoach={() => setCoach(false)}
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Live flow (Quick / Chaos / Ranked / Private)
// ─────────────────────────────────────────────────────────────────────────

function LiveRaceFlow({ mode }: { mode: Mode }) {
  const navigate = useNavigate()
  const guestId = useGuestId()
  const join = useJoinRoom(mode)

  if (join.status === 'joining') {
    return (
      <Lobby
        mode={mode}
        phase="matching"
        countdown={3}
        title="Finding racers"
        sub={mode === 'ranked' ? 'Matching you by rating' : 'Pulling players into the room'}
        players={demoLobbySeeds(guestId)}
        onLeave={() => navigate('/home')}
      />
    )
  }
  if (join.status === 'joined' && join.roomId) {
    return <LiveRoomFlow roomId={join.roomId} mode={mode} />
  }
  if (join.status === 'demo') {
    return <DemoLiveFlow mode={mode} />
  }
  // The matchmaker failed and demo is not allowed (prod) — real error + retry.
  return (
    <LightScreen style={{ display: 'grid', placeItems: 'center' }}>
      <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 460, padding: 20 }}>
        <ErrorBlock
          title="Could not find a room"
          body="The matchmaker did not answer. Check your connection and try again."
          onRetry={() => window.location.reload()}
        />
      </div>
    </LightScreen>
  )
}

function LiveRoomFlow({ roomId, mode }: { roomId: string; mode: Mode }) {
  const live = useLiveRoom(roomId, mode)
  return <LiveStage live={live} mode={mode} />
}

function DemoLiveFlow({ mode }: { mode: Mode }) {
  const live = useDemoLiveRace(mode)
  return <LiveStage live={live} mode={mode} />
}

function LiveStage({ live, mode }: { live: LiveRace; mode: Mode }) {
  const navigate = useNavigate()
  const guestId = useGuestId()
  const state = live.state
  const meId = live.meId
  const meta = MODE_META[mode]

  const me = state.players[meId]
  const currentTitle = me?.currentTitle ?? state.startTitle ?? DEMO_DAILY.start
  const article = useRaceArticle(currentTitle, live.isDemo)

  const [myPath, setMyPath] = useState<string[]>([])
  const [startMs, setStartMs] = useState(0)
  const [finishMs, setFinishMs] = useState(0)
  const [copied, setCopied] = useState(false)

  // Seed the local line + clock when the gun fires.
  useEffect(() => {
    if (state.phase === 'racing' && myPath.length === 0 && state.startTitle) {
      setMyPath([state.startTitle])
      setStartMs(Date.now())
    }
  }, [state.phase, state.startTitle, myPath.length])

  // Freeze the player's race duration the moment the race ends (live finish copy
  // reports speed/placement, not a par).
  useEffect(() => {
    if (state.phase === 'finished' && startMs && !finishMs) setFinishMs(Date.now())
  }, [state.phase, startMs, finishMs])

  const onHop = (to: string) => {
    setMyPath((p) => (p.length ? [...p, to] : [state.startTitle ?? DEMO_DAILY.start, to]))
    live.navigate(currentTitle, to)
  }

  // A dropped or never-opened socket (also when the room DO is gone) freezes the
  // live stage on "Get ready"; surface a reconnecting state with an exit instead.
  if (!live.isDemo && !live.connected) {
    return (
      <LightScreen style={{ display: 'grid', placeItems: 'center' }}>
        <div style={{ position: 'relative', zIndex: 2, textAlign: 'center', padding: 24 }}>
          <Spinner size={56} />
          <div style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 22, color: C.ink, margin: '16px 0 6px' }}>Reconnecting</div>
          <div style={{ fontSize: 14, color: C.mute, maxWidth: 320, margin: '0 auto 18px', lineHeight: 1.5 }}>The connection to the room dropped. Trying to find it again.</div>
          <button
            onClick={() => navigate('/home')}
            className="tg-press"
            style={{ background: C.ink, color: '#fff', border: 'none', borderRadius: 30, padding: '11px 22px', fontFamily: FONT.ui, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
          >
            Leave race
          </button>
        </div>
      </LightScreen>
    )
  }

  // Lobby + countdown.
  if (state.phase === 'lobby' || state.phase === 'countdown') {
    return (
      <Lobby
        mode={mode}
        phase={state.phase === 'countdown' ? 'countdown' : 'matching'}
        countdown={state.countdown ?? 3}
        title="Get ready"
        sub="Both titles drop at GO"
        players={lobbySeedsFromState(state, guestId, meId)}
        onLeave={() => navigate('/home')}
      />
    )
  }

  // Finished — placement + line reveal + share.
  if (state.phase === 'finished') {
    const clicks = me?.clicks ?? Math.max(0, myPath.length - 1)
    const reached = me?.reached ?? state.winner === meId
    const won = state.winner === meId
    const start = state.startTitle ?? DEMO_DAILY.start
    const target = state.targetTitle ?? DEMO_DAILY.target
    const yourLine = myPath.length > 1 ? myPath : [start, target]
    const timeMs = finishMs && startMs ? finishMs - startMs : undefined
    const shareText = lineShareText(start, target, clicks)
    // Live races have no par (they are scored on speed/placement), so render the
    // placement variant: outcome headline, no fabricated par line or par copy.
    return (
      <FinishView
        yourTitles={yourLine}
        clicks={clicks}
        reached={reached}
        placement
        won={won}
        timeMs={timeMs}
        shareText={shareText}
        shareLabel={copied ? 'Copied' : 'Share your line'}
        onCopyShare={async () => {
          await shareOrCopy(shareText)
          setCopied(true)
          setTimeout(() => setCopied(false), 1800)
        }}
        onRestart={() => navigate(`/race?mode=${mode}`)}
        restartLabel="Rematch"
        onHome={() => navigate('/home')}
      />
    )
  }

  // Racing.
  const start = state.startTitle ?? DEMO_DAILY.start
  const target = state.targetTitle ?? DEMO_DAILY.target
  const rivals = rivalRowsFromState(state, meId)
  const youProgress = me?.progress ?? 0
  const clicks = me?.clicks ?? Math.max(0, myPath.length - 1)
  // Live races carry an authoritative oneAway per player; demo falls back to a
  // scan of the local article graph.
  const oneAway = me?.oneAway ?? (article.demo ? article.demo.paras.some((p) => p.some((s) => s.to === target)) : false)

  return (
    <RaceStage
      raceBg={meta.bg}
      modeLabel={meta.label}
      modeColor={meta.color}
      onBack={() => navigate('/home')}
      onGiveUp={() => navigate('/home')}
      start={start}
      target={target}
      oneAway={oneAway}
      clicks={clicks}
      par={live.isDemo ? DEMO_DAILY.par : 4}
      pathLen={myPath.length || clicks + 1}
      startMs={startMs || Date.now()}
      running
      isChaos={mode === 'chaos'}
      charges={me?.charges ?? 0}
      onPowerup={(ptype) => live.powerup(ptype)}
      article={article}
      onHop={onHop}
      presenceLabel={mode === 'ranked' ? 'Your opponent' : 'In this race'}
      youProgress={youProgress}
      rivals={rivals}
      showCoach={false}
      onDismissCoach={() => {}}
    />
  )
}

// ── helpers ──────────────────────────────────────────────────────────────

function rivalRowsFromState(state: GameState, meId: string): RivalRow[] {
  return Object.entries(state.players)
    .filter(([id]) => id !== meId)
    .map(([id, p], i) => ({
      id,
      name: p.displayName,
      color: RIVAL_PALETTE[i % RIVAL_PALETTE.length],
      ghost: !!p.isGhost,
      clicks: p.clicks,
      progress: p.progress,
    }))
}

function lobbySeedsFromState(state: GameState, guestId: string, meId: string): LobbySeed[] {
  const seeds: LobbySeed[] = [{ name: guestDisplayName(guestId), color: 'var(--pink)', emoji: '🟣' }]
  Object.entries(state.players)
    .filter(([id]) => id !== meId && id !== 'you')
    .forEach(([, p], i) => seeds.push({ name: p.displayName, color: RIVAL_PALETTE[i % RIVAL_PALETTE.length], emoji: p.emoji }))
  return seeds.slice(0, 5)
}

function demoLobbySeeds(guestId: string): LobbySeed[] {
  return [
    { name: guestDisplayName(guestId), color: 'var(--pink)', emoji: '🟣' },
    { name: 'mossfern', color: '#16cfd6', emoji: '🦦' },
    { name: 'qwerty_z', color: '#ffce2e', emoji: '⚡' },
    { name: 'st0rm', color: '#8df03a', emoji: '🌩' },
  ]
}
