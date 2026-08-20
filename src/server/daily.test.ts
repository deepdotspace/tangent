/**
 * What roll-daily does on its very first tick.
 *
 * The task has never run, so arming it fires it against a `dailyChallenge`
 * collection whose last row may be months old. The question that decides
 * whether arming is safe is whether the resolver walks the gap — one create
 * per missed day, each one a write — or only ever looks at today. These
 * assertions pin it to the latter, so a future edit that turns it into a
 * backfill loop has to break a test to do it.
 *
 * Driven through a fake RecordRoom stub, so the real tools-API call shapes are
 * exercised without a DO.
 */

import { describe, expect, it, vi } from 'vitest'
import { getOrCreateTodayDaily } from './daily'
import type { RecordStoreEnv } from './record-store'
import { utcDateString } from './streak'

interface ToolCall {
  tool: string
  params: Record<string, unknown>
}

/**
 * A RecordRoom that answers records.query from a fixed table and records every
 * tool call, so a test can assert on what was *written* as well as returned.
 */
function fakeStore(rows: {
  dailyChallenge?: Array<{ recordId: string; data: Record<string, unknown> }>
  pairs?: Array<{ recordId: string; data: Record<string, unknown> }>
}) {
  const calls: ToolCall[] = []
  const daily = rows.dailyChallenge ?? []
  const pairs = rows.pairs ?? []

  const fetch = async (req: Request) => {
    const body = (await req.json()) as ToolCall
    calls.push(body)
    const { tool, params } = body

    if (tool === 'records.query') {
      const table = params.collection === 'pairs' ? pairs : daily
      const where = (params.where ?? {}) as Record<string, unknown>
      const matched = table.filter((r) =>
        Object.entries(where).every(([k, v]) => r.data[k] === v),
      )
      const limited =
        typeof params.limit === 'number' ? matched.slice(0, params.limit) : matched
      return Response.json({
        success: true,
        data: { records: limited, count: limited.length },
      })
    }

    if (tool === 'records.create') {
      return Response.json({ success: true, data: { recordId: 'rec_new' } })
    }

    return Response.json({ success: false, error: `unexpected tool ${tool}` })
  }

  const env = {
    APP_NAME: 'tangent',
    OWNER_USER_ID: 'user_owner',
    RECORD_ROOMS: {
      idFromName: (name: string) => ({ name }),
      get: () => ({ fetch }),
    },
  } as unknown as RecordStoreEnv

  const creates = () => calls.filter((c) => c.tool === 'records.create')
  return { env, calls, creates }
}

const pair = (recordId: string, over: Record<string, unknown> = {}) => ({
  recordId,
  data: { isDailyEligible: 1, isOnboarding: 0, ...over },
})

