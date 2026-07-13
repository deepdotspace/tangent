/** Profile — stats, streak calendar, recent lines. Guest sees a save-streak nudge. */

import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { AuthOverlay, signOut } from 'deepspace'
import { PageSurface, BackButton, StatCard, EmptyBlock, C, FONT } from '../components/tangent'
import { useIdentity, useMyRuns, useMyStats, todayUtc, type RunRow } from '../game/client'
import { tierForRating } from '../game/constants'

export default function ProfilePage() {
  const navigate = useNavigate()
  const identity = useIdentity()
  const my = useMyRuns(identity.id)
  const stats = useMyStats()
  const [showAuth, setShowAuth] = useState(false)

  const streak = stats.currentStreak
  const rating = stats.rating ?? undefined
  const tier = stats.rankedTier ?? (typeof rating === 'number' ? tierForRating(rating) : null)

  const rows = my.rows
  const reached = rows.filter((r) => r.reachedTarget)
  const linesRun = rows.length
  const best = reached.length ? Math.min(...reached.map((r) => r.clicks ?? 99)) : null
  const avg = reached.length ? (reached.reduce((a, r) => a + (r.clicks ?? 0), 0) / reached.length) : null
  const beatParRows = reached.filter((r) => typeof r.parAtPlay === 'number' && (r.clicks ?? 99) <= (r.parAtPlay ?? 0))
  const beatPar = reached.length ? Math.round((beatParRows.length / reached.length) * 100) : null

  const name = identity.displayName
  const avatarLabel = streak > 0 ? String(streak) : name.trim()[0]?.toUpperCase() ?? '?'

  return (
    <PageSurface max={680}>
      <BackButton onClick={() => navigate('/home')} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 18, margin: '20px 0 28px' }}>
        <span style={{ width: 78, height: 78, borderRadius: 24, background: 'linear-gradient(135deg,var(--pink),var(--violet))', display: 'grid', placeItems: 'center', fontFamily: FONT.display, fontWeight: 800, fontSize: 34, color: '#fff' }}>
          {avatarLabel}
        </span>
        <div>
          <h1 style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 'clamp(28px,6vw,44px)', letterSpacing: '-.02em', margin: 0, color: C.ink }}>{name}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
            {tier ? (
              <span style={{ background: C.indigo, color: '#fff', fontFamily: FONT.mono, fontSize: 11, fontWeight: 700, letterSpacing: '.08em', padding: '4px 10px', borderRadius: 30, textTransform: 'uppercase' }}>{tier}</span>
            ) : (
              <span style={{ background: C.bg2, color: C.mute, fontFamily: FONT.mono, fontSize: 11, fontWeight: 700, letterSpacing: '.08em', padding: '4px 10px', borderRadius: 30, textTransform: 'uppercase' }}>{identity.isSignedIn ? 'Unranked' : 'Guest'}</span>
            )}
            <span style={{ fontFamily: FONT.mono, fontSize: 13, color: C.mute }}>
              {typeof rating === 'number' ? `rating ${Math.round(rating)}` : `${streak} day streak`}
            </span>
          </div>
        </div>
        {identity.isSignedIn ? (
          <button
            onClick={() => signOut()}
            className="tg-press"
            style={{ marginLeft: 'auto', alignSelf: 'flex-start', background: '#fff', boxShadow: `inset 0 0 0 1.5px ${C.hairline}`, border: 'none', borderRadius: 11, padding: '9px 14px', fontFamily: FONT.ui, fontWeight: 600, fontSize: 13, color: C.mute, cursor: 'pointer' }}
          >
            Sign out
          </button>
        ) : null}
      </div>

      {!identity.isSignedIn ? (
        <div style={{ background: C.ink, color: '#fff', borderRadius: 18, padding: 18, marginBottom: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: FONT.ui, fontWeight: 600, fontSize: 14 }}>Create an account to save your streak across devices.</span>
          <button onClick={() => setShowAuth(true)} className="tg-press" style={{ background: C.lime, color: C.ink, border: 'none', borderRadius: 30, padding: '9px 18px', fontFamily: FONT.ui, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            Sign in
          </button>
        </div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: 12, marginBottom: 24 }}>
        <StatCard value={linesRun} label="lines run" color={C.ink} />
        <StatCard value={best ?? '—'} label="best line" color={C.pink} />
        <StatCard value={avg != null ? avg.toFixed(1) : '—'} label="avg clicks" color={C.indigo} />
        <StatCard value={beatPar != null ? `${beatPar}%` : '—'} label="beat par" color={C.lime} labelColor="#356400" />
      </div>

      <Panel title="Streak, last 5 weeks">
        <StreakCalendar rows={reached} />
      </Panel>

      <Panel title="Recent lines">
        {reached.length === 0 ? (
          <EmptyBlock icon="🧭" title="No lines run yet" body="Find today's line and your runs show up here." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {reached.slice(0, 6).map((r, i) => (
              <RecentLine key={i} row={r} />
            ))}
          </div>
        )}
      </Panel>

      {showAuth ? <AuthOverlay onClose={() => setShowAuth(false)} /> : null}
    </PageSurface>
  )
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ background: '#fff', boxShadow: `inset 0 0 0 1.5px ${C.hairline}`, borderRadius: 20, padding: 22, marginBottom: 18 }}>
      <div style={{ fontFamily: FONT.mono, fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: C.mute, marginBottom: 14 }}>{title}</div>
      {children}
    </div>
  )
}

function RecentLine({ row }: { row: RunRow }) {
  const path = row.path ?? []
  const from = path[0]?.title ?? '?'
  const to = path[path.length - 1]?.title ?? '?'
  const par = row.parAtPlay
  const beat = typeof par === 'number' && (row.clicks ?? 99) <= par
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontWeight: 600, fontSize: 14, flex: 1, color: C.ink }}>
        {from} <span style={{ color: C.mute }}>→</span> {to}
      </span>
      <span style={{ fontFamily: FONT.mono, fontSize: 12, color: beat ? C.lime : C.mute, fontWeight: 700 }}>
        {row.clicks ?? 0}{typeof par === 'number' ? ` · par ${par}` : ''}
      </span>
    </div>
  )
}

function StreakCalendar({ rows }: { rows: RunRow[] }) {
  const today = todayUtc()
  const active = new Set(rows.map((r) => (r.finishedAt ?? '').slice(0, 10)).filter(Boolean))
  const cells = Array.from({ length: 35 }, (_, i) => {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - (34 - i))
    const key = d.toISOString().slice(0, 10)
    let bg = '#eef1ff'
    if (key === today) bg = active.has(key) ? C.pink : '#bcc6ff'
    else if (active.has(key)) bg = C.indigo
    return { bg }
  })
  return (
    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
      {cells.map((c, i) => (
        <span key={i} style={{ width: 20, height: 20, borderRadius: 5, background: c.bg }} />
      ))}
    </div>
  )
}
