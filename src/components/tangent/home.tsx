/** Home screen parts: top bar, live activity ribbon, daily hero, mode grid. */

import { C, FONT, Logo, Wordmark, PrimaryButton } from './primitives'
import type { Mode } from '../../game/client'

export interface TickerItem {
  who: string
  text: string
}

export function TopBar({
  streak,
  onLeaderboard,
  onProfile,
}: {
  streak: number
  onLeaderboard: () => void
  onProfile: () => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '24px clamp(20px,5vw,64px)',
        position: 'relative',
        zIndex: 3,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <Logo />
        <Wordmark />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={onLeaderboard}
          className="tg-press"
          style={{ background: 'none', border: 'none', fontFamily: FONT.ui, fontWeight: 600, fontSize: 15, color: C.mute, cursor: 'pointer', padding: '9px 12px', borderRadius: 10 }}
        >
          Leaderboard
        </button>
        <button
          onClick={onProfile}
          className="tg-press"
          style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.ink, color: '#fff', border: 'none', fontFamily: FONT.ui, fontWeight: 600, fontSize: 14, cursor: 'pointer', padding: '8px 9px 8px 14px', borderRadius: 30 }}
        >
          You
          <span style={{ display: 'grid', placeItems: 'center', width: 26, height: 26, borderRadius: '50%', background: C.lime, color: C.ink, fontWeight: 700, fontSize: 13 }}>
            {streak}
          </span>
        </button>
      </div>
    </div>
  )
}

export function ActivityRibbon({ liveCount, ticker }: { liveCount: number | null; ticker: TickerItem[] }) {
  const loop = ticker.length ? [...ticker, ...ticker] : []
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 clamp(20px,5vw,64px)', position: 'relative', zIndex: 3 }}>
      <span
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600,
          color: C.ink, background: '#fff', boxShadow: `inset 0 0 0 1.5px ${C.line}`, padding: '6px 12px', borderRadius: 30, whiteSpace: 'nowrap',
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.lime, animation: 'targetGlow 1.6s infinite' }} />
        {liveCount === null ? 'live' : `${liveCount} racing right now`}
      </span>
      <div style={{ flex: 1, overflow: 'hidden', maskImage: 'linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent)', WebkitMaskImage: 'linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent)' }}>
        <div style={{ display: 'flex', gap: 30, width: 'max-content', animation: 'drift 26s linear infinite', fontSize: 13, color: C.mute, fontFamily: FONT.mono }}>
          {loop.map((t, i) => (
            <span key={i} style={{ whiteSpace: 'nowrap' }}>
              <b style={{ color: C.ink }}>{t.who}</b> {t.text}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

export function DailyHero({
  number,
  start,
  target,
  streak,
  onPlay,
}: {
  number: number
  start: string
  target: string
  streak: number
  onPlay: () => void
}) {
  return (
    <div style={{ maxWidth: 1180, margin: 'clamp(20px,4vw,56px) auto 0', padding: '0 clamp(20px,5vw,64px)', position: 'relative', zIndex: 2 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: FONT.mono, fontSize: 12, fontWeight: 700, letterSpacing: '.18em', textTransform: 'uppercase', color: C.pink }}>
          Today's Daily
        </span>
        <span style={{ fontFamily: FONT.mono, fontSize: 12, color: C.mute }}>
          No. {number} · everyone gets the same line
        </span>
      </div>

      <div style={{ position: 'relative', background: '#fff', borderRadius: 28, boxShadow: `inset 0 0 0 1.5px ${C.line}, 0 30px 60px -28px rgba(75,92,255,.4)`, padding: 'clamp(24px,4vw,46px) clamp(20px,4vw,52px)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 'clamp(8px,2vw,28px)' }}>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontFamily: FONT.mono, fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase', color: C.mute, marginBottom: 6 }}>Start</div>
            <div style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 'clamp(34px,7vw,86px)', lineHeight: 0.92, letterSpacing: '-.03em', color: C.ink }}>{start}</div>
          </div>
          <svg viewBox="0 0 200 120" style={{ width: 'clamp(70px,18vw,260px)', height: 'auto', overflow: 'visible' }} aria-hidden>
            <path d="M8 96 C 70 96 130 24 192 24" fill="none" stroke={C.bg2} strokeWidth="3" strokeLinecap="round" strokeDasharray="2 9" style={{ animation: 'lineFlow 2s linear infinite' }} />
            <circle cx="8" cy="96" r="9" fill={C.pink} style={{ transformOrigin: '8px 96px', animation: 'floatY 4s ease-in-out infinite' }} />
            <circle cx="192" cy="24" r="9" fill={C.indigo} style={{ transformOrigin: '192px 24px', animation: 'floatY 4s ease-in-out .8s infinite' }} />
            <text x="100" y="66" textAnchor="middle" fontFamily="Space Mono" fontSize="11" fill={C.mute}>? hops</text>
          </svg>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: FONT.mono, fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase', color: C.mute, marginBottom: 6 }}>Target</div>
            <div style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 'clamp(34px,7vw,86px)', lineHeight: 0.92, letterSpacing: '-.03em', background: 'linear-gradient(90deg,var(--indigo),var(--violet))', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{target}</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14, marginTop: 'clamp(20px,3vw,34px)' }}>
          <PrimaryButton onClick={onPlay} style={{ flex: 1, minWidth: 220, fontSize: 20, padding: '18px 26px', borderRadius: 18 }}>
            Find the line <span style={{ fontSize: 22 }}>→</span>
          </PrimaryButton>
          <div style={{ fontFamily: FONT.ui, fontSize: 14, color: C.mute, maxWidth: 230 }}>
            Fewest clicks wins. Click only the blue links inside each article. No signup.
          </div>
        </div>
        {streak > 0 ? (
          <div style={{ position: 'absolute', top: -14, right: 24, transform: 'rotate(3deg)', background: C.sun, color: C.ink, fontFamily: FONT.mono, fontWeight: 700, fontSize: 12, padding: '6px 12px', borderRadius: 10, boxShadow: '0 6px 14px -4px rgba(0,0,0,.2)' }}>
            🔥 {streak} day streak
          </div>
        ) : null}
      </div>
    </div>
  )
}

