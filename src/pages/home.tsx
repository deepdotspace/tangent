/**
 * Home — the anonymous front door (no signup wall). Today's Daily is the hero:
 * the two endpoint titles bookend a faint unsolved tangent line, the live
 * ribbon proves it is alive, and the mode grid opens every way to play.
 */

import { useNavigate } from 'react-router-dom'
import { LightScreen, TopBar, ActivityRibbon, DailyHero, ModeGrid, type TickerItem } from '../components/tangent'
import {
  DEMO_DAILY,
  useDailyChallenge,
  useTicker,
  useLiveCount,
  useIdentity,
  useMyRuns,
  useMyStats,
  type Mode,
} from '../game/client'

export default function HomePage() {
  const navigate = useNavigate()
  const identity = useIdentity()
  const daily = useDailyChallenge()
  const { items } = useTicker()
  const liveCount = useLiveCount()
  const myRuns = useMyRuns(identity.id)

  const streak = useMyStats().currentStreak
  const neverPlayed = myRuns.status === 'ready' && myRuns.rows.length === 0

  // Real daily when fully resolved; otherwise the demo line keeps the hero alive.
  const hasRealDaily = daily.start != null && daily.target != null && daily.number != null
  const number = hasRealDaily ? (daily.number as number) : DEMO_DAILY.number
  const start = hasRealDaily ? (daily.start as string) : DEMO_DAILY.start
  const target = hasRealDaily ? (daily.target as string) : DEMO_DAILY.target

  const ticker: TickerItem[] = items.length
    ? items
    : [{ who: 'Tangent', text: 'be the first to find the line today' }]

  function playDaily() {
    navigate(neverPlayed ? '/onboarding' : '/race?mode=daily')
  }

  function onSelectMode(id: Mode | 'solo') {
    if (id === 'series') return navigate('/series')
    if (id === 'solo') return navigate('/solo')
    navigate(`/race?mode=${id}`)
  }

  return (
    <LightScreen>
      <TopBar streak={streak} onLeaderboard={() => navigate('/leaderboard')} onProfile={() => navigate('/profile')} />
      <ActivityRibbon liveCount={liveCount} ticker={ticker} />
      <DailyHero number={number} start={start} target={target} streak={streak} onPlay={playDaily} />
      <ModeGrid onSelect={onSelectMode} />
    </LightScreen>
  )
}
