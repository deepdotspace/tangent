/** Solo select — pick a difficulty or take a curated surprise, then race the par. */

import { useNavigate } from 'react-router-dom'
import { LightScreen, TopBar, BackButton, C, FONT } from '../components/tangent'
import { useMyStats, type Difficulty } from '../game/client'

interface Band {
  id: Difficulty
  icon: string
  name: string
  desc: string
  par: string
  bg: string
  fg: string
}

const BANDS: Band[] = [
  { id: 'easy', icon: '🟢', name: 'Easy', desc: 'Famous endpoints, multiple short lines.', par: 'par 3', bg: 'linear-gradient(135deg,#8df03a,#16cfd6)', fg: '#0a3e2a' },
  { id: 'medium', icon: '🟡', name: 'Medium', desc: 'A real search. The line is there.', par: 'par 4', bg: 'linear-gradient(135deg,#ffce2e,#ff5a3c)', fg: '#5b3a00' },
  { id: 'hard', icon: '🔴', name: 'Hard', desc: 'One narrow line, well hidden.', par: 'par 5', bg: 'linear-gradient(135deg,#ff2e7e,#8b5cf6)', fg: '#fff' },
]

export default function SoloPage() {
  const navigate = useNavigate()
  const streak = useMyStats().currentStreak

  function go(d?: Difficulty) {
    navigate(d ? `/race?mode=solo&difficulty=${d}` : '/race?mode=solo')
  }

  return (
    <LightScreen>
      <TopBar streak={streak} onLeaderboard={() => navigate('/leaderboard')} onProfile={() => navigate('/profile')} />
      <div style={{ maxWidth: 880, margin: '0 auto', padding: '0 clamp(20px,5vw,64px) 80px' }}>
        <BackButton onClick={() => navigate('/home')} />
        <h1 style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 'clamp(34px,7vw,64px)', letterSpacing: '-.03em', margin: '20px 0 6px', color: C.ink }}>Solo</h1>
        <p style={{ color: C.mute, fontSize: 16, margin: '0 0 28px', maxWidth: 460 }}>
          Practice a curated line at your own pace. Just you versus the par.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14 }}>
          {BANDS.map((b) => (
            <button
              key={b.id}
              onClick={() => go(b.id)}
              className="tg-lift tg-press"
              style={{ textAlign: 'left', border: 'none', cursor: 'pointer', borderRadius: 22, padding: 22, background: b.bg, color: b.fg, minHeight: 168, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
            >
              <span style={{ fontSize: 30 }}>{b.icon}</span>
              <span>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <span style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 26 }}>{b.name}</span>
                  <span style={{ fontFamily: FONT.mono, fontSize: 12, opacity: 0.85 }}>{b.par}</span>
                </span>
                <span style={{ display: 'block', fontSize: 13.5, opacity: 0.9, marginTop: 6, lineHeight: 1.4 }}>{b.desc}</span>
              </span>
            </button>
          ))}
        </div>

        <button
          onClick={() => go()}
          className="tg-press"
          style={{ marginTop: 18, width: '100%', background: C.ink, color: '#fff', border: 'none', borderRadius: 18, padding: '18px', fontFamily: FONT.display, fontWeight: 700, fontSize: 18, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}
        >
          🎲 Surprise me <span style={{ fontFamily: FONT.ui, fontWeight: 600, fontSize: 14, opacity: 0.7 }}>a curated line, any difficulty</span>
        </button>
      </div>
    </LightScreen>
  )
}