export interface ModeTile {
  id: Mode | 'solo'
  icon: string
  name: string
  desc: string
  bg: string
  fg: string
  /** Optional corner badge, e.g. "Beta". */
  badge?: string
}

export const MODE_TILES: ModeTile[] = [
  { id: 'quick', icon: '⚡', name: 'Quick Race', desc: 'Live 2 to 8 players. Never an empty room.', bg: 'linear-gradient(135deg,#4b5cff,#8b5cf6)', fg: '#fff' },
  { id: 'chaos', icon: '🎉', name: 'Chaos', desc: 'Power-ups, sabotage, mayhem.', bg: 'linear-gradient(135deg,#ff5a3c,#ff2e7e)', fg: '#fff' },
  { id: 'ranked', icon: '◆', name: 'Ranked', desc: '1v1 duel. Skill rating and tiers.', bg: '#191634', fg: '#fff', badge: 'Beta' },
  { id: 'series', icon: '⛓', name: 'Series', desc: 'A themed gauntlet of five lines.', bg: 'var(--cyan)', fg: '#0a3e40' },
  { id: 'solo', icon: '◐', name: 'Solo', desc: 'Practice a curated line. You versus the par.', bg: 'var(--lime)', fg: '#2a4d00' },
  { id: 'private', icon: '🔑', name: 'Private room', desc: 'Share a code. Friends, no signup.', bg: 'var(--sun)', fg: '#5b4a00' },
]

export function ModeGrid({ onSelect }: { onSelect: (id: Mode | 'solo') => void }) {
  return (
    <div style={{ maxWidth: 1180, margin: 'clamp(26px,4vw,44px) auto 80px', padding: '0 clamp(20px,5vw,64px)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 14 }}>
        {MODE_TILES.map((m) => (
          <button
            key={m.id}
            onClick={() => onSelect(m.id)}
            className="tg-lift tg-press"
            style={{
              textAlign: 'left', border: 'none', cursor: 'pointer', borderRadius: 20, padding: 18,
              background: m.bg, color: m.fg, position: 'relative', overflow: 'hidden', minHeight: 128,
              display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
            }}
          >
            <span style={{ fontSize: 26 }}>{m.icon}</span>
            <span>
              <span style={{ display: 'block', fontFamily: FONT.display, fontWeight: 700, fontSize: 19 }}>{m.name}</span>
              <span style={{ display: 'block', fontSize: 12.5, opacity: 0.82, marginTop: 3, lineHeight: 1.35 }}>{m.desc}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
