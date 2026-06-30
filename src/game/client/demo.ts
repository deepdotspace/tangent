/**
 * Demo engine — a small self-contained article graph lifted from the approved
 * Tangent.dc.html. It is the GRACEFUL FALLBACK that keeps every race screen
 * fully playable and demonstrable before the server's article pipeline and
 * race actions are callable. When the real endpoints answer, the hooks prefer
 * them; this is only the floor.
 */

import type { Difficulty, LivePlayer, Mode } from './types'

export interface DemoSeg {
  /** plain prose, or a link to another article title with display text. */
  to?: string
  text: string
}

export interface DemoArticle {
  cat: string
  paras: DemoSeg[][]
}

export interface DemoDaily {
  number: number
  start: string
  target: string
  par: number
  parPath: string[]
}

export const DEMO_DAILY: DemoDaily = {
  number: 412,
  start: 'Brick',
  target: 'Beyoncé',
  par: 3,
  parPath: ['Brick', 'Lego', 'Popular culture', 'Beyoncé'],
}

/** Onboarding: a guaranteed-winnable par-2 hop (FINAL-SPEC 4 carve-out). */
export const DEMO_ONBOARDING: DemoDaily = {
  number: 0,
  start: 'Brick',
  target: 'Lego',
  par: 1,
  parPath: ['Brick', 'Lego'],
}

const A = (text: string): DemoSeg => ({ text })
const L = (to: string, text: string): DemoSeg => ({ to, text })

export const DEMO_ARTICLES: Record<string, DemoArticle> = {
  Brick: {
    cat: 'Material',
    paras: [
      [A('A '), L('Brick', 'brick'), A(' is a block of fired '), L('Clay', 'clay'), A(' bound with '), L('Mortar', 'mortar'), A(' and stacked to build a '), L('Wall', 'wall'), A('. People have laid them since '), L('Ancient Rome', 'ancient Rome'), A(', and long before that too.')],
      [A('The humble brick turns up everywhere, from chimneys to the studded plastic kind sold by '), L('Lego', 'Lego'), A(', a toy that borrowed the name and the deeply satisfying click.')],
    ],
  },
  Lego: {
    cat: 'Toy company',
    paras: [
      [A('Lego is a line of plastic construction toys made in '), L('Denmark', 'Denmark'), A('. Each '), L('Plastic', 'plastic'), A(' brick grips the next with a precise, addictive snap.')],
      [A('Far beyond the playroom, Lego became a fixture of '), L('Popular culture', 'popular culture'), A(', spawning films, video games, and a tiny '), L('Minifigure', 'minifigure'), A(' for nearly every celebrity alive.')],
    ],
  },
  'Popular culture': {
    cat: 'Concept',
    paras: [
      [A('Popular culture is the swirl of ideas, images, and sounds that sit in the mainstream at any moment, carried by '), L('Internet', 'the internet'), A(', film, and '), L('Music', 'music'), A('.')],
      [A('Its largest figures become shorthand for an entire era. Few sit higher in the current one than '), L('Beyoncé', 'Beyoncé'), A(', whose every move turns into news.')],
    ],
  },
  Music: {
    cat: 'Art form',
    paras: [
      [A('Music is organized sound built from rhythm, melody, and harmony, heard everywhere from '), L('Jazz', 'jazz'), A(' clubs to stadium pop strummed on a '), L('Guitar', 'guitar'), A('.')],
      [A('Its modern superstars spill into '), L('Popular culture', 'popular culture'), A(' at large. Among the most awarded of all time is '), L('Beyoncé', 'Beyoncé'), A('.')],
    ],
  },
  Beyoncé: {
    cat: 'Musician',
    paras: [
      [A('Beyoncé is one of the most influential and decorated artists in the history of '), L('Music', 'music'), A('. You found the line.')],
    ],
  },
  Clay: {
    cat: 'Material',
    paras: [
      [A('Clay is a fine-grained earth that hardens when fired, used for '), L('Pottery', 'pottery'), A(' and, when molded into blocks, for the '), L('Brick', 'brick'), A(' itself.')],
    ],
  },
  Wall: {
    cat: 'Structure',
    paras: [
      [A('A wall divides or shelters a space, often built from '), L('Brick', 'brick'), A(' or stone, like the famous '), L('Great Wall of China', 'Great Wall of China'), A('.')],
    ],
  },
  Denmark: {
    cat: 'Country',
    paras: [
      [A('Denmark is a Nordic country in '), L('Europe', 'Europe'), A(', home of the fairy tale and of the '), L('Lego', 'Lego'), A(' company in the town of Billund.')],
    ],
  },
}

/** Resolve a demo article, with a "trail thins out" fallback that always routes back to hubs. */
export function getDemoArticle(title: string): DemoArticle {
  const found = DEMO_ARTICLES[title]
  if (found) return found
  return {
    cat: 'Article',
    paras: [
      [
        A('The trail thins out here. '),
        A(title),
        A(' branches back toward the big hubs like '),
        L('Brick', 'Brick'),
        A(', '),
        L('Lego', 'Lego'),
        A(', and '),
        L('Popular culture', 'popular culture'),
        A('. Keep steering toward the target.'),
      ],
    ],
  }
}

/** Is the target reachable in one hop from this article (drives the pink glow)? */
export function demoOneAway(article: DemoArticle, target: string): boolean {
  return article.paras.some((p) => p.some((s) => s.to === target))
}

/** A difficulty-flavoured demo pair for Solo (still resolves through the same graph). */
export function demoPairFor(_difficulty?: Difficulty): DemoDaily {
  return DEMO_DAILY
}

// ── Live presence (demo rivals) ──────────────────────────────────────────

interface DemoRivalSeed {
  name: string
  emoji: string
  color: string
  isGhost: boolean
}

const RIVAL_POOL: DemoRivalSeed[] = [
  { name: 'mossfern', emoji: '🦦', color: '#16cfd6', isGhost: true },
  { name: 'qwerty_z', emoji: '⚡', color: '#ffce2e', isGhost: false },
  { name: 'blue_ghost', emoji: '👻', color: '#8b5cf6', isGhost: true },
  { name: 'st0rm', emoji: '🌩', color: '#8df03a', isGhost: false },
]

export function demoRivalCount(mode: Mode): number {
  if (mode === 'chaos') return 4
  if (mode === 'ranked') return 1
  return 3
}

export function makeDemoRivals(mode: Mode): Record<string, LivePlayer> {
  const n = demoRivalCount(mode)
  const out: Record<string, LivePlayer> = {}
  RIVAL_POOL.slice(0, n).forEach((r, i) => {
    out[`ghost:${i}`] = {
      displayName: r.name,
      emoji: r.emoji,
      isGhost: mode === 'chaos' ? false : r.isGhost,
      clicks: 0,
      progress: 4,
      reached: false,
      charges: mode === 'chaos' ? 1 : undefined,
    }
  })
  return out
}

/** Advance demo rivals one tick toward the target (used by demo live race). */
export function advanceDemoRivals(
  players: Record<string, LivePlayer>,
  par: number,
): Record<string, LivePlayer> {
  const next: Record<string, LivePlayer> = {}
  for (const [id, r] of Object.entries(players)) {
    if (r.progress >= 100) {
      next[id] = r
      continue
    }
    const step = 6 + Math.random() * 16
    const np = Math.min(100, r.progress + step)
    const clicks = Math.round((np / 100) * (par + (r.isGhost ? 0 : 1)))
    next[id] = { ...r, progress: np, clicks, reached: np >= 100 }
  }
  return next
}
