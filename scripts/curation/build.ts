/**
 * Tangent curation build (offline, bootstrap graph).
 *
 *   npx tsx scripts/curation/build.ts
 *
 * Produces src/seed/curation-seed.json: real, solvable start/target pairs with
 * a par computed by a real BFS over the body+infobox clickable link graph, plus
 * onboarding pairs, themed series, and a daily queue.
 *
 * HOW PAR IS HONEST
 * -----------------
 * Edges come from the SAME `extractClickableLinks` the Worker runs at runtime,
 * fed the SAME Wikimedia core-REST Parsoid HTML the runtime fetches. So an
 * offline edge == a clickable in-article link, byte-for-byte. Par is the
 * shortest path found over the FETCHED universe (the curated pool + their most
 * common bridges + a connector seed). A bounded universe can only ever
 * OVERSTATE par (we omit real edges, never invent them), never understate it,
 * so we never serve an unsolvable pair or an unmatchably-low par. graphVersion
 * is "v1-bootstrap"; par copy reads "shortest we found".
 *
 * Free public API only (no SDK / no auth): the build runs entirely offline.
 *   - HTML:   GET /w/rest.php/v1/page/{title}/html      (follows redirects)
 *   - resolve: GET /w/api.php?action=query&redirects=1   (canonical id + ns)
 * Concurrency <= 3, small delay, descriptive User-Agent, disk-cached.
 */

import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises'
import { dirname, join, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  extractClickableLinks,
  normalizeTitleKey,
} from '../../src/server/article-pipeline'
import { DISTANCE_MAP_HOP_CAP } from '../../src/game/constants'
import { ENDPOINTS, CONNECTORS, type Endpoint, type Theme } from './pool'

// ── Config (env-tunable so the build can be dialed down if the API is slow) ──

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolvePath(HERE, '..', '..')
const CACHE_DIR = join(HERE, '.cache')
const HTML_DIR = join(CACHE_DIR, 'html')
const PARSED_DIR = join(CACHE_DIR, 'parsed')
const OUT_FILE = join(REPO, 'src', 'seed', 'curation-seed.json')

const UA = 'Tangent/1.0 (https://tangent.app.space; ops@tangent.app.space)'
const num = (k: string, d: number) => {
  const v = Number(process.env[k])
  return Number.isFinite(v) && v > 0 ? v : d
}
const CONCURRENCY = Math.min(3, num('CURATION_CONCURRENCY', 3))
const DELAY_MS = num('CURATION_DELAY_MS', 150)
const EXPANSION_LIMIT = num('CURATION_EXPANSION', 800)
const MAX_PAIRS = num('CURATION_MAX_PAIRS', 160)
const MAX_PER_ENDPOINT = num('CURATION_MAX_PER_ENDPOINT', 5)
const FETCH_TIMEOUT_MS = num('CURATION_FETCH_TIMEOUT_MS', 45000)

const BFS_DEPTH_CAP = 6
const PAR_MIN = 3
const PAR_MAX = 5
const ONBOARDING_PAR = 2
const PATH_COUNT_CAP = 50
const EXAMPLE_PATHS_K = 3
const DAILY_DAYS = 60
const DAILY_START = '2026-06-29'
const ENDPOINT_COOLDOWN_DAYS = 30

// ── Tiny utilities ───────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const sha = (s: string) => createHash('sha1').update(s).digest('hex')
const spaced = (t: string) => t.replace(/_/g, ' ')
let log = (...a: unknown[]) => console.log(...a)

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

/** Bounded-concurrency map with a small inter-dispatch delay (rate-limit). */
async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, i: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  async function worker() {
    while (true) {
      const i = next++
      if (i >= items.length) return
      if (DELAY_MS) await sleep(DELAY_MS)
      out[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker))
  return out
}

// ── HTTP ────────────────────────────────────────────────────────────────

async function httpGet(url: string): Promise<{ status: number; body: string }> {
  const MAX = 5
  for (let attempt = 0; attempt < MAX; attempt++) {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, 'Api-User-Agent': UA, Accept: '*/*' },
        redirect: 'follow',
        signal: ctrl.signal,
      })
      const body = await res.text()
      clearTimeout(t)
      if (res.status === 429 || res.status >= 500) {
        await sleep(1000 * (attempt + 1))
        continue
      }
      return { status: res.status, body }
    } catch {
      // transient connection error (DNS, reset, timeout): back off and retry.
      clearTimeout(t)
      await sleep(900 * (attempt + 1))
    }
  }
  // Give up on THIS url without aborting the whole build. A skipped article is
  // simply omitted from the graph, which can only overstate par (safe).
  return { status: 0, body: '' }
}

