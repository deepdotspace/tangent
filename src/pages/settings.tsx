/**
 * Settings — name + emoji, theme, email prefs, ranked-anonymous, how to play,
 * sign out. Guest-friendly: theme + how-to-play work with no account; profile
 * and prefs persist to the users row once signed in.
 */

import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { AuthOverlay, signOut, useMutations, useUser } from 'deepspace'
import { PageSurface, BackButton, C, FONT } from '../components/tangent'
import { useIdentity } from '../game/client'

type ThemePref = 'system' | 'light' | 'dark'
const THEME_KEY = 'tg_theme_pref'
const EMOJIS = ['🦦', '⚡', '👻', '🌩', '🟣', '🦊', '🐙', '🚀', '🎯', '🧭', '🔥', '🪐']

function resolveTheme(pref: ThemePref): string {
  if (pref === 'light') return 'tangent'
  if (pref === 'dark') return 'ink'
  const dark = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
  return dark ? 'ink' : 'tangent'
}

function applyTheme(pref: ThemePref) {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-theme', resolveTheme(pref))
}

export default function SettingsPage() {
  const navigate = useNavigate()
  const identity = useIdentity()
  const { user } = useUser()
  const { put } = useMutations<Record<string, unknown>>('users')
  const [showAuth, setShowAuth] = useState(false)

  const u = user as (Record<string, unknown> & { id?: string; name?: string }) | null

  const [name, setName] = useState((u?.displayName as string) ?? u?.name ?? '')
  const [emoji, setEmoji] = useState((u?.emoji as string) ?? '🟣')
  const [theme, setTheme] = useState<ThemePref>('system')
  const [dailyReady, setDailyReady] = useState(Boolean(u?.emailDailyReady))
  const [streakRisk, setStreakRisk] = useState(u?.emailStreakAtRisk == null ? true : Boolean(u.emailStreakAtRisk))
  const [rankedAnon, setRankedAnon] = useState(Boolean(u?.rankedAnonymous))
  const [savedFlash, setSavedFlash] = useState(false)

  useEffect(() => {
    // Dark / system themes are not shipped yet: the cards are light-only, so the
    // ink theme renders unreadable. Pin to light until a real dark theme lands,
    // and overwrite any previously stored dark/system preference.
    setTheme('light')
    applyTheme('light')
    try { window.localStorage.setItem(THEME_KEY, 'light') } catch { /* ignore */ }
  }, [])

  function setThemePref(pref: ThemePref) {
    setTheme(pref)
    applyTheme(pref)
    try { window.localStorage.setItem(THEME_KEY, pref) } catch { /* ignore */ }
  }

  async function saveProfile() {
    if (identity.isSignedIn && u?.id) {
      await put(u.id, { displayName: name, emoji })
      flash()
    } else {
      setShowAuth(true)
    }
  }

  async function savePref(patch: Record<string, unknown>) {
    if (identity.isSignedIn && u?.id) {
      await put(u.id, patch)
      flash()
    }
  }

  function flash() {
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 1500)
  }

  return (
    <PageSurface max={620}>
      <BackButton onClick={() => navigate('/home')} />
      <h1 style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 'clamp(32px,6vw,52px)', letterSpacing: '-.02em', margin: '20px 0 24px', color: C.ink }}>
        Settings{savedFlash ? <span style={{ fontFamily: FONT.mono, fontSize: 13, color: C.lime, marginLeft: 12 }}>saved</span> : null}
      </h1>

      <Section title="Your racer">
        <label style={labelStyle}>Display name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={identity.displayName}
          style={inputStyle}
        />
        <label style={{ ...labelStyle, marginTop: 16 }}>Emoji</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {EMOJIS.map((e) => (
            <button
              key={e}
              onClick={() => setEmoji(e)}
              className="tg-press"
              style={{ width: 42, height: 42, borderRadius: 12, fontSize: 20, cursor: 'pointer', background: emoji === e ? C.pink : '#fff', border: 'none', boxShadow: emoji === e ? 'none' : `inset 0 0 0 1.5px ${C.hairline}` }}
            >
              {e}
            </button>
          ))}
        </div>
        <button onClick={saveProfile} className="tg-press" style={primaryBtn}>
          {identity.isSignedIn ? 'Save profile' : 'Sign in to save'}
        </button>
      </Section>

      <Section title="Appearance">
        <label style={labelStyle}>Theme</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['light'] as ThemePref[]).map((t) => (
            <button
              key={t}
              onClick={() => setThemePref(t)}
              className="tg-press"
              style={{
                flex: 1, textTransform: 'capitalize', padding: '12px', borderRadius: 12, cursor: 'pointer',
                fontFamily: FONT.ui, fontWeight: 700, fontSize: 14, border: 'none',
                background: theme === t ? C.ink : '#fff', color: theme === t ? '#fff' : C.ink,
                boxShadow: theme === t ? 'none' : `inset 0 0 0 1.5px ${C.hairline}`,
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Email">
        <Toggle label="Daily is ready" desc="A nudge when a new line drops." checked={dailyReady} onChange={(v) => { setDailyReady(v); void savePref({ emailDailyReady: v }) }} />
        <Toggle label="Streak at risk" desc="A heads-up before a streak of 3+ would break." checked={streakRisk} onChange={(v) => { setStreakRisk(v); void savePref({ emailStreakAtRisk: v }) }} />
        {!identity.isSignedIn ? <Note>Sign in to receive email and save these.</Note> : null}
      </Section>

      <Section title="Privacy">
        <Toggle label="Ranked anonymous" desc="Hide your name on the ranked board." checked={rankedAnon} onChange={(v) => { setRankedAnon(v); void savePref({ rankedAnonymous: v }) }} />
      </Section>

      <Section title="How to play">
        <ol style={{ margin: 0, paddingLeft: 18, color: '#3a3860', fontSize: 14.5, lineHeight: 1.7 }}>
          <li>You get a start article and a target article.</li>
          <li>Click only the blue links inside the article to hop. Each link is one move.</li>
          <li>Steer toward the target. The link glows pink when you are one hop away.</li>
          <li>Fewest clicks wins the line. Live races go to whoever arrives first.</li>
        </ol>
      </Section>

      <Section title="Account">
        {identity.isSignedIn ? (
          <>
            <div style={{ fontSize: 14, color: C.mute, marginBottom: 12 }}>Signed in as <b style={{ color: C.ink }}>{u?.name ?? (u?.email as string) ?? 'you'}</b></div>
            <button onClick={() => signOut()} className="tg-press" style={{ ...primaryBtn, marginTop: 0, background: '#fff', color: C.ink, boxShadow: `inset 0 0 0 1.5px ${C.hairline}` }}>Sign out</button>
          </>
        ) : (
          <button onClick={() => setShowAuth(true)} className="tg-press" style={{ ...primaryBtn, marginTop: 0 }}>Sign in or create an account</button>
        )}
      </Section>

      {showAuth ? <AuthOverlay onClose={() => setShowAuth(false)} /> : null}
    </PageSurface>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ background: '#fff', boxShadow: `inset 0 0 0 1.5px ${C.hairline}`, borderRadius: 20, padding: 22, marginBottom: 16 }}>
      <div style={{ fontFamily: FONT.mono, fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: C.mute, marginBottom: 14 }}>{title}</div>
      {children}
    </div>
  )
}

