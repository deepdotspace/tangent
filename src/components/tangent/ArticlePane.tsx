/**
 * ArticlePane — the read surface. Renders either the server's servedHtml
 * (where only `<a class="tg-link" data-tg-to="Title">` is interactive) or the
 * demo article graph. Clicks on legal links are intercepted and turned into a
 * hop; the target link glows pink when the player is one hop away. The article
 * itself never animates (the ink-splat chaos overlay is the only exception).
 */

import { useEffect, useRef } from 'react'
import { C, FONT } from './primitives'
import type { DemoArticle } from '../../game/client'

export interface ArticlePaneProps {
  title: string
  cat: string
  html?: string
  demo?: DemoArticle
  targetTitle: string
  oneAway: boolean
  loading?: boolean
  inkSplat?: boolean
  onHop: (title: string) => void
}

export function ArticlePane(props: ArticlePaneProps) {
  const { title, cat, html, demo, targetTitle, oneAway, loading, inkSplat, onHop } = props
  const htmlRef = useRef<HTMLDivElement>(null)

  // Delegate clicks on the served HTML to legal links only.
  useEffect(() => {
    if (!html) return
    const root = htmlRef.current
    if (!root) return
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      const link = target?.closest('a.tg-link') as HTMLAnchorElement | null
      if (!link) return
      e.preventDefault()
      const to = link.getAttribute('data-tg-to')
      if (to) onHop(to)
    }
    root.addEventListener('click', handler)
    return () => root.removeEventListener('click', handler)
  }, [html, onHop])

  // Mark the target link so it glows when reachable.
  useEffect(() => {
    if (!html) return
    const root = htmlRef.current
    if (!root) return
    root.querySelectorAll('a.tg-link.tg-target').forEach((el) => el.classList.remove('tg-target'))
    if (oneAway && targetTitle) {
      const sel = `a.tg-link[data-tg-to="${cssEscape(targetTitle)}"]`
      root.querySelectorAll(sel).forEach((el) => el.classList.add('tg-target'))
    }
  }, [html, oneAway, targetTitle, title])

  return (
    <article
      key={title}
      style={{ background: '#fff', borderRadius: 22, boxShadow: `inset 0 0 0 1.5px ${C.hairline}`, padding: 'clamp(22px,4vw,52px)', position: 'relative', overflow: 'hidden', animation: 'popIn .28s ease both' }}
    >
      {inkSplat ? (
        <div
          aria-hidden
          style={{
            position: 'absolute', inset: 0, zIndex: 5, pointerEvents: 'none',
            background:
              'radial-gradient(circle at 30% 25%,#10052e 0 22%,transparent 23%),radial-gradient(circle at 70% 60%,#10052e 0 30%,transparent 31%),radial-gradient(circle at 45% 80%,#10052e 0 18%,transparent 19%)',
            opacity: 0.92, transition: 'opacity .3s',
          }}
        />
      ) : null}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <span style={{ fontFamily: FONT.mono, fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: C.mute }}>
          Wikipedia · {cat}
        </span>
      </div>
      <h1 style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 'clamp(34px,5vw,52px)', lineHeight: 1, letterSpacing: '-.02em', margin: '0 0 4px', color: C.ink }}>
        {title}
      </h1>
      <div style={{ height: 1.5, background: 'linear-gradient(90deg,var(--pink),transparent)', margin: '18px 0 22px' }} />

      {loading ? (
        <SkeletonProse />
      ) : html ? (
        <div ref={htmlRef} className="tg-article-body" dangerouslySetInnerHTML={{ __html: html }} />
      ) : demo ? (
        <DemoProse demo={demo} targetTitle={targetTitle} oneAway={oneAway} onHop={onHop} />
      ) : null}
    </article>
  )
}

function DemoProse({ demo, targetTitle, oneAway, onHop }: { demo: DemoArticle; targetTitle: string; oneAway: boolean; onHop: (t: string) => void }) {
  return (
    <div className="tg-article-body">
      {demo.paras.map((segs, pi) => (
        <p key={pi}>
          {segs.map((seg, si) => {
            if (!seg.to) return <span key={si}>{seg.text}</span>
            const isTarget = seg.to === targetTitle && oneAway
            return (
              <a
                key={si}
                href="#"
                data-tg-to={seg.to}
                className={isTarget ? 'tg-link tg-target' : 'tg-link'}
                onClick={(e) => {
                  e.preventDefault()
                  onHop(seg.to!)
                }}
              >
                {seg.text}
              </a>
            )
          })}
        </p>
      ))}
    </div>
  )
}

function SkeletonProse() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} aria-hidden>
      {[100, 96, 88, 70, 92, 60].map((w, i) => (
        <div key={i} style={{ height: 14, width: `${w}%`, borderRadius: 7, background: 'linear-gradient(90deg,#eef1ff,#e3e9ff,#eef1ff)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s linear infinite' }} />
      ))}
    </div>
  )
}

/** Minimal CSS.escape for the attribute selector (titles can hold quotes/accents). */
function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value)
  return value.replace(/["\\]/g, '\\$&')
}
