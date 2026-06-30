/** FinishView — the climax. Confetti, the headline, the line reveal, the share. */

import { C, FONT } from './primitives'
import { Confetti, LineReveal, ShareCard } from './FinishParts'
import { formatClock } from '../../game/client'

export interface FinishViewProps {
  yourTitles: string[]
  clicks: number
  reached: boolean
  shareText: string
  shareLabel: string
  onCopyShare: () => void
  onRestart: () => void
  onHome: () => void
  // Par (async: Daily / Solo / Series) variant — a real par from the finish result.
  par?: number
  parTitles?: string[]
  // Placement (live: Quick / Chaos / Ranked) variant — speed/placement, no par.
  placement?: boolean
  won?: boolean
  timeMs?: number
  showDailyStats?: boolean
  onDailyStats?: () => void
  restartLabel?: string
}

interface Copy {
  kicker: string
  headline: string
  sub: string
  wash: string
  confetti: number
}

function resolveCopy(clicks: number, par: number, reached: boolean): Copy {
  if (!reached) {
    return {
      kicker: 'The clock won',
      headline: 'The line got away.',
      sub: 'One link short when it mattered. The page was right there. Run it back.',
      wash: '#e7ebff',
      confetti: 0,
    }
  }
  const beatPar = clicks <= par
  const matchPar = clicks === par
  if (beatPar) {
    return {
      kicker: 'Find the line · cleared',
      headline: matchPar ? 'You nailed the par.' : 'Shorter than par.',
      sub: matchPar
        ? `Connected in ${clicks}. The shortest line was ${par}. You found it dead on.`
        : `Connected in ${clicks}. Even the par line needed ${par}. Show off.`,
      wash: '#dff7d6',
      confetti: 60,
    }
  }
  const over = clicks - par
  return {
    kicker: 'Find the line · cleared',
    headline: `Connected in ${clicks}.`,
    sub: `The shortest line was ${par}. ${over === 1 ? 'One hop off. So close it stings.' : `You wandered ${over} hops wide. The line was hiding.`}`,
    wash: '#ffe3ef',
    confetti: over <= 1 ? 30 : 0,
  }
}

/** Live finish copy — placement and speed, never a par. */
function resolvePlacementCopy(clicks: number, reached: boolean, won: boolean, timeMs?: number): Copy {
  const hops = `${clicks} ${clicks === 1 ? 'hop' : 'hops'}`
  const time = timeMs ? ` · ${formatClock(timeMs)}` : ''
  if (!reached) {
    return {
      kicker: 'Race over',
      headline: 'They got there first.',
      sub: `The race ended while you were still on the line. You made it ${hops}.`,
      wash: '#e7ebff',
      confetti: 0,
    }
  }
  if (won) {
    return {
      kicker: 'First to arrive',
      headline: 'You took it.',
      sub: `First to the target in ${hops}${time}. Fastest in the room.`,
      wash: '#dff7d6',
      confetti: 60,
    }
  }
  return {
    kicker: 'Line connected',
    headline: 'You finished.',
    sub: `You connected it in ${hops}${time}. Just off the top spot.`,
    wash: '#ffe3ef',
    confetti: 24,
  }
}

export function FinishView(props: FinishViewProps) {
  const {
    yourTitles, parTitles, clicks, par, reached,
    shareText, shareLabel, onCopyShare, onRestart, onHome,
    showDailyStats, onDailyStats, restartLabel = 'Run it again',
    placement, won, timeMs,
  } = props
  const copy = placement
    ? resolvePlacementCopy(clicks, reached, !!won, timeMs)
    : resolveCopy(clicks, par ?? 0, reached)

  return (
    <div style={{ minHeight: '100vh', background: `radial-gradient(120% 80% at 50% -10%,${copy.wash},var(--bg) 60%)`, position: 'relative', overflow: 'hidden', padding: 'clamp(20px,5vw,40px)' }}>
      <Confetti count={copy.confetti} />
      <div style={{ maxWidth: 760, margin: '0 auto', position: 'relative', zIndex: 2, textAlign: 'center' }}>
        <div style={{ fontFamily: FONT.mono, fontSize: 12, letterSpacing: '.2em', textTransform: 'uppercase', color: C.mute, marginTop: 10 }}>{copy.kicker}</div>
        <h1 style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 'clamp(44px,11vw,104px)', lineHeight: 0.92, letterSpacing: '-.03em', margin: '6px 0 0', color: C.ink }}>{copy.headline}</h1>
        <p style={{ fontSize: 'clamp(16px,3vw,21px)', color: '#3a3860', maxWidth: 440, margin: '14px auto 0', lineHeight: 1.45 }}>{copy.sub}</p>

        <LineReveal yourTitles={yourTitles} parTitles={parTitles ?? []} yourClicks={clicks} parClicks={par ?? 0} hidePar={!!placement} />

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginTop: 22 }}>
          <ShareCard text={shareText} />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginTop: 12 }}>
          <button onClick={onCopyShare} className="tg-press" style={btn(C.lime, C.ink)}>{shareLabel}</button>
          <button onClick={onRestart} className="tg-press" style={btn(C.pink, '#fff')}>{restartLabel}</button>
          {showDailyStats && onDailyStats ? (
            <button onClick={onDailyStats} className="tg-press" style={{ ...btn('#fff', C.ink), boxShadow: `inset 0 0 0 1.5px ${C.hairline}` }}>Daily stats</button>
          ) : null}
          <button onClick={onHome} className="tg-press" style={{ background: 'none', border: 'none', color: C.mute, fontFamily: FONT.ui, fontWeight: 600, fontSize: 14, padding: 14, cursor: 'pointer' }}>Home</button>
        </div>
      </div>
    </div>
  )
}

function btn(bg: string, color: string) {
  return {
    background: bg,
    color,
    border: 'none',
    fontFamily: FONT.display,
    fontWeight: 700,
    fontSize: 16,
    padding: '14px 24px',
    borderRadius: 14,
    cursor: 'pointer',
  } as const
}