/**
 * Fetch the canonical Parsoid HTML for a title. NOT disk-cached: the small
 * parsed link-set is cached instead (see parseArticle / PARSED_DIR), so reruns
 * are fast without writing ~1MB of raw HTML per article to disk.
 */
async function fetchHtml(title: string): Promise<string | null> {
  const url = `https://en.wikipedia.org/w/rest.php/v1/page/${encodeURIComponent(title)}/html`
  let status = 0
  let body = ''
  try {
    ;({ status, body } = await httpGet(url))
  } catch {
    status = 0
  }
  if (status !== 200 || body.length < 200) {
    log(`  ! html ${status} for "${title}" (skipped)`)
    return null
  }
  return body
}

interface ResolvedTitle {
  input: string
  canonicalTitle: string // spaced display title
  canonicalKey: string
  pageId: number | null
  ns: number | null
  missing: boolean
}

/** Batch redirect + namespace resolution via the free Action API (50/call). */
async function resolveTitles(titles: string[]): Promise<Map<string, ResolvedTitle>> {
  const result = new Map<string, ResolvedTitle>()
  const alias = aliasMap // module-level, populated here
  const uniq = [...new Set(titles)]
  for (let i = 0; i < uniq.length; i += 50) {
    const chunk = uniq.slice(i, i + 50)
    const url =
      'https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&redirects=1&titles=' +
      encodeURIComponent(chunk.join('|'))
    const { status, body } = await httpGet(url)
    if (status !== 200) {
      log(`  ! action ${status} for a chunk`)
      continue
    }
    const j = JSON.parse(body) as {
      query?: {
        normalized?: { from: string; to: string }[]
        redirects?: { from: string; to: string }[]
        pages?: { title: string; ns?: number; pageid?: number; missing?: boolean }[]
      }
    }
    const q = j.query ?? {}
    const norm = new Map<string, string>()
    for (const n of q.normalized ?? []) norm.set(n.from, n.to)
    const redir = new Map<string, string>()
    for (const r of q.redirects ?? []) redir.set(r.from, r.to)
    const pageByTitle = new Map<string, { ns?: number; pageid?: number; missing?: boolean }>()
    for (const p of q.pages ?? []) pageByTitle.set(p.title, p)

    // record alias edges (key -> key) for redirect collapse on the graph
    for (const [from, to] of norm) alias.set(normalizeTitleKey(from), normalizeTitleKey(to))
    for (const [from, to] of redir) alias.set(normalizeTitleKey(from), normalizeTitleKey(to))

    for (const input of chunk) {
      const afterNorm = norm.get(input) ?? input
      const canonical = redir.get(afterNorm) ?? afterNorm
      const page = pageByTitle.get(canonical)
      const key = normalizeTitleKey(canonical)
      alias.set(normalizeTitleKey(input), key)
      result.set(input, {
        input,
        canonicalTitle: spaced(canonical),
        canonicalKey: key,
        pageId: page?.pageid ?? null,
        ns: page?.ns ?? null,
        missing: !!page?.missing || !page,
      })
      if (page && !page.missing && page.pageid != null) displayByKey.set(key, spaced(canonical))
    }
  }
  return result
}

// ── Graph model ──────────────────────────────────────────────────────────

interface Node {
  key: string
  title: string // spaced canonical display
  pageId: number | null
  links: { key: string; title: string }[] // raw clickable neighbours (case-preserved title)
  htmlPath: string
  endpoint: boolean
  themes: Theme[]
}

const aliasMap = new Map<string, string>() // rawKey -> canonicalKey (transitive after closure)
const displayByKey = new Map<string, string>() // key -> spaced display title
const nodes = new Map<string, Node>()

/** Follow alias chains to a fixpoint (collapses normalize+redirect chains). */
function canon(key: string): string {
  let k = key
  const seen = new Set<string>()
  while (aliasMap.has(k) && aliasMap.get(k) !== k && !seen.has(k)) {
    seen.add(k)
    k = aliasMap.get(k)!
  }
  return k
}

