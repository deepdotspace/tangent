/** Sticky race HUD — back, mode label, the live tangent line, stats, chaos tray. */

import { C, FONT } from './primitives'
import { RaceTimer } from './RaceTimer'
import { PowerupTray } from './PowerupTray'
import { buildHudGeometry, type ChaosEffect } from '../../game/client'

export interface RaceHudProps {
  onBack: () => void
  modeLabel: string
  modeColor: string
  start: string
  target: string
  oneAway: boolean
  clicks: number
  par: number
  pathLen: number
  startMs: number
  running: boolean
  isChaos: boolean
  charges: number
  onPowerup: (ptype: ChaosEffect) => void
}

export function RaceHud(props: RaceHudProps) {
  const { onBack, modeLabel, modeColor, start, target, oneAway, clicks, par, pathLen, startMs, running, isChaos, charges, onPowerup } = props
  const hud = buildHudGeometry(pathLen, par || Math.max(clicks + 1, 3), clicks)

  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 30, background: 'rgba(251,252,255,.86)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', boxShadow: `inset 0 -1.5px 0 0 ${C.hairline}` }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '12px clamp(14px,3vw,40px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            onClick={onBack}
            className="tg-press"
            style={{ border: 'none', background: '#eef1ff', width: 38, height: 38, borderRadius: 11, cursor: 'pointer', fontSize: 18, color: C.ink, flexShrink: 0 }}
            aria-label="Back"
          >
            ←
          </button>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexShrink: 0 }}>
            <span style={{ fontFamily: FONT.mono, fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: modeColor, fontWeight: 700 }}>{modeLabel}</span>
          </div>

          {/* the live line */}
          <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
            <svg viewBox="0 0 1000 90" preserveAspectRatio="none" style={{ width: '100%', height: 60, overflow: 'visible' }} aria-hidden>
              <path d={hud.dashPath} fill="none" stroke="#c9cef0" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="2 10" style={{ animation: 'lineFlow 2s linear infinite' }} />
              <path d={hud.solidPath} fill="none" stroke={C.pink} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
              {hud.nodes.map((n, i) => (
                <circle key={i} cx={n.x} cy={n.y} r={n.r} fill={n.fill} stroke="#fbfcff" strokeWidth="3" />
              ))}
              <circle cx={974} cy={45} r={7} fill={C.indigo} stroke="#fbfcff" strokeWidth="3" />
            </svg>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: -2 }}>
              <span style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 'clamp(13px,2.4vw,17px)', color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '40%' }}>{start}</span>
              <span style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 'clamp(13px,2.4vw,17px)', color: C.indigo, position: 'relative', overflow: 'visible', maxWidth: '40%', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {target}
                {oneAway ? (
                  <span style={{ position: 'absolute', top: -16, right: 0, fontFamily: FONT.mono, fontSize: 9, fontWeight: 700, letterSpacing: '.1em', color: C.pink, whiteSpace: 'nowrap', animation: 'floatY 1.4s infinite' }}>
                    1 AWAY ↓
                  </span>
                ) : null}
              </span>
            </div>
          </div>

          {/* stats */}
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <div style={{ textAlign: 'center', background: '#fff', boxShadow: `inset 0 0 0 1.5px ${C.hairline}`, borderRadius: 12, padding: '5px 12px', minWidth: 58 }}>
              <div style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 24, lineHeight: 1, color: C.pink }}>{clicks}</div>
              <div style={{ fontFamily: FONT.mono, fontSize: 9, letterSpacing: '.1em', color: C.mute, textTransform: 'uppercase' }}>clicks</div>
            </div>
            <div style={{ textAlign: 'center', background: '#fff', boxShadow: `inset 0 0 0 1.5px ${C.hairline}`, borderRadius: 12, padding: '5px 12px', minWidth: 78 }}>
              <div style={{ fontFamily: FONT.mono, fontWeight: 700, fontSize: 22, lineHeight: 1.05, color: C.ink }}>
                <RaceTimer startMs={startMs} running={running} />
              </div>
              <div style={{ fontFamily: FONT.mono, fontSize: 9, letterSpacing: '.1em', color: C.mute, textTransform: 'uppercase' }}>time</div>
            </div>
          </div>
        </div>

        {isChaos ? <PowerupTray charges={charges} onCast={onPowerup} /> : null}
      </div>
    </div>
  )
}
