/**
 * Seed the curated content into DeepSpace collections via the owner-only
 * `seedCollections` action.
 *
 *   npx tsx scripts/curation/seed.ts            # seeds local dev (localhost:5173)
 *   SEED_BASE=https://tangent.app.space npx tsx scripts/curation/seed.ts
 *
 * Auth: reads APP_OWNER_JWT from .dev.vars (its subject is OWNER_USER_ID, which
 * is what seedCollections gates on). For prod, pass OWNER_JWT=... in the env.
 */
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const BASE = process.env.SEED_BASE ?? 'http://localhost:5173'

const sha8 = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16)
const pairId = (start: string, target: string) => 'p_' + sha8(start.toLowerCase() + '>' + target.toLowerCase())

async function ownerJwt(): Promise<string> {
  if (process.env.OWNER_JWT) return process.env.OWNER_JWT
  const dv = await readFile(join(ROOT, '.dev.vars'), 'utf8')
  const m = dv.match(/^APP_OWNER_JWT=(.+)$/m)
  if (!m) throw new Error('APP_OWNER_JWT not found in .dev.vars')
  return m[1].trim().replace(/^["']|["']$/g, '')
}

async function seed(collection: string, records: Record<string, unknown>[], jwt: string, chunkSize = 100) {
  // chunk so a single call never gets too large (distance maps are ~30 KB each,
  // so they seed in much smaller chunks than the tiny pair/daily rows)
  let inserted = 0
  for (let i = 0; i < records.length; i += chunkSize) {
    const slice = records.slice(i, i + chunkSize)
    const res = await fetch(`${BASE}/api/actions/seedCollections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ collection, records: slice }),
    })
    const text = await res.text()
    let json: any
    try {
      json = JSON.parse(text)
    } catch {
      throw new Error(`${collection}: non-JSON response ${res.status}: ${text.slice(0, 200)}`)
    }
    const got = json?.data?.inserted ?? json?.inserted
    if (!res.ok || got == null) throw new Error(`${collection}: ${res.status} ${text.slice(0, 200)}`)
    inserted += got
  }
  console.log(`  ${collection}: inserted ${inserted}/${records.length}`)
  return inserted
}

async function main() {
  const jwt = await ownerJwt()
  const seedData = JSON.parse(await readFile(join(ROOT, 'src', 'seed', 'curation-seed.json'), 'utf8'))

  // pairs (stable recordId so daily/series can reference them; re-seed upserts).
  // par / shortestPathCount / examplePaths are the HIDDEN-until-finish secret and
  // live in pairSolutions (server-read-only). The public pairs row carries 0/[] —
  // the explicit values OVERWRITE any real values a previous seed wrote, so a
  // re-seed of an existing prod DB scrubs the leak.
  const pairRecords = seedData.pairs.map((p: any) => ({
    recordId: pairId(p.startTitle, p.targetTitle),
    startTitle: p.startTitle,
    startPageId: p.startPageId,
    targetTitle: p.targetTitle,
    targetPageId: p.targetPageId,
    par: 0,
    shortestPathCount: 0,
    examplePaths: [],
    difficulty: p.difficulty,
    themeTags: p.themeTags ?? [],
    // Direct ref to this target's reverse-BFS distance map (keyed by target title);
    // the runtime also falls back to a targetPageId query, but this is the fast path.
    targetDistanceMapId: 'tdm_' + sha8(String(p.targetTitle).toLowerCase()),
    isDailyEligible: !!p.isDailyEligible,
    isOnboarding: !!p.isOnboarding,
    graphVersion: p.graphVersion ?? 'v1-bootstrap',
  }))

  // pairSolutions (server-read-only): the real par + optimal example paths, keyed
  // by the SAME pairId so the async actions can join them server-side.
  const solutionRecords = seedData.pairs.map((p: any) => ({
    recordId: pairId(p.startTitle, p.targetTitle),
    par: p.par,
    shortestPathCount: p.shortestPathCount ?? 1,
    examplePaths: p.examplePaths ?? [],
  }))

  const dailyRecords = (seedData.dailyQueue ?? []).map((d: any) => ({
    recordId: 'daily_' + d.dateUTC,
    dateUTC: d.dateUTC,
    number: d.number,
    pairId: pairId(d.startTitle, d.targetTitle),
  }))

  const seriesRecords = (seedData.series ?? []).map((s: any, i: number) => ({
    recordId: 'series_' + sha8(s.title + i),
    title: s.title,
    themeTag: s.themeTag,
    length: s.length,
    pairIds: (s.pairTitles ?? []).map(([a, b]: [string, string]) => pairId(a, b)),
    difficultyArc: s.difficultyArc ?? [],
  }))

  // targetDistanceMaps (server-read-only): per-target reverse-BFS distance map,
  // powers live progress / cap-rank "closest" / chaos auto-target / one-away glow.
  const distanceMapRecords = (seedData.distanceMaps ?? []).map((m: any) => ({
    recordId: 'tdm_' + sha8(String(m.targetTitle).toLowerCase()),
    targetTitle: m.targetTitle,
    targetPageId: m.targetPageId,
    graphVersion: m.graphVersion ?? 'v1-bootstrap',
    distances: m.distances ?? {},
  }))

  console.log(`Seeding -> ${BASE}`)
  await seed('pairs', pairRecords, jwt)
  await seed('pairSolutions', solutionRecords, jwt)
  await seed('targetDistanceMaps', distanceMapRecords, jwt, 8)
  await seed('dailyChallenge', dailyRecords, jwt)
  await seed('series', seriesRecords, jwt)
  console.log('Seed complete.')
}

main().catch((e) => {
  console.error('SEED FAILED:', e.message)
  process.exit(1)
})