/** Parse a fetched article into a node (disk-cached parse for fast re-runs). */
async function parseArticle(
  title: string,
  endpoint: boolean,
  themes: Theme[],
): Promise<Node | null> {
  const reqKey = normalizeTitleKey(title)
  const htmlPath = join(HTML_DIR, sha(reqKey) + '.html')
  const parsedPath = join(PARSED_DIR, sha(reqKey) + '.json')

  let parsed: { key: string; title: string; pageId: number | null; links: { key: string; title: string }[] } | null = null
  if (await exists(parsedPath)) {
    try {
      parsed = JSON.parse(await readFile(parsedPath, 'utf8'))
    } catch {
      parsed = null
    }
  }
  if (!parsed) {
    const html = await fetchHtml(title)
    if (!html) return null
    const r = extractClickableLinks(html)
    const canonKey = normalizeTitleKey(r.canonicalTitle || title)
    // case-preserved neighbour titles from the served HTML's data-tg-to
    const links: { key: string; title: string }[] = []
    const seen = new Set<string>()
    for (const m of r.servedHtml.matchAll(/data-tg-to="([^"]*)"/g)) {
      const t = unescAttr(m[1])
      const k = normalizeTitleKey(t)
      if (seen.has(k)) continue
      seen.add(k)
      links.push({ key: k, title: spaced(t) })
    }
    parsed = {
      key: canonKey,
      title: displayByKey.get(canonKey) ?? spaced(r.canonicalTitle || title),
      pageId: r.pageId,
      links,
    }
    await writeFile(parsedPath, JSON.stringify(parsed))
    aliasMap.set(reqKey, canonKey)
  }

  aliasMap.set(reqKey, parsed.key)
  const node: Node = {
    key: parsed.key,
    title: displayByKey.get(parsed.key) ?? parsed.title,
    pageId: parsed.pageId,
    links: parsed.links,
    htmlPath,
    endpoint,
    themes,
  }
  return node
}