describe('getOrCreateTodayDaily — the first tick after arming', () => {
  it('creates exactly one row when the last curated day is months stale', async () => {
    // 90 days of nothing. A backfilling resolver would write 90 rows here.
    const store = fakeStore({
      dailyChallenge: [
        { recordId: 'd_old', data: { dateUTC: '2026-05-01', pairId: 'p_used', number: 12 } },
      ],
      pairs: [pair('p_a'), pair('p_b')],
    })

    await getOrCreateTodayDaily(store.env)

    expect(store.creates()).toHaveLength(1)
  })

  it('creates that row for today, and never for a missed day', async () => {
    const store = fakeStore({
      dailyChallenge: [
        { recordId: 'd_old', data: { dateUTC: '2026-05-01', pairId: 'p_used', number: 12 } },
      ],
      pairs: [pair('p_a')],
    })

    await getOrCreateTodayDaily(store.env)

    const created = store.creates()[0].params.data as Record<string, unknown>
    expect(created.dateUTC).toBe(utcDateString())
  })

  it('numbers the new day from the highest existing number, without filling the gap', async () => {
    // #12 was 90 days ago. The next daily is #13 — the skipped days do not
    // each claim a number, because no row is minted for them.
    const store = fakeStore({
      dailyChallenge: [
        { recordId: 'd_1', data: { dateUTC: '2026-04-30', pairId: 'p_x', number: 11 } },
        { recordId: 'd_2', data: { dateUTC: '2026-05-01', pairId: 'p_y', number: 12 } },
      ],
      pairs: [pair('p_a')],
    })

    await getOrCreateTodayDaily(store.env)

    const created = store.creates()[0].params.data as Record<string, unknown>
    expect(created.number).toBe(13)
  })

  // Idempotence is what makes a second tick, a redeploy, or the request path
  // having already minted today's row a no-op rather than a duplicate.
  it('writes nothing when today already has a row', async () => {
    const store = fakeStore({
      dailyChallenge: [
        { recordId: 'd_today', data: { dateUTC: utcDateString(), pairId: 'p_a', number: 40 } },
      ],
      pairs: [pair('p_b')],
    })

    const result = await getOrCreateTodayDaily(store.env)

    expect(store.creates()).toEqual([])
    expect(result?.pairId).toBe('p_a')
  })

  it('makes no integration, AI or outbound call — only RecordRoom reads and one create', async () => {
    const store = fakeStore({ pairs: [pair('p_a')] })

    await getOrCreateTodayDaily(store.env)

    expect(new Set(store.calls.map((c) => c.tool))).toEqual(
      new Set(['records.query', 'records.create']),
    )
  })

  it('prefers a pair that has never been a daily', async () => {
    const store = fakeStore({
      dailyChallenge: [
        { recordId: 'd_1', data: { dateUTC: '2026-05-01', pairId: 'p_used', number: 1 } },
      ],
      pairs: [pair('p_used'), pair('p_fresh')],
    })

    await getOrCreateTodayDaily(store.env)

    const created = store.creates()[0].params.data as Record<string, unknown>
    expect(created.pairId).toBe('p_fresh')
  })

  it('skips onboarding pairs', async () => {
    const store = fakeStore({
      pairs: [pair('p_onboarding', { isOnboarding: 1 }), pair('p_real')],
    })

    await getOrCreateTodayDaily(store.env)

    const created = store.creates()[0].params.data as Record<string, unknown>
    expect(created.pairId).toBe('p_real')
  })

  it('returns null rather than writing anything when no pair is eligible', async () => {
    const store = fakeStore({ pairs: [] })

    await expect(getOrCreateTodayDaily(store.env)).resolves.toBeNull()
    expect(store.creates()).toEqual([])
  })

  it('re-reads the winner instead of retrying when it loses the unique-date race', async () => {
    // Two isolates can tick at once; uniqueOn dateUTC makes the loser's create
    // fail. The loser must settle, not spin.
    const today = utcDateString()
    const store = fakeStore({ pairs: [pair('p_a')] })
    let created = false
    const original = store.env.RECORD_ROOMS.get(store.env.RECORD_ROOMS.idFromName('x')).fetch
    vi.spyOn(store.env.RECORD_ROOMS, 'get').mockReturnValue({
      fetch: async (req: Request) => {
        const body = (await req.clone().json()) as ToolCall
        if (body.tool === 'records.create') {
          created = true
          return Response.json({ success: false, error: 'unique constraint' })
        }
        if (created && body.tool === 'records.query' && body.params.where) {
          const where = body.params.where as Record<string, unknown>
          if (where.dateUTC === today) {
            return Response.json({
              success: true,
              data: {
                records: [
                  { recordId: 'd_winner', data: { dateUTC: today, pairId: 'p_w', number: 9 } },
                ],
                count: 1,
              },
            })
          }
        }
        return original(req)
      },
    } as unknown as DurableObjectStub)

    const result = await getOrCreateTodayDaily(store.env)

    expect(result?.pairId).toBe('p_w')
    vi.restoreAllMocks()
  })
})
