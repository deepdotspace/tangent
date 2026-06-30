/**
 * Daily challenge resolver (FINAL-SPEC §4 DAILY, RESOLUTIONS m7).
 *
 * Get-or-create today's `dailyChallenge` from the seeded queue. If a curated
 * row exists for today's UTC date it is used verbatim; otherwise we mint one
 * from an unused daily-eligible pair and assign the next sequential `number`
 * (day 1 = #1). `uniqueOn: ['dateUTC']` makes the create idempotent under a
 * race (a losing concurrent create is absorbed by a re-read).
 */

import {
  queryRecords,
  createRecord,
  type RecordStoreEnv,
} from './record-store'
import { utcDateString } from './streak'

export interface DailyChallengeRow {
  dateUTC: string
  pairId: string
  number: number
}

interface PairRow {
  isDailyEligible?: number | boolean
  isOnboarding?: number | boolean
}

export async function getOrCreateTodayDaily(env: RecordStoreEnv): Promise<DailyChallengeRow | null> {
  const today = utcDateString()

  const existing = await queryRecords<DailyChallengeRow>(env, 'dailyChallenge', {
    where: { dateUTC: today },
    limit: 1,
  })
  if (existing.length > 0) return existing[0].data

  // No curated row for today — mint one from an unused eligible pair.
  const allDaily = await queryRecords<DailyChallengeRow>(env, 'dailyChallenge', {})
  const usedPairIds = new Set(allDaily.map((r) => r.data.pairId))
  const nextNumber =
    allDaily.reduce((max, r) => Math.max(max, Number(r.data.number) || 0), 0) + 1

  const eligible = await queryRecords<PairRow>(env, 'pairs', {
    where: { isDailyEligible: 1 },
    limit: 500,
  })
  const candidates = eligible.filter((p) => !p.data.isOnboarding)
  const fresh = candidates.filter((p) => !usedPairIds.has(p.recordId))
  const pool = fresh.length > 0 ? fresh : candidates
  if (pool.length === 0) return null

  const pick = pool[Math.floor(Math.random() * pool.length)]
  const row: DailyChallengeRow = { dateUTC: today, pairId: pick.recordId, number: nextNumber }
  const created = await createRecord(env, 'dailyChallenge', row as unknown as Record<string, unknown>)

  if (!created) {
    // Lost a create race (unique dateUTC) — re-read the winner.
    const again = await queryRecords<DailyChallengeRow>(env, 'dailyChallenge', {
      where: { dateUTC: today },
      limit: 1,
    })
    return again.length > 0 ? again[0].data : null
  }
  return row
}
