/** Lobby / matching + the weighted 3-2-1 GO countdown (dark radial stage). */

import { C, FONT, Spinner, AvatarChip } from './primitives'
import { initialOf } from '../../game/client'

export interface LobbySeed {
  name: string
  color: string
  emoji?: string
}

const ORBITS = [
  { s: 220, m: -110 },
  { s: 380, m: -190 },
  { s: 560, m: -280 },
]

export function Lobby({
  mode,
  phase,
  countdown,
  title,
  sub,
  players,
  onLeave,
}: {
  mode: string
  phase: 'matching' | 'countdown'
  countdown: number
  title: string
  sub: string
  players: LobbySeed[]
  onLeave: () => void
}) {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'radial-gradient(110% 80% at 50% 0%,#1f1b44,#100d2c)', color: '#fff', position: 'relative', overflow: 'hidden' }}>
      {ORBITS.map((o, i) => (
        <div key={i} style={{ position: 'absolute', left: '50%', top: '46%', width: o.s, height: o.s, marginLeft: o.m, marginTop: o.m, border: '1.5px solid rgba(255,255,255,.07)', borderRadius: '50%' }} />
      ))}
      <div style={{ textAlign: 'center', position: 'relative', zIndex: 2, padding: 24 }}>
        {phase === 'countdown' ? (
          <div key={countdown} style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 'clamp(90px,26vw,240px)', lineHeight: 1, color: C.lime, animation: 'countPop .5s ease both' }}>
            <span style={{ display: 'inline-block' }}>{countdown <= 0 ? 'GO' : String(countdown)}</span>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 18 }}>
              <Spinner size={84} color={C.pink} track="rgba(255,255,255,.12)" />
            </div>
            <div style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 'clamp(26px,5vw,40px)' }}>{title}</div>
            <div style={{ color: 'rgba(255,255,255,.6)', fontSize: 15, marginTop: 6 }}>{sub}</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 28, flexWrap: 'wrap', maxWidth: 420 }}>
              {players.map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,.08)', padding: '7px 12px 7px 7px', borderRadius: 30 }}>
                  <AvatarChip label={p.emoji ?? initialOf(p.name)} color={p.color} size={28} />
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</span>
                </div>
              ))}
            </div>
          </>
        )}
        <button
          onClick={onLeave}
          className="tg-press"
          style={{ marginTop: 34, background: 'none', border: '1.5px solid rgba(255,255,255,.2)', color: 'rgba(255,255,255,.7)', fontFamily: FONT.ui, fontWeight: 600, fontSize: 13, padding: '9px 18px', borderRadius: 30, cursor: 'pointer' }}
        >
          Leave {mode ? '' : ''}
        </button>
      </div>
    </div>
  )
}
