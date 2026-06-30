/** Leaderboard — today's shortest lines (fewest clicks, then fastest time). */

import { useNavigate } from 'react-router-dom'
import { PageSurface, BackButton, AvatarChip, EmptyBlock, LoadingBlock, C, FONT } from '../components/tangent'
import {
  useDailyChallenge,
  useDailyLeaderboard,
  useIdentity,
  formatClock,
  initialOf,
  DEMO_DAILY,
  type RunRow,
} from '../game/client'

export default function LeaderboardPage() {
  const navigate = useNavigate()
  const daily = useDailyChallenge()
  const board = useDailyLeaderboard(daily.pairId)
  const identity = useIdentity()

  const start = daily.start ?? DEMO_DAILY.start
  const target = daily.target ?? DEMO_DAILY.target

  return (
    <PageSurface max={680}>
      <BackButton onClick={() => navigate('/home')} />
      <h1 style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 'clamp(32px,6vw,52px)', letterSpacing: '-.02em', margin: '20px 0 0', color: C.ink }}>
        Today's shortest lines
      </h1>
      <p style={{ color: C.mute, fontSize: 15, margin: '6px 0 24px' }}>
        {start} to {target}. Fewest clicks first, then fastest line.
      </p>

      {board.status === 'loading' ? (
        <LoadingBlock label="Counting the lines" />
      ) : board.rows.length === 0 ? (
        <EmptyBlock icon="🥇" title="No lines yet today" body="Be the first to connect today's pair. The board fills the moment someone finds the line." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {board.rows.map((r, i) => (
            <Row key={i} rank={i + 1} row={r} you={r.subjectId === identity.id} />
          ))}
        </div>
      )}
    </PageSurface>
  )
}

function Row({ rank, row, you }: { rank: number; row: RunRow; you: boolean }) {
  const rankColor = rank === 1 ? C.sun : rank <= 3 ? C.indigo : C.mute
  const name = row.subjectDisplayName ?? 'Anonymous'
  const avatarColor = AVATARS[rank % AVATARS.length]
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        background: you ? '#fff0f6' : '#fff',
        boxShadow: `inset 0 0 0 1.5px ${you ? C.pink : C.hairline}`,
        borderRadius: 16, padding: '14px 18px',
      }}
    >
      <span style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 22, width: 30, color: rankColor }}>{rank}</span>
      <AvatarChip label={row.subjectEmoji ?? initialOf(name)} color={avatarColor} size={38} />
      <span style={{ flex: 1, fontWeight: 700, fontSize: 16, color: C.ink }}>
        {name}
        {you ? <span style={{ fontSize: 11, color: C.pink, marginLeft: 6 }}>you</span> : null}
      </span>
      <span style={{ fontFamily: FONT.mono, fontWeight: 700, fontSize: 15, color: C.pink }}>{row.clicks ?? 0}</span>
      <span style={{ fontFamily: FONT.mono, fontSize: 13, color: C.mute, width: 64, textAlign: 'right' }}>
        {formatClock(row.timeMs ?? 0)}
      </span>
    </div>
  )
}

const AVATARS = ['#16cfd6', '#8df03a', '#ff2e7e', '#8b5cf6', '#ffce2e', '#ff5a3c']
