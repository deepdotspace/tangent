/**
 * Onboarding — a never-played visitor's first run. One sentence of rules, then
 * straight into a guaranteed-winnable easy line with the race coachmarks. The
 * full mode hub stays hidden until after this first win (FINAL-SPEC 8).
 */

import { useNavigate } from 'react-router-dom'
import { LightScreen, Logo, Wordmark, PrimaryButton, C, FONT } from '../components/tangent'
import { DEMO_ONBOARDING } from '../game/client'

export default function OnboardingPage() {
  const navigate = useNavigate()
  return (
    <LightScreen style={{ display: 'grid', placeItems: 'center' }}>
      <div style={{ position: 'relative', zIndex: 2, maxWidth: 560, width: '100%', padding: 'clamp(24px,6vw,48px)', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 11, marginBottom: 28 }}>
          <Logo size={34} />
          <Wordmark size={26} />
        </div>

        <h1 style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 'clamp(32px,7vw,56px)', lineHeight: 1, letterSpacing: '-.03em', color: C.ink, margin: '0 0 16px' }}>
          Find the line.
        </h1>
        <p style={{ fontSize: 'clamp(16px,3vw,19px)', color: '#3a3860', lineHeight: 1.5, maxWidth: 420, margin: '0 auto 8px' }}>
          Click only the blue links inside the article to get from one page to another. That is the whole game.
        </p>

        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 14, margin: '24px 0 28px' }}>
          <span style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 'clamp(22px,5vw,34px)', color: C.ink }}>{DEMO_ONBOARDING.start}</span>
          <svg width="80" height="34" viewBox="0 0 80 34" aria-hidden>
            <path d="M4 26 C 28 26 52 8 76 8" fill="none" stroke={C.bg2} strokeWidth="3" strokeLinecap="round" strokeDasharray="2 8" style={{ animation: 'lineFlow 2s linear infinite' }} />
            <circle cx="4" cy="26" r="6" fill={C.pink} />
            <circle cx="76" cy="8" r="6" fill={C.indigo} />
          </svg>
          <span style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 'clamp(22px,5vw,34px)', background: 'linear-gradient(90deg,var(--indigo),var(--violet))', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{DEMO_ONBOARDING.target}</span>
        </div>

        <div>
          <PrimaryButton onClick={() => navigate('/race?mode=solo&onboarding=1')} style={{ fontSize: 20, padding: '18px 30px' }}>
            Find the line <span style={{ fontSize: 22 }}>→</span>
          </PrimaryButton>
        </div>
        <button onClick={() => navigate('/home')} className="tg-press" style={{ marginTop: 16, background: 'none', border: 'none', color: C.mute, fontFamily: FONT.ui, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
          Skip to the home page
        </button>
      </div>
    </LightScreen>
  )
}
