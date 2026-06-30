/** Daily result — streak / your clicks / par, the world histogram, next-drop, share. */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageSurface, BackButton, StatCard, Histogram, EmptyBlock, PrimaryButton, C, FONT, type HistRow } from '../components/tangent'
import {
  useDailyChallenge,
  useDailyHistogram,
  useIdentity,
  useMyRuns,
  useMyStats,
  dailyShareText,
  shareOrCopy,
  formatCountdown,
  msUntilNextUtcMidnight,
  DEMO_DAILY,
} from '../game/client'

export default function DailyResultPage() {
  const navigate = useNavigate()
  const daily = useDailyChallenge()
  const hist = useDailyHistogram()
  const identity = useIdentity()
  const my = useMyRuns(identity.id)
  const stats = useMyStats()

  const [copied, setCopied] = useState(false)
  const [remaining, setRemaining] = useState(msUntilNextUtcMidnight())

  useEffect(() => {
    const id = setInterval(() => setRemaining(msUntilNextUtcMidnight()), 1000)
    return () => clearInterval(id)
  }, [])

  const number = daily.number ?? DEMO_DAILY.number
  const start = daily.start ?? DEMO_DAILY.start
  const target = daily.target ?? DEMO_DAILY.target

  const myDaily = my.rows.find((r) => r.context === 'daily' && (!daily.pairId || r.pairId === daily.pairId) && r.reachedTarget)
  const yourClicks = myDaily?.clicks ?? null
  const par = myDaily?.parAtPlay ?? null
  const streak = stats.currentStreak
  const played = yourClicks != null

  const rows: HistRow[] = Object.entries(hist.buckets)
    .map(([k, v]) => ({ clicks: Number(k), count: v }))
    .filter((r) => Number.isFinite(r.clicks))
    .sort((a, b) => a.clicks - b.clicks)

  const shareText = dailyShareText({ number, start, target, clicks: yourClicks ?? 0, par: par ?? DEMO_DAILY.par, streak })

  return (
    <PageSurface max={560}>
      <BackButton onClick={() => navigate('/home')} />

      <div style={{ textAlign: 'center', marginTop: 20 }}>
        <span style={{ fontFamily: FONT.mono, fontSize: 12, letterSpacing: '.18em', textTransform: 'uppercase', color: C.pink }}>Daily No. {number}</span>
        <h1 style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 'clamp(30px,6vw,46px)', letterSpacing: '-.02em', margin: '6px 0 0', color: C.ink }}>
          {start} <span style={{ color: C.mute, fontWeight: 600 }}>to</span> {target}
        </h1>
      </div>

      {played ? (
        <div style={{ display: 'flex', gap: 12, margin: '24px 0' }}>
          <StatCard value={streak} label="🔥 day streak" bg={C.sun} border={false} labelColor="#6b5800" />
          <StatCard value={yourClicks} label="your clicks" bg={C.lime} border={false} color={C.ink} labelColor="#356400" />
          <StatCard value={par ?? '—'} label="the par" color={C.indigo} />
        </div>
      ) : (
        <div style={{ background: '#fff', boxShadow: `inset 0 0 0 1.5px ${C.hairline}`, borderRadius: 20, padding: 22, margin: '24px 0', textAlign: 'center' }}>
          <div style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 22, color: C.ink, marginBottom: 6 }}>You haven't run today's line</div>
          <div style={{ fontSize: 14, color: C.mute, marginBottom: 16 }}>Everyone gets the same pair today. Find the shortest line.</div>
          <PrimaryButton onClick={() => navigate('/race?mode=daily')} style={{ fontSize: 16 }}>Play today's Daily →</PrimaryButton>
        </div>
      )}

      <div style={{ background: '#fff', boxShadow: `inset 0 0 0 1.5px ${C.hairline}`, borderRadius: 20, padding: 22 }}>
        <div style={{ fontFamily: FONT.mono, fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: C.mute, marginBottom: 16 }}>How the world did today</div>
        {rows.length === 0 ? (
          <EmptyBlock icon="📊" title="No results in yet" body="The histogram fills as people finish today's line." />
        ) : (
          <Histogram rows={rows} par={par ?? DEMO_DAILY.par} yourClicks={yourClicks ?? -1} />
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, paddingTop: 16, boxShadow: `inset 0 1.5px 0 0 #eef1ff`, gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: C.mute }}>
            Next line drops in <b style={{ fontFamily: FONT.mono, color: C.ink }}>{formatCountdown(remaining)}</b>
          </span>
          {played ? (
            <button
              onClick={async () => { await shareOrCopy(shareText); setCopied(true); setTimeout(() => setCopied(false), 1800) }}
              className="tg-press"
              style={{ background: C.ink, color: '#fff', border: 'none', fontFamily: FONT.ui, fontWeight: 700, fontSize: 13, padding: '10px 18px', borderRadius: 30, cursor: 'pointer' }}
            >
              {copied ? 'Copied' : 'Share your line'}
            </button>
          ) : null}
        </div>
      </div>
    </PageSurface>
  )
}
