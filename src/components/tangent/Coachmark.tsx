/** First-daily coachmark — three taps of teaching, then out of the way. */

import { C, FONT } from './primitives'

export function Coachmark({ target, onDismiss }: { target: string; onDismiss: () => void }) {
  return (
    <div
      style={{
        position: 'absolute', left: '50%', bottom: 24, transform: 'translateX(-50%)',
        background: C.ink, color: '#fff', borderRadius: 16, padding: '16px 20px', maxWidth: 360,
        boxShadow: '0 18px 40px -14px rgba(25,22,52,.6)', zIndex: 8, textAlign: 'center',
        animation: 'rise .4s both',
      }}
    >
      <div style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Tap a blue link to hop</div>
      <div style={{ fontSize: 13.5, color: 'rgba(255,255,255,.75)', lineHeight: 1.5 }}>
        Each link is one move. Steer toward <b style={{ color: C.pink }}>{target}</b>. The link glows pink when you are one hop away. Find the line.
      </div>
      <button
        onClick={onDismiss}
        className="tg-press"
        style={{ marginTop: 12, background: C.lime, color: C.ink, border: 'none', fontFamily: FONT.ui, fontWeight: 700, fontSize: 13, padding: '8px 18px', borderRadius: 30, cursor: 'pointer' }}
      >
        Got it
      </button>
    </div>
  )
}
