/** Chaos power-up tray — the 5 cards (FINAL-SPEC 6), two-tap arm-then-fire. */

import { C, FONT } from './primitives'
import type { ChaosEffect } from '../../game/client'

interface Card {
  id: ChaosEffect
  icon: string
  name: string
}

const CARDS: Card[] = [
  { id: 'redact', icon: '🖤', name: 'Redact' },
  { id: 'vanish', icon: '🫥', name: 'Vanish' },
  { id: 'boomerang', icon: '↩️', name: 'Boomerang' },
  { id: 'bubble', icon: '🛡', name: 'Bubble' },
  { id: 'peek', icon: '👁', name: 'Peek' },
]

export function PowerupTray({ charges, onCast }: { charges: number; onCast: (ptype: ChaosEffect) => void }) {
  const armed = charges > 0
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 10, overflowX: 'auto', paddingBottom: 2, alignItems: 'center' }} className="tg-noscroll">
      <span style={{ flexShrink: 0, fontFamily: FONT.mono, fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: armed ? C.coral : C.mute }}>
        {charges} {charges === 1 ? 'charge' : 'charges'}
      </span>
      {CARDS.map((card) => (
        <button
          key={card.id}
          onClick={() => armed && onCast(card.id)}
          disabled={!armed}
          className="tg-press"
          style={{
            flexShrink: 0, display: 'flex', alignItems: 'center', gap: 7,
            boxShadow: `inset 0 0 0 1.5px ${C.hairline}`,
            background: '#fff', color: C.ink, borderRadius: 30, border: 'none',
            padding: '6px 13px 6px 9px', fontFamily: FONT.ui, fontWeight: 600, fontSize: 12.5,
            cursor: armed ? 'pointer' : 'not-allowed', opacity: armed ? 1 : 0.5,
          }}
        >
          <span style={{ fontSize: 15 }}>{card.icon}</span>
          {card.name}
        </button>
      ))}
    </div>
  )
}