function Toggle({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 0' }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 14.5, color: C.ink }}>{label}</div>
        <div style={{ fontSize: 13, color: C.mute }}>{desc}</div>
      </div>
      <button
        onClick={() => onChange(!checked)}
        aria-pressed={checked}
        className="tg-press"
        style={{ width: 50, height: 28, borderRadius: 30, border: 'none', cursor: 'pointer', background: checked ? C.pink : '#d8dcf0', position: 'relative', flexShrink: 0, transition: 'background .15s' }}
      >
        <span style={{ position: 'absolute', top: 3, left: checked ? 25 : 3, width: 22, height: 22, borderRadius: '50%', background: '#fff', transition: 'left .15s', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
      </button>
    </div>
  )
}

function Note({ children }: { children: ReactNode }) {
  return <div style={{ marginTop: 12, fontSize: 13, color: C.mute, fontStyle: 'italic' }}>{children}</div>
}

const labelStyle = { display: 'block', fontFamily: FONT.ui, fontWeight: 600, fontSize: 13, color: C.mute, marginBottom: 7 } as const
const inputStyle = { width: '100%', padding: '12px 14px', borderRadius: 12, border: 'none', boxShadow: `inset 0 0 0 1.5px ${C.line}`, fontFamily: FONT.ui, fontSize: 15, color: C.ink, background: '#fff' } as const
const primaryBtn = { marginTop: 18, background: C.ink, color: '#fff', border: 'none', borderRadius: 14, padding: '13px 22px', fontFamily: FONT.display, fontWeight: 700, fontSize: 15, cursor: 'pointer' } as const
