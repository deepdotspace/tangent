/** Series select — a grid of evergreen themed gauntlets (cumulative clicks). */

import { useNavigate } from 'react-router-dom'
import { LightScreen, TopBar, BackButton, LoadingBlock, C, FONT } from '../components/tangent'
import { useSeriesList, useMyStats } from '../game/client'

interface SeriesTile {
  id: string
  title: string
  theme: string
  length: number
  bg: string
  fg: string
}

// Evergreen themed series shown when the seed set is not yet loaded.
const DEMO_SERIES: SeriesTile[] = [
  { id: 'demo-science', title: 'The Sciences', theme: 'physics to biology', length: 5, bg: 'linear-gradient(135deg,#4b5cff,#16cfd6)', fg: '#fff' },
  { id: 'demo-music', title: 'Sound & Stage', theme: 'jazz to pop', length: 5, bg: 'linear-gradient(135deg,#ff2e7e,#ff5a3c)', fg: '#fff' },
  { id: 'demo-history', title: 'Empires', theme: 'Rome to today', length: 5, bg: 'linear-gradient(135deg,#ffce2e,#ff5a3c)', fg: '#5b3a00' },
  { id: 'demo-geo', title: 'Around the World', theme: 'cities to seas', length: 3, bg: 'var(--cyan)', fg: '#0a3e40' },
  { id: 'demo-art', title: 'Canvas & Frame', theme: 'paint to film', length: 3, bg: 'var(--violet)', fg: '#fff' },
  { id: 'demo-food', title: 'On the Plate', theme: 'sourdough to spice', length: 3, bg: 'var(--lime)', fg: '#2a4d00' },
]

const BGS = [
  'linear-gradient(135deg,#4b5cff,#16cfd6)',
  'linear-gradient(135deg,#ff2e7e,#ff5a3c)',
  'linear-gradient(135deg,#ffce2e,#ff5a3c)',
  'var(--cyan)',
  'var(--violet)',
  'var(--lime)',
]

export default function SeriesPage() {
  const navigate = useNavigate()
  const list = useSeriesList()
  const streak = useMyStats().currentStreak

  const tiles: SeriesTile[] =
    list.status === 'ready' && list.rows.length > 0
      ? list.rows.map((r, i) => ({
          id: r.id,
          title: r.data.title,
          theme: r.data.themeTag ?? 'themed line set',
          length: r.data.length ?? 5,
          bg: BGS[i % BGS.length],
          fg: i % 6 === 3 ? '#0a3e40' : i % 6 === 5 ? '#2a4d00' : '#fff',
        }))
      : DEMO_SERIES

  return (
    <LightScreen>
      <TopBar streak={streak} onLeaderboard={() => navigate('/leaderboard')} onProfile={() => navigate('/profile')} />
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 clamp(20px,5vw,64px) 80px' }}>
        <BackButton onClick={() => navigate('/home')} />
        <h1 style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 'clamp(34px,7vw,64px)', letterSpacing: '-.03em', margin: '20px 0 6px', color: C.ink }}>Series</h1>
        <p style={{ color: C.mute, fontSize: 16, margin: '0 0 28px', maxWidth: 480 }}>
          A themed gauntlet of lines back to back. Lowest total clicks takes it.
        </p>

        {list.status === 'loading' ? (
          <LoadingBlock label="Loading the gauntlets" />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14 }}>
            {tiles.map((s) => (
              <button
                key={s.id}
                onClick={() => navigate(`/race?mode=series&seriesId=${encodeURIComponent(s.id)}`)}
                className="tg-lift tg-press"
                style={{ textAlign: 'left', border: 'none', cursor: 'pointer', borderRadius: 22, padding: 22, background: s.bg, color: s.fg, minHeight: 168, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
              >
                <span style={{ fontFamily: FONT.mono, fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', opacity: 0.85 }}>
                  {s.length} lines
                </span>
                <span>
                  <span style={{ display: 'block', fontFamily: FONT.display, fontWeight: 800, fontSize: 24 }}>{s.title}</span>
                  <span style={{ display: 'block', fontSize: 13.5, opacity: 0.9, marginTop: 4 }}>{s.theme}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </LightScreen>
  )
}
