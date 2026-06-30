/** Finish-screen parts: confetti burst, the line reveal, share card, histogram. */

import { useEffect, useMemo, useState } from 'react'
import { C, FONT } from './primitives'
import { buildYourLine, buildParLine } from '../../game/client'

// ── Confetti burst ───────────────────────────────────────────────────────

const CONFETTI_COLORS = ['#ff2e7e', '#4b5cff', '#8df03a', '#ffce2e', '#8b5cf6', '#16cfd6']

export function Confetti({ count }: { count: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const ang = Math.random() * Math.PI * 2
        const dist = 120 + Math.random() * 320
        return {
          x: 30 + Math.random() * 40,
          s: 6 + Math.random() * 10,
          color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
          r: Math.random() < 0.5 ? '50%' : '2px',
          dx: Math.round(Math.cos(ang) * dist),
          dy: Math.round(Math.sin(ang) * dist - 100),
          dur: 1.2 + Math.random() * 1.1,
          delay: Math.random() * 0.3,
        }
      }),
    [count],
  )
  if (count <= 0) return null
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }} aria-hidden>
      {pieces.map((c, i) => (
        <span
          key={i}
          style={{
            position: 'absolute', left: `${c.x}%`, top: '46%', width: c.s, height: c.s,
            background: c.color, borderRadius: c.r,
            ['--dx' as string]: `${c.dx}px`, ['--dy' as string]: `${c.dy}px`,
            animation: `burst ${c.dur}s ease-out forwards`, animationDelay: `${c.delay}s`,
          }}
        />
      ))}
    </div>
  )
}

// ── The your-line vs par-line reveal ─────────────────────────────────────

export function LineReveal({
  yourTitles,
  parTitles,
  yourClicks,
  parClicks,
  hidePar,
}: {
  yourTitles: string[]
  parTitles: string[]
  yourClicks: number
  parClicks: number
  hidePar?: boolean
}) {
  const your = useMemo(() => buildYourLine(yourTitles), [yourTitles])
  const par = useMemo(() => buildParLine(parTitles), [parTitles])
  const [drawn, setDrawn] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDrawn(true), 60)
    return () => clearTimeout(t)
  }, [yourTitles, parTitles])

  return (
    <div style={{ background: '#fff', boxShadow: `inset 0 0 0 1.5px ${C.hairline}, 0 30px 60px -30px rgba(75,92,255,.4)`, borderRadius: 24, padding: 'clamp(20px,4vw,34px)', marginTop: 'clamp(26px,4vw,40px)', textAlign: 'left', animation: 'rise .7s both' }}>
      <RowHead color={C.pink} label="Your line" value={`${yourClicks} clicks`} />
      <svg viewBox="0 0 720 110" style={{ width: '100%', height: 'auto', overflow: 'visible' }} aria-hidden>
        <path d={your.path} fill="none" stroke={C.pink} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1400" strokeDashoffset={drawn ? 0 : 1400} style={{ transition: 'stroke-dashoffset 1.1s ease-out' }} />
        {your.nodes.map((n, i) => (
          <g key={i}>
            <circle cx={n.x} cy={n.y} r={7} fill={C.pink} stroke="#fff" strokeWidth="3" style={{ opacity: drawn ? 1 : 0, transition: 'opacity .4s ease .4s' }} />
            <text x={n.x} y={n.ty} textAnchor={n.anchor} fontFamily="Space Grotesk" fontWeight="600" fontSize="13" fill="#3a3860" style={{ opacity: drawn ? 1 : 0, transition: 'opacity .4s ease .7s' }}>{n.label}</text>
          </g>
        ))}
      </svg>
      {hidePar ? null : (
        <>
          <div style={{ height: 1.5, background: '#eef1ff', margin: '14px 0' }} />
          <RowHead color={C.indigo} label="The par line" sub="shortest possible" value={`${parClicks} clicks`} />
          <svg viewBox="0 0 720 80" style={{ width: '100%', height: 'auto', overflow: 'visible' }} aria-hidden>
            <path d={par.path} fill="none" stroke={C.indigo} strokeWidth="4.5" strokeLinecap="round" strokeDasharray="760" strokeDashoffset={drawn ? 0 : 760} style={{ transition: 'stroke-dashoffset .9s ease-out .45s' }} />
            {par.nodes.map((n, i) => (
              <g key={i}>
                <circle cx={n.x} cy={n.y} r={7} fill={C.indigo} stroke="#fff" strokeWidth="3" style={{ opacity: drawn ? 1 : 0, transition: 'opacity .4s ease 1s' }} />
                <text x={n.x} y={n.ty} textAnchor={n.anchor} fontFamily="Space Grotesk" fontWeight="600" fontSize="13" fill="#3a3860" style={{ opacity: drawn ? 1 : 0, transition: 'opacity .4s ease .7s' }}>{n.label}</text>
              </g>
            ))}
          </svg>
        </>
      )}
    </div>
  )
}

function RowHead({ color, label, value, sub }: { color: string; label: string; value: string; sub?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 14, color }}>
        <span style={{ width: 11, height: 11, borderRadius: 3, background: color }} />
        {label}
        {sub ? <span style={{ fontSize: 11, color: C.mute, fontWeight: 500 }}>{sub}</span> : null}
      </span>
      <span style={{ fontFamily: FONT.mono, fontWeight: 700, fontSize: 14, color }}>{value}</span>
    </div>
  )
}

// ── Share card (Wordle text) ─────────────────────────────────────────────

export function ShareCard({ text }: { text: string }) {
  return (
    <div style={{ flex: 1, minWidth: 220, background: C.ink, color: '#fff', borderRadius: 16, padding: '14px 18px', textAlign: 'left' }}>
      <div style={{ fontFamily: FONT.mono, fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{text}</div>
    </div>
  )
}

// ── Histogram (how the world did) ────────────────────────────────────────

export interface HistRow {
  clicks: number
  count: number
}

export function Histogram({ rows, par, yourClicks }: { rows: HistRow[]; par: number; yourClicks: number }) {
  const max = Math.max(1, ...rows.map((r) => r.count))
  const totalCount = rows.reduce((a, r) => a + r.count, 0) || 1
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {rows.map((h) => {
        const isYou = h.clicks === yourClicks
        const color = isYou ? C.pink : h.clicks <= par ? C.lime : '#c2c7e8'
        const txt = isYou ? '#fff' : h.clicks <= par ? '#356400' : '#5a5f85'
        const pct = Math.round((h.count / totalCount) * 100)
        return (
          <div key={h.clicks} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontFamily: FONT.mono, fontWeight: 700, fontSize: 13, width: 18, color }}>{h.clicks}</span>
            <div style={{ flex: 1, height: 26, borderRadius: 7, background: '#eef1ff', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 7, background: color, width: `${Math.round((h.count / max) * 100)}%`, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 8, transition: 'width .6s ease' }}>
                <span style={{ fontFamily: FONT.mono, fontSize: 11, fontWeight: 700, color: txt }}>{pct}%</span>
              </div>
            </div>
            {isYou ? <span style={{ fontSize: 11, fontWeight: 700, color: C.pink }}>you</span> : null}
          </div>
        )
      })}
    </div>
  )
}
