/**
 * Tangent design primitives — the shared brand vocabulary, lifted from the
 * approved Tangent.dc.html. Colors and fonts reference the theme tokens that
 * already live on [data-theme="tangent"] (src/themes.css), so nothing here
 * hardcodes a second palette.
 */

import type { CSSProperties, ReactNode } from 'react'

export const FONT = {
  display: 'var(--font-display)',
  ui: 'var(--font-ui)',
  mono: 'var(--font-mono)',
} as const

/** Brand color tokens as CSS-var references (resolve from the tangent theme). */
export const C = {
  bg: 'var(--bg)',
  bg2: 'var(--bg2)',
  ink: 'var(--ink)',
  mute: 'var(--mute)',
  pink: 'var(--pink)',
  indigo: 'var(--indigo)',
  violet: 'var(--violet)',
  lime: 'var(--lime)',
  cyan: 'var(--cyan)',
  sun: 'var(--sun)',
  coral: 'var(--coral)',
  paper: 'var(--paper)',
  line: '#e3e6f6',
  hairline: '#e7eaf7',
} as const

/** The tangent logo: two nodes joined by a flowing dashed line. */
export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 30 30" style={{ overflow: 'visible' }} aria-hidden>
      <circle cx="5" cy="22" r="4.5" fill={C.pink} />
      <circle cx="25" cy="8" r="4.5" fill={C.indigo} />
      <path
        d="M5 22 Q 15 6 25 8"
        stroke={C.ink}
        strokeWidth="2.4"
        fill="none"
        strokeLinecap="round"
        strokeDasharray="3 5"
        style={{ animation: 'lineFlow 1.4s linear infinite' }}
      />
    </svg>
  )
}

export function Wordmark({ size = 23 }: { size?: number }) {
  return (
    <span style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: size, letterSpacing: '-.02em' }}>
      Tangent
    </span>
  )
}

export function BackButton({ onClick, label = 'Home' }: { onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      className="tg-press"
      style={{
        border: 'none',
        background: '#fff',
        boxShadow: `inset 0 0 0 1.5px ${C.hairline}`,
        borderRadius: 11,
        padding: '9px 14px',
        fontFamily: FONT.ui,
        fontWeight: 600,
        fontSize: 13,
        color: C.mute,
        cursor: 'pointer',
      }}
    >
      ← {label}
    </button>
  )
}

/** A colored stat card (profile / daily result). */
export function StatCard({
  value,
  label,
  bg = '#fff',
  border = true,
  color = C.ink,
  labelColor = C.mute,
}: {
  value: ReactNode
  label: ReactNode
  bg?: string
  border?: boolean
  color?: string
  labelColor?: string
}) {
  return (
    <div
      style={{
        background: bg,
        boxShadow: border ? `inset 0 0 0 1.5px ${C.hairline}` : 'none',
        borderRadius: 18,
        padding: 16,
        textAlign: 'center',
      }}
    >
      <div style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 40, lineHeight: 1, color }}>
        {value}
      </div>
      <div
        style={{
          fontFamily: FONT.mono,
          fontSize: 10,
          letterSpacing: '.1em',
          textTransform: 'uppercase',
          color: labelColor,
          marginTop: 6,
        }}
      >
        {label}
      </div>
    </div>
  )
}

/** A spinning ring spinner (matching / loading). */
export function Spinner({ size = 50, color = C.pink, track = 'rgba(75,92,255,.14)' }: { size?: number; color?: string; track?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 50 50" aria-hidden>
      <circle cx="25" cy="25" r="20" fill="none" stroke={track} strokeWidth="5" />
      <circle
        cx="25" cy="25" r="20" fill="none" stroke={color} strokeWidth="5"
        strokeLinecap="round" strokeDasharray="40 90"
        style={{ transformOrigin: '25px 25px', animation: 'spinSlow 1s linear infinite' }}
      />
    </svg>
  )
}

