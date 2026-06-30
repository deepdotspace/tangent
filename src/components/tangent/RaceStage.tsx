/**
 * RaceStage — the heart screen, source-agnostic. Composes the sticky HUD, the
 * article read surface, the presence rail, and the first-daily coachmark. Both
 * the async race (useAsyncRace) and the live race (useGameRoom / demo) feed it
 * the same flat props.
 */

import { RaceHud } from './RaceHud'
import { ArticlePane } from './ArticlePane'
import { PresenceRail, type RivalRow } from './PresenceRail'
import { Coachmark } from './Coachmark'
import { C } from './primitives'
import type { ChaosEffect, RaceArticle } from '../../game/client'

export interface RaceStageProps {
  raceBg: string
  modeLabel: string
  modeColor: string
  onBack: () => void
  onGiveUp: () => void

  start: string
  target: string
  oneAway: boolean
  clicks: number
  par: number
  pathLen: number
  startMs: number
  running: boolean

  isChaos: boolean
  charges: number
  onPowerup: (ptype: ChaosEffect) => void

  article: RaceArticle
  onHop: (title: string) => void
  inkSplat?: boolean

  presenceLabel: string
  youProgress: number
  rivals: RivalRow[]

  showCoach: boolean
  onDismissCoach: () => void
}

export function RaceStage(props: RaceStageProps) {
  const {
    raceBg, modeLabel, modeColor, onBack, onGiveUp,
    start, target, oneAway, clicks, par, pathLen, startMs, running,
    isChaos, charges, onPowerup,
    article, onHop, inkSplat,
    presenceLabel, youProgress, rivals,
    showCoach, onDismissCoach,
  } = props

  return (
    <div style={{ minHeight: '100vh', background: raceBg }}>
      <RaceHud
        onBack={onBack}
        modeLabel={modeLabel}
        modeColor={modeColor}
        start={start}
        target={target}
        oneAway={oneAway}
        clicks={clicks}
        par={par}
        pathLen={pathLen}
        startMs={startMs}
        running={running}
        isChaos={isChaos}
        charges={charges}
        onPowerup={onPowerup}
      />

      <div style={{ maxWidth: 1280, margin: '0 auto', padding: 'clamp(18px,3vw,40px) clamp(14px,3vw,40px)' }} className="tg-race-grid">
        <div style={{ position: 'relative' }}>
          <ArticlePane
            title={article.title}
            cat={article.cat}
            html={article.html}
            demo={article.demo}
            targetTitle={target}
            oneAway={oneAway}
            loading={article.loading}
            inkSplat={inkSplat}
            onHop={onHop}
          />
          {showCoach ? <Coachmark target={target} onDismiss={onDismissCoach} /> : null}
        </div>

        <PresenceRail
          label={presenceLabel}
          youClicks={clicks}
          youProgress={youProgress}
          rivals={rivals}
          onGiveUp={onGiveUp}
        />
      </div>

      <div style={{ height: 1, background: C.bg }} />
    </div>
  )
}