function unescAttr(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function addNode(node: Node) {
  const existing = nodes.get(node.key)
  if (!existing) {
    nodes.set(node.key, node)
    return
  }
  if (node.endpoint) {
    existing.endpoint = true
    existing.themes = [...new Set([...existing.themes, ...node.themes])]
  }
  if (existing.pageId == null && node.pageId != null) existing.pageId = node.pageId
}

// ── BFS over the body-only graph (forward from a source) ──────────────────

interface Bfs {
  dist: Map<string, number>
  preds: Map<string, string[]>
}

let adj: Map<string, string[]>

function buildAdjacency() {
  adj = new Map()
  for (const node of nodes.values()) {
    const out = new Set<string>()
    for (const link of node.links) {
      const ck = canon(link.key)
      if (ck === node.key) continue
      if (nodes.has(ck)) out.add(ck) // traversal stays inside the fetched universe
    }
    adj.set(node.key, [...out])
  }
}

function bfs(source: string): Bfs {
  const dist = new Map<string, number>([[source, 0]])
  const preds = new Map<string, string[]>()
  let frontier = [source]
  for (let depth = 0; depth < BFS_DEPTH_CAP && frontier.length; depth++) {
    const nextFrontier: string[] = []
    for (const u of frontier) {
      const du = dist.get(u)!
      for (const v of adj.get(u) ?? []) {
        const dv = dist.get(v)
        if (dv === undefined) {
          dist.set(v, du + 1)
          preds.set(v, [u])
          nextFrontier.push(v)
        } else if (dv === du + 1) {
          preds.get(v)!.push(u)
        }
      }
    }
    frontier = nextFrontier
  }
  return { dist, preds }
}

/** Count distinct shortest paths (capped) via DP over the BFS predecessor DAG. */
function countPaths(b: Bfs, target: string): number {
  const order = [...b.dist.entries()].sort((a, c) => a[1] - c[1]).map((e) => e[0])
  const cnt = new Map<string, number>()
  for (const node of order) {
    if (b.dist.get(node) === 0) {
      cnt.set(node, 1)
      continue
    }
    let c = 0
    for (const p of b.preds.get(node) ?? []) c += cnt.get(p) ?? 0
    cnt.set(node, Math.min(c, PATH_COUNT_CAP))
  }
  return cnt.get(target) ?? 0
}

/** Up to K distinct shortest paths (source..target), each a list of node keys. */
function examplePaths(b: Bfs, target: string, k: number): string[][] {
  const paths: string[][] = []
  const build = (node: string, acc: string[]) => {
    if (paths.length >= k) return
    const preds = b.preds.get(node)
    if (!preds || preds.length === 0) {
      paths.push([node, ...acc])
      return
    }
    for (const p of preds) {
      if (paths.length >= k) return
      build(p, [node, ...acc])
    }
  }
  build(target, [])
  return paths
}

// ── Validation: re-extract from cached live HTML, assert each hop survives ──

const liveLinkCache = new Map<string, Set<string>>()
async function liveLinks(key: string): Promise<Set<string>> {
  const hit = liveLinkCache.get(key)
  if (hit) return hit
  const node = nodes.get(key)
  const set = new Set<string>()
  // Source the clickable set from the parsed node (the same extractClickableLinks
  // output, persisted in the small parsed cache). Canonicalized so it matches the
  // node-key space the BFS adjacency and path keys use.
  if (node) for (const link of node.links) set.add(canon(link.key))
  liveLinkCache.set(key, set)
  return set
}

/** Each hop's link must be present in the previous article's live clickable set. */
async function validatePath(pathKeys: string[]): Promise<boolean> {
  for (let i = 0; i < pathKeys.length - 1; i++) {
    const from = pathKeys[i]
    const to = pathKeys[i + 1]
    const links = await liveLinks(from)
    // the next hop is reachable iff some live clickable link canonicalizes to it
    let ok = links.has(to)
    if (!ok) {
      for (const lk of links) {
        if (canon(lk) === to) {
          ok = true
          break
        }
      }
    }
    if (!ok) return false
  }
  return true
}

// ── Output types ──────────────────────────────────────────────────────────

type Difficulty = 'easy' | 'medium' | 'hard'

interface OutPair {
  startTitle: string
  startPageId: number
  targetTitle: string
  targetPageId: number
  par: number
  shortestPathCount: number
  difficulty: Difficulty
  themeTags: Theme[]
  examplePaths: { title: string; pageId: number }[][]
  isDailyEligible: boolean
  isOnboarding: boolean
  graphVersion: string
}

interface OutSeries {
  title: string
  themeTag: Theme
  length: number
  pairTitles: [string, string][]
  difficultyArc: Difficulty[]
}

interface OutDaily {
  dateUTC: string
  number: number
  startTitle: string
  targetTitle: string
}

interface OutDistanceMap {
  targetTitle: string
  targetPageId: number
  graphVersion: string
  // canonicalTitle (normalizeTitleKey form) -> min hops X->target, capped at
  // DISTANCE_MAP_HOP_CAP. Absent key => beyond the cap (or outside the universe).
  distances: Record<string, number>
}

const GRAPH_VERSION = 'v1-bootstrap'
const diffForPar = (par: number): Difficulty => (par === 3 ? 'easy' : par === 4 ? 'medium' : 'hard')

function pathToNodes(keys: string[]): { title: string; pageId: number }[] {
  return keys.map((k) => {
    const n = nodes.get(k)!
    return { title: n.title, pageId: n.pageId ?? 0 }
  })
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  await mkdir(HTML_DIR, { recursive: true })
  await mkdir(PARSED_DIR, { recursive: true })
  await mkdir(dirname(OUT_FILE), { recursive: true })

  log(`Tangent curation build (${GRAPH_VERSION})`)
  log(`  endpoints=${ENDPOINTS.length} connectors=${CONNECTORS.length} expansion<=${EXPANSION_LIMIT}`)

  // Phase A: resolve endpoint + connector titles to canonical id/ns ----------
  log('\n[A] resolving endpoint + connector titles ...')
  const seedTitles = [...ENDPOINTS.map((e) => e.title), ...CONNECTORS]
  const resolved = await resolveTitles(seedTitles)

  const endpointThemes = new Map<string, Theme[]>()
  const endpointEligible = new Set<string>()
  const round1Titles = new Map<string, { endpoint: boolean; themes: Theme[] }>() // canonical title -> meta

  for (const e of ENDPOINTS) {
    const r = resolved.get(e.title)
    if (!r || r.missing || r.ns !== 0 || r.pageId == null) {
      log(`  - drop endpoint (missing/non-article): ${e.title}`)
      continue
    }
    endpointEligible.add(r.canonicalKey)
    const merged = [...new Set([...(endpointThemes.get(r.canonicalKey) ?? []), ...e.themes])]
    endpointThemes.set(r.canonicalKey, merged)
    round1Titles.set(r.canonicalTitle, { endpoint: true, themes: merged })
  }
  for (const c of CONNECTORS) {
    const r = resolved.get(c)
    if (!r || r.missing || r.ns !== 0 || r.pageId == null) continue
    if (endpointEligible.has(r.canonicalKey)) continue
    if (!round1Titles.has(r.canonicalTitle)) round1Titles.set(r.canonicalTitle, { endpoint: false, themes: [] })
  }
  log(`  eligible endpoints=${endpointEligible.size} round-1 universe=${round1Titles.size}`)

  // Phase B: fetch + parse round-1 universe ----------------------------------
  log('\n[B] fetching round-1 articles (pool + connectors) ...')
  const round1 = [...round1Titles.entries()]
  let done = 0
  await mapPool(round1, CONCURRENCY, async ([title, meta]) => {
    const node = await parseArticle(title, meta.endpoint, meta.themes)
    if (node) {
      if (node.pageId == null) node.pageId = resolved.get(title)?.pageId ?? null
      addNode(node)
    }
    if (++done % 100 === 0) log(`  ... ${done}/${round1.length}`)
  })
  log(`  nodes after round 1: ${nodes.size}`)

  // Phase C: pick the most common bridges as the expansion layer -------------
  log('\n[C] selecting expansion layer (most-linked bridges) ...')
  const freq = new Map<string, { count: number; title: string }>()
  for (const node of nodes.values()) {
    for (const link of node.links) {
      const ck = canon(link.key)
      if (nodes.has(ck)) continue // already in the universe
      const cur = freq.get(ck)
      if (cur) cur.count++
      else freq.set(ck, { count: 1, title: link.title })
    }
  }
  const expansionPicks = [...freq.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, EXPANSION_LIMIT)
    .map(([, v]) => v.title)
  log(`  candidate bridges=${freq.size}, picking top ${expansionPicks.length}`)

  // resolve the picks (collapse redirects, drop non-articles), then fetch
  const expResolved = await resolveTitles(expansionPicks)
  const expTitles = new Set<string>()
  for (const t of expansionPicks) {
    const r = expResolved.get(t)
    if (!r || r.missing || r.ns !== 0 || r.pageId == null) continue
    if (nodes.has(r.canonicalKey)) continue
    expTitles.add(r.canonicalTitle)
  }

  // Phase D: fetch + parse expansion layer -----------------------------------
  log(`\n[D] fetching ${expTitles.size} expansion articles ...`)
  const expList = [...expTitles.keys()]
  done = 0
  await mapPool(expList, CONCURRENCY, async (title) => {
    const node = await parseArticle(title, false, [])
    if (node) {
      if (node.pageId == null) node.pageId = expResolved.get(title)?.pageId ?? null
      addNode(node)
    }
    if (++done % 100 === 0) log(`  ... ${done}/${expList.length}`)
  })
  log(`  total nodes: ${nodes.size}`)

  // Phase E: build adjacency over the fetched universe -----------------------
  log('\n[E] building adjacency ...')
  buildAdjacency()
  let edges = 0
  for (const a of adj.values()) edges += a.length
  log(`  ${nodes.size} nodes, ${edges} intra-universe edges`)

  // Phase F+G: BFS from every endpoint, collect candidate pairs --------------
  log('\n[F] BFS from every endpoint, collecting candidate pairs ...')
  const sources = [...endpointEligible].filter((k) => nodes.has(k))
  interface Candidate {
    startKey: string
    targetKey: string
    par: number
    count: number
    pathKeys: string[][]
  }
  const candidates: Candidate[] = []
  for (const s of sources) {
    const b = bfs(s)
    for (const t of sources) {
      if (t === s) continue
      const par = b.dist.get(t)
      if (par === undefined) continue
      if (par < ONBOARDING_PAR || par > PAR_MAX) continue
      const paths = examplePaths(b, t, EXAMPLE_PATHS_K)
      if (!paths.length) continue
      const count = countPaths(b, t)
      candidates.push({ startKey: s, targetKey: t, par, count, pathKeys: paths })
    }
  }
  log(`  raw candidates (par ${ONBOARDING_PAR}-${PAR_MAX}): ${candidates.length}`)

  // Phase H: validate the headline path of each candidate --------------------
  log('\n[H] validating candidate paths against live clickable sets ...')
  const valid: Candidate[] = []
  let dropped = 0
  for (const c of candidates) {
    const ok = await validatePath(c.pathKeys[0])
    if (ok) valid.push(c)
    else dropped++
  }
  log(`  validated=${valid.length} dropped=${dropped}`)

  // Phase I: select the curated pair set (par 3-5), diverse + balanced -------
  log('\n[I] selecting curated pairs ...')
  const mainCands = valid.filter((c) => c.par >= PAR_MIN && c.par <= PAR_MAX)
  // score: prefer themed, multi-path, mid-fame variety; sort then cap with a
  // per-endpoint quota so no single endpoint dominates the pool.
  const themeOf = (c: Candidate): Theme[] => {
    const a = new Set(endpointThemes.get(c.startKey) ?? [])
    return (endpointThemes.get(c.targetKey) ?? []).filter((t) => a.has(t))
  }
  const score = (c: Candidate) =>
    (themeOf(c).length > 0 ? 2 : 0) + Math.min(c.count, 4) * 0.5 - (c.count === 1 ? 1 : 0)
  mainCands.sort((a, b) => score(b) - score(a) || b.count - a.count)

  const perEndpoint = new Map<string, number>()
  const usedPairKey = new Set<string>()
  const pairs: OutPair[] = []
  const byDiff: Record<Difficulty, number> = { easy: 0, medium: 0, hard: 0 }
  for (const c of mainCands) {
    if (pairs.length >= MAX_PAIRS) break
    const pk = `${c.startKey}>${c.targetKey}`
    if (usedPairKey.has(pk)) continue
    if ((perEndpoint.get(c.startKey) ?? 0) >= MAX_PER_ENDPOINT) continue
    if ((perEndpoint.get(c.targetKey) ?? 0) >= MAX_PER_ENDPOINT) continue
    const difficulty = diffForPar(c.par)
    const tags = themeOf(c)
    const dailyEligible = difficulty === 'hard' ? true : c.count >= 2
    const start = nodes.get(c.startKey)!
    const target = nodes.get(c.targetKey)!
    if (start.pageId == null || target.pageId == null) continue
    pairs.push({
      startTitle: start.title,
      startPageId: start.pageId,
      targetTitle: target.title,
      targetPageId: target.pageId,
      par: c.par,
      shortestPathCount: c.count,
      difficulty,
      themeTags: tags,
      examplePaths: c.pathKeys.map(pathToNodes),
      isDailyEligible: dailyEligible,
      isOnboarding: false,
      graphVersion: GRAPH_VERSION,
    })
    usedPairKey.add(pk)
    perEndpoint.set(c.startKey, (perEndpoint.get(c.startKey) ?? 0) + 1)
    perEndpoint.set(c.targetKey, (perEndpoint.get(c.targetKey) ?? 0) + 1)
    byDiff[difficulty]++
  }
  log(`  selected pairs=${pairs.length} (easy=${byDiff.easy} medium=${byDiff.medium} hard=${byDiff.hard})`)

  // Phase J: onboarding pairs (par 2, very famous, multi-path preferred) ------
  log('\n[J] selecting onboarding pairs (par 2) ...')
  const onboardCands = valid
    .filter((c) => c.par === ONBOARDING_PAR)
    .sort((a, b) => b.count - a.count)
  const onboardPerEndpoint = new Map<string, number>()
  const onboardSeen = new Set<string>()
  let onboardingCount = 0
  for (const c of onboardCands) {
    if (onboardingCount >= 10) break
    const pk = `${c.startKey}>${c.targetKey}`
    if (onboardSeen.has(pk) || onboardSeen.has(`${c.targetKey}>${c.startKey}`)) continue
    if ((onboardPerEndpoint.get(c.startKey) ?? 0) >= 2) continue
    if ((onboardPerEndpoint.get(c.targetKey) ?? 0) >= 2) continue
    const start = nodes.get(c.startKey)!
    const target = nodes.get(c.targetKey)!
    if (start.pageId == null || target.pageId == null) continue
    pairs.push({
      startTitle: start.title,
      startPageId: start.pageId,
      targetTitle: target.title,
      targetPageId: target.pageId,
      par: c.par,
      shortestPathCount: c.count,
      difficulty: 'easy',
      themeTags: themeOf(c),
      examplePaths: c.pathKeys.map(pathToNodes),
      isDailyEligible: false,
      isOnboarding: true,
      graphVersion: GRAPH_VERSION,
    })
    onboardSeen.add(pk)
    onboardPerEndpoint.set(c.startKey, (onboardPerEndpoint.get(c.startKey) ?? 0) + 1)
    onboardPerEndpoint.set(c.targetKey, (onboardPerEndpoint.get(c.targetKey) ?? 0) + 1)
    onboardingCount++
  }
  log(`  onboarding pairs=${onboardingCount}`)

  // Phase K: themed series (length 3 or 5, escalating difficulty) ------------
  log('\n[K] building themed series ...')
  const dailyPairs = pairs.filter((p) => !p.isOnboarding)
  const themeNames: Record<Theme, string> = {
    science: 'Science', history: 'History', geography: 'Geography', sports: 'Sport',
    music: 'Music', film: 'Film & TV', food: 'Food & Drink', animals: 'Animals & Nature',
    art: 'Art', technology: 'Technology', mythology: 'Myth & Religion', popculture: 'Pop Culture',
  }
  const allThemes = Object.keys(themeNames) as Theme[]
  const series: OutSeries[] = []
  for (const theme of allThemes) {
    const inTheme = dailyPairs.filter((p) => p.themeTags.includes(theme))
    if (inTheme.length < 3) continue
    const ordered = [...inTheme].sort((a, b) => a.par - b.par)
    const length = ordered.length >= 5 ? 5 : 3
    // escalate difficulty across the gauntlet; dedupe endpoints within a series
    const picked: OutPair[] = []
    const used = new Set<string>()
    for (const p of ordered) {
      if (picked.length >= length) break
      if (used.has(p.startTitle) || used.has(p.targetTitle)) continue
      picked.push(p)
      used.add(p.startTitle)
      used.add(p.targetTitle)
    }
    if (picked.length < 3) continue
    picked.sort((a, b) => a.par - b.par)
    series.push({
      title: `${themeNames[theme]} gauntlet`,
      themeTag: theme,
      length: picked.length >= 5 ? 5 : 3,
      pairTitles: picked.slice(0, picked.length >= 5 ? 5 : 3).map((p) => [p.startTitle, p.targetTitle] as [string, string]),
      difficultyArc: picked.slice(0, picked.length >= 5 ? 5 : 3).map((p) => p.difficulty),
    })
  }
  log(`  series=${series.length}`)

  // Phase L: daily queue (Mon-easy .. Sun-hard, endpoint cooldown) -----------
  log('\n[L] building daily queue ...')
  const dailyByDiff: Record<Difficulty, OutPair[]> = { easy: [], medium: [], hard: [] }
  for (const p of dailyPairs) if (p.isDailyEligible) dailyByDiff[p.difficulty].push(p)
  for (const d of Object.keys(dailyByDiff) as Difficulty[]) dailyByDiff[d].sort((a, b) => b.shortestPathCount - a.shortestPathCount)
  // weekday arc: 0=Sun..6=Sat
  const weekdayDiff: Difficulty[] = ['hard', 'easy', 'easy', 'medium', 'medium', 'medium', 'hard']
  const lastUsed = new Map<string, number>() // endpoint title -> day index
  const cursor: Record<Difficulty, number> = { easy: 0, medium: 0, hard: 0 }
  const dailyQueue: OutDaily[] = []
  const start = new Date(DAILY_START + 'T00:00:00Z')
  const pickFor = (want: Difficulty, dayIdx: number): OutPair | null => {
    const order: Difficulty[] = [want, ...(['easy', 'medium', 'hard'] as Difficulty[]).filter((d) => d !== want)]
    for (const d of order) {
      const arr = dailyByDiff[d]
      for (let scan = 0; scan < arr.length; scan++) {
        const idx = (cursor[d] + scan) % arr.length
        const p = arr[idx]
        const su = lastUsed.get(p.startTitle)
        const tu = lastUsed.get(p.targetTitle)
        const fresh =
          (su === undefined || dayIdx - su > ENDPOINT_COOLDOWN_DAYS) &&
          (tu === undefined || dayIdx - tu > ENDPOINT_COOLDOWN_DAYS)
        if (fresh) {
          cursor[d] = (idx + 1) % arr.length
          return p
        }
      }
    }
    return null
  }
  for (let i = 0; i < DAILY_DAYS; i++) {
    const date = new Date(start.getTime() + i * 86400000)
    const iso = date.toISOString().slice(0, 10)
    const want = weekdayDiff[date.getUTCDay()]
    const p = pickFor(want, i)
    if (!p) {
      log(`  ! ran out of fresh pairs at day ${i + 1} (${iso}); stopping queue`)
      break
    }
    dailyQueue.push({ dateUTC: iso, number: i + 1, startTitle: p.startTitle, targetTitle: p.targetTitle })
    lastUsed.set(p.startTitle, i)
    lastUsed.set(p.targetTitle, i)
  }
  log(`  daily days=${dailyQueue.length}`)

  // Phase R: reverse-BFS distance maps (one per distinct target) --------------
  // distance(X) = min in-article link hops X -> target = a BFS over the
  // TRANSPOSED adjacency starting at the target. We transpose the SAME
  // `adj` the pair BFS used, so a map hop == a legal game move, byte-for-byte.
  // Capped at DISTANCE_MAP_HOP_CAP; keys are node keys (normalizeTitleKey form),
  // which the runtime re-normalizes idempotently on lookup.
  log('\n[R] building reverse-BFS distance maps ...')
  const radj = new Map<string, string[]>()
  for (const [u, outs] of adj) {
    for (const v of outs) {
      const list = radj.get(v)
      if (list) list.push(u)
      else radj.set(v, [u])
    }
  }
  // distinct targets across ALL shipped pairs (curated + onboarding)
  const targetKeys = [...new Set(pairs.map((p) => normalizeTitleKey(p.targetTitle)))]
  const distanceMaps: OutDistanceMap[] = []
  let coverageEntries = 0
  for (const tk of targetKeys) {
    const target = nodes.get(tk)
    if (!target || target.pageId == null) {
      log(`  ! skip target with no node/pageId: ${tk}`)
      continue
    }
    const dist = new Map<string, number>([[tk, 0]])
    let frontier = [tk]
    for (let depth = 0; depth < DISTANCE_MAP_HOP_CAP && frontier.length; depth++) {
      const next: string[] = []
      for (const u of frontier) {
        const du = dist.get(u)!
        for (const v of radj.get(u) ?? []) {
          if (!dist.has(v)) {
            dist.set(v, du + 1)
            next.push(v)
          }
        }
      }
      frontier = next
    }
    const distances: Record<string, number> = {}
    for (const [k, d] of dist) distances[k] = d
    coverageEntries += dist.size
    distanceMaps.push({
      targetTitle: target.title,
      targetPageId: target.pageId,
      graphVersion: GRAPH_VERSION,
      distances,
    })
  }
  log(`  distance maps=${distanceMaps.length} (avg ${distanceMaps.length ? Math.round(coverageEntries / distanceMaps.length) : 0} reachable nodes/map within ${DISTANCE_MAP_HOP_CAP} hops)`)

  // Phase M: write the seed --------------------------------------------------
  const seed = { pairs, series, dailyQueue, distanceMaps }
  await writeFile(OUT_FILE, JSON.stringify(seed, null, 2))

  // ── Summary ──────────────────────────────────────────────────────────────
  const themeCounts = new Map<Theme, number>()
  for (const p of pairs) for (const t of p.themeTags) themeCounts.set(t, (themeCounts.get(t) ?? 0) + 1)
  const onboarding = pairs.filter((p) => p.isOnboarding)
  log('\n================ SUMMARY ================')
  log(`graphVersion        ${GRAPH_VERSION}`)
  log(`nodes fetched       ${nodes.size}`)
  log(`pairs total         ${pairs.length}  (curated=${pairs.length - onboarding.length}, onboarding=${onboarding.length})`)
  log(`  easy (par 3)      ${pairs.filter((p) => !p.isOnboarding && p.difficulty === 'easy').length}`)
  log(`  medium (par 4)    ${pairs.filter((p) => !p.isOnboarding && p.difficulty === 'medium').length}`)
  log(`  hard (par 5)      ${pairs.filter((p) => !p.isOnboarding && p.difficulty === 'hard').length}`)
  log(`  onboarding (par 2)${onboarding.length}`)
  log(`daily-eligible      ${dailyPairs.filter((p) => p.isDailyEligible).length}`)
  log(`series              ${series.length}`)
  log(`daily queue days    ${dailyQueue.length}`)
  log(`distance maps       ${distanceMaps.length}`)
  log('themes:')
  for (const t of allThemes) if (themeCounts.get(t)) log(`  ${t.padEnd(12)} ${themeCounts.get(t)}`)
  log('\nexample pairs:')
  for (const p of pairs.filter((x) => !x.isOnboarding).slice(0, 6)) {
    const route = p.examplePaths[0].map((n) => n.title).join(' -> ')
    log(`  [${p.difficulty} par ${p.par}, ${p.shortestPathCount} route(s)] ${route}`)
  }
  log(`\nwrote ${OUT_FILE}`)
  log('========================================')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