/** A round avatar chip (leaderboard / lobby / presence). */
export function AvatarChip({ label, color, size = 38, textColor = '#10122e' }: { label: ReactNode; color: string; size?: number; textColor?: string }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        display: 'grid',
        placeItems: 'center',
        fontWeight: 700,
        fontSize: Math.round(size * 0.36),
        color: textColor,
        flexShrink: 0,
      }}
    >
      {label}
    </span>
  )
}

/** A full-bleed light brand surface with the soft radial wash + corner glows. */
export function LightScreen({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'radial-gradient(120% 90% at 88% -10%,#dfe6ff 0%,var(--bg) 55%)',
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
    >
      <div style={{ position: 'absolute', top: -120, right: -100, width: 420, height: 420, borderRadius: '50%', background: 'radial-gradient(circle,rgba(139,92,246,.16),transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: -160, left: -120, width: 480, height: 480, borderRadius: '50%', background: 'radial-gradient(circle,rgba(22,207,214,.14),transparent 70%)', pointerEvents: 'none' }} />
      {children}
    </div>
  )
}

/** A plain padded page surface (leaderboard / profile / daily). */
export function PageSurface({ children, max = 680 }: { children: ReactNode; max?: number }) {
  return (
    <div style={{ minHeight: '100vh', padding: 'clamp(20px,5vw,56px) clamp(16px,5vw,40px)', background: C.bg }}>
      <div style={{ maxWidth: max, margin: '0 auto' }}>{children}</div>
    </div>
  )
}

/** Designed loading / empty / error blocks (no bare spinners anywhere). */
export function LoadingBlock({ label = 'Drawing the line' }: { label?: string }) {
  return (
    <div style={{ display: 'grid', placeItems: 'center', padding: '64px 20px', textAlign: 'center', gap: 16 }}>
      <Spinner size={56} />
      <div style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 18, color: C.ink }}>{label}</div>
    </div>
  )
}

export function EmptyBlock({ icon = '🧭', title, body }: { icon?: string; title: string; body?: string }) {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: '44px 24px',
        background: '#fff',
        boxShadow: `inset 0 0 0 1.5px ${C.hairline}`,
        borderRadius: 20,
      }}
    >
      <div style={{ fontSize: 38, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 22, color: C.ink, marginBottom: 6 }}>{title}</div>
      {body ? <div style={{ fontSize: 14, color: C.mute, maxWidth: 360, margin: '0 auto', lineHeight: 1.5 }}>{body}</div> : null}
    </div>
  )
}

export function ErrorBlock({ title = 'Wikipedia blinked', body = 'Grabbing the page again.', onRetry }: { title?: string; body?: string; onRetry?: () => void }) {
  return (
    <div style={{ textAlign: 'center', padding: '44px 24px', background: '#fff', boxShadow: `inset 0 0 0 1.5px ${C.hairline}`, borderRadius: 20 }}>
      <div style={{ fontSize: 38, marginBottom: 8 }}>🛰️</div>
      <div style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 22, color: C.ink, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 14, color: C.mute, maxWidth: 360, margin: '0 auto 16px', lineHeight: 1.5 }}>{body}</div>
      {onRetry ? (
        <button onClick={onRetry} className="tg-press" style={{ background: C.ink, color: '#fff', border: 'none', borderRadius: 30, padding: '10px 20px', fontFamily: FONT.ui, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
          Try again
        </button>
      ) : null}
    </div>
  )
}

/** A pill button in the brand's primary gradient. */
export function PrimaryButton({ children, onClick, style }: { children: ReactNode; onClick?: () => void; style?: CSSProperties }) {
  return (
    <button
      onClick={onClick}
      className="tg-press"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        background: 'linear-gradient(95deg,var(--pink),#ff5aa0)',
        color: '#fff',
        border: 'none',
        fontFamily: FONT.display,
        fontWeight: 700,
        fontSize: 18,
        padding: '16px 24px',
        borderRadius: 16,
        cursor: 'pointer',
        boxShadow: '0 14px 30px -10px rgba(255,46,126,.7)',
        ...style,
      }}
    >
      {children}
    </button>
  )
}
