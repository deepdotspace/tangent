/**
 * SVG path math for the tangent line — the brand's protagonist object.
 * Lifted from the approved Tangent.dc.html renderVals(): the HUD live line,
 * and the your-line-vs-par-line reveal on the results screen.
 */

export interface PathNode {
  x: number
  y: number
}

/** A smooth horizontal cubic-bezier spline through the given nodes. */
export function smoothPath(nodes: PathNode[]): string {
  if (nodes.length === 0) return ''
  let d = `M ${nodes[0].x} ${nodes[0].y}`
  for (let i = 1; i < nodes.length; i++) {
    const a = nodes[i - 1]
    const b = nodes[i]
    const cx = (a.x + b.x) / 2
    d += ` C ${cx} ${a.y} ${cx} ${b.y} ${b.x} ${b.y}`
  }
  return d
}

export interface HudNode {
  x: number
  y: number
  r: number
  fill: string
}

export interface HudGeometry {
  nodes: HudNode[]
  solidPath: string
  dashPath: string
}

/**
 * Build the live HUD line: a solid pink line of your clicked nodes from the
 * start, then a dashed remainder out to the pinned target.
 */
export function buildHudGeometry(pathLen: number, par: number, clicks: number): HudGeometry {
  const hudY = 45
  const sx = 26
  const ex = 974
  const total = Math.max(par, clicks, 1)
  const step = (ex - sx) / total
  const len = Math.max(pathLen, 1)
  const nodes: HudNode[] = Array.from({ length: len }, (_, i) => ({
    x: Math.min(sx + i * step, ex),
    y: hudY,
    r: i === len - 1 ? 8 : 6,
    fill: 'var(--pink)',
  }))
  const lastX = nodes.length ? nodes[nodes.length - 1].x : sx
  const solidNodes = nodes.length > 1 ? nodes : [{ x: sx, y: hudY }, ...nodes]
  const solidPath = smoothPath(solidNodes)
  const dashPath = `M ${lastX} ${hudY} L ${ex} ${hudY}`
  return { nodes, solidPath, dashPath }
}

export interface ResultNode {
  x: number
  y: number
  ty: number
  anchor: 'start' | 'middle' | 'end'
  label: string
}

export interface ResultLine {
  path: string
  nodes: ResultNode[]
}

const JITTER = [0, -22, 18, -14, 24, -8]
const RESULT_W = 720

/** Your messy human line (jittered) for the results reveal. */
export function buildYourLine(titles: string[]): ResultLine {
  const yMid = 55
  const nodes: ResultNode[] = titles.map((t, i) => {
    const x = 28 + (i / Math.max(titles.length - 1, 1)) * (RESULT_W - 56)
    const y = yMid + (JITTER[i % JITTER.length] || 0)
    const top = i % 2 === 0
    return {
      x,
      y,
      ty: top ? y - 14 : y + 22,
      anchor: i === 0 ? 'start' : i === titles.length - 1 ? 'end' : 'middle',
      label: t,
    }
  })
  return { path: smoothPath(nodes), nodes }
}

/** The straight par line drawn beneath your line. */
export function buildParLine(titles: string[]): ResultLine {
  const y = 38
  const nodes: ResultNode[] = titles.map((t, i) => ({
    x: 28 + (i / Math.max(titles.length - 1, 1)) * (RESULT_W - 56),
    y,
    ty: 24,
    anchor: i === 0 ? 'start' : i === titles.length - 1 ? 'end' : 'middle',
    label: t,
  }))
  const path = `M 28 ${y} L ${RESULT_W - 28} ${y}`
  return { path, nodes }
}
