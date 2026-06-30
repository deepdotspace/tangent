/** Presence rail — you + rivals as parallel progress lines (live + ghosts). */

import { C, FONT } from './primitives'

export interface RivalRow {
  id: string
  name: string
  color: string
  ghost: boolean
  clicks: number
  progress: number
}

export function PresenceRail({
  label,
  youClicks,
  youProgress,
  rivals,
  onGiveUp,
}: {
  label: string
  youClicks: number
  youProgress: number
  rivals: RivalRow[]
  onGiveUp: () => void
}) {
  return (
    <aside className="tg-race-aside" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ background: '#fff', boxShadow: `inset 0 0 0 1.5px ${C.hairline}`, borderRadius: 18, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontFamily: FONT.mono, fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: C.mute }}>{label}</span>
          <span style={{ fontSize: 11, color: C.lime, fontWeight: 700 }}>● live</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Bar name="You" color={C.pink} clicks={youClicks} progress={youProgress} bold />
          {rivals.map((r) => (
            <Bar key={r.id} name={r.name} color={r.color} clicks={r.clicks} progress={r.progress} ghost={r.ghost} />
          ))}
        </div>
      </div>
      <button
        onClick={onGiveUp}
        className="tg-press"
        style={{ background: '#fff', boxShadow: `inset 0 0 0 1.5px ${C.hairline}`, border: 'none', borderRadius: 14, padding: 12, fontFamily: FONT.ui, fontWeight: 600, fontSize: 13, color: C.mute, cursor: 'pointer' }}
      >
        Give up the line
      </button>
    </aside>
  )
}

function Bar({ name, color, clicks, progress, ghost, bold }: { name: string; color: string; clicks: number; progress: number; ghost?: boolean; bold?: boolean }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: bold ? 700 : 600, fontSize: 13.5, color: bold ? C.ink : '#3a3860' }}>
          <span style={{ width: 9, height: 9, borderRadius: 3, background: color }} />
          {name}
          {ghost ? <span style={{ fontSize: 10, color: C.mute, fontStyle: 'italic' }}>ghost</span> : null}
        </span>
        <span style={{ fontFamily: FONT.mono, fontSize: 12, color: C.mute }}>{clicks} hops</span>
      </div>
      <div style={{ height: 7, borderRadius: 6, background: '#eef1ff', overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 6, background: color, width: `${Math.min(100, progress)}%`, transition: 'width .6s cubic-bezier(.2,.9,.3,1.2)' }} />
      </div>
    </div>
  )
}
