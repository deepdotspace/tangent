/**
 * The armer unit tests prove `cronRoomName()` returns the right string. They
 * cannot prove worker.ts calls it with the right argument — and that is the
 * failure this whole change exists to avoid. `APP_NAME` ("tangent") and
 * `DEEPSPACE_APP_ID` ("app_01KZ4FMTXKV24V9BJ9N1XYST4J") are both on `Env` and
 * both plausible-looking; arming the wrong one addresses a second, empty
 * CronRoom, returns a healthy response, and leaves roll-daily exactly as dead
 * as it was.
 *
 * So this drives the real middleware through `app.fetch()` and asserts the
 * name the DO namespace is actually addressed with, plus that the crawler
 * surfaces stay out of it.
 *
 * The armer latches once per isolate and the latch lives in worker.ts's module
 * scope, so every test here loads the worker through `freshIsolate()` —
 * resetModules + dynamic import — to get an unlatched one. Sharing a module
 * instance would let the first test consume the single arming attempt and the
 * rest would assert against silence and pass for the wrong reason.
 */

import { describe, expect, it, vi, afterEach } from 'vitest'
import type { Env } from '../worker.js'
import { SCOPE_ID } from './constants'

afterEach(() => {
  vi.restoreAllMocks()
})

function harness(overrides: Partial<Record<string, unknown>> = {}) {
  const namedIds: string[] = []
  const pinged: string[] = []

  const env = {
    APP_NAME: 'tangent',
    DEEPSPACE_APP_ID: 'app_01KZ4FMTXKV24V9BJ9N1XYST4J',
    CRON_ROOMS: {
      idFromName: (name: string) => {
        namedIds.push(name)
        return { name }
      },
      get: () => ({
        fetch: (url: string) => {
          pinged.push(url)
          // CronRoom.fetch() arms, then falls through to BaseRoom, which has
          // no route for a bare path. 404 is the healthy response here.
          return Promise.resolve(new Response('Not Found', { status: 404 }))
        },
      }),
    },
    ASSETS: {
      fetch: () =>
        Promise.resolve(
          new Response('<html><head></head><body></body></html>', {
            status: 200,
            headers: { 'content-type': 'text/html' },
          }),
        ),
    },
    ...overrides,
  } as unknown as Env

  const waited: Promise<unknown>[] = []
  const ctx = {
    waitUntil: (p: Promise<unknown>) => {
      waited.push(p)
    },
    passThroughOnException: () => {},
  } as unknown as ExecutionContext

  return { env, ctx, namedIds, pinged, waited }
}

/** A worker module with a fresh, unlatched armer — i.e. a cold isolate. */
async function freshIsolate() {
  vi.resetModules()
  return (await import('../worker.js')).default
}

// Any /api/* route works; this one needs no auth and swallows its own errors.
const REQ = () => new Request('https://tangent.app.space/api/integrations')

describe('cron arming middleware', () => {
  it('addresses the CronRoom by APP_NAME, never by DEEPSPACE_APP_ID', async () => {
    const app = await freshIsolate()
    const h = harness()

    await app.fetch(REQ(), h.env, h.ctx)
    await Promise.all(h.waited)

    expect(h.namedIds).toEqual(['app:tangent'])
    expect(h.namedIds[0]).toBe(SCOPE_ID)
    expect(h.namedIds[0]).not.toContain('app_01KZ')
    expect(h.pinged).toEqual(['https://cron-arm/ping'])
  })

  it('defers the ping to waitUntil rather than awaiting it in the request path', async () => {
    const app = await freshIsolate()
    const h = harness()

    await app.fetch(REQ(), h.env, h.ctx)

    // The response was produced with the arming promise parked in waitUntil,
    // never upstream of it.
    expect(h.waited).toHaveLength(1)
    await Promise.all(h.waited)
  })

  it('pings once across concurrent requests in the same isolate', async () => {
    const app = await freshIsolate()
    const h = harness()

    await Promise.all([
      app.fetch(REQ(), h.env, h.ctx),
      app.fetch(REQ(), h.env, h.ctx),
      app.fetch(REQ(), h.env, h.ctx),
    ])
    await Promise.all(h.waited)

    expect(h.pinged).toHaveLength(1)
    expect(h.waited).toHaveLength(1)
  })

  it('serves the request normally when the cron room binding is missing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const app = await freshIsolate()
    // Throws synchronously inside the middleware, before the route handler.
    const h = harness({ CRON_ROOMS: undefined })

    const res = await app.fetch(REQ(), h.env, h.ctx)

    expect(res.status).not.toBe(500)
    expect(h.pinged).toEqual([])
  })

  // Unit tests drive real routes as `app.fetch(req, env)`. Arming must stay
  // invisible to them rather than making every such call a new thing to stub.
  it('is a no-op when there is no ExecutionContext to defer onto', async () => {
    const app = await freshIsolate()
    const h = harness()

    const res = await app.fetch(REQ(), h.env)

    expect(res.status).not.toBe(500)
    expect(h.pinged).toEqual([])
  })

  // wrangler.toml sends these to the worker ahead of the asset fallback purely
  // so the OG middleware can inject meta tags. They exist to be fetched by
  // Slack, Twitter and Facebook crawlers — a link preview is not a signal that
  // anyone is using the app, and mounting on `*` would arm from every one.
  it.each(['/today', '/i/ABC123', '/r/run_1', '/c/chal_1', '/f/friend_1'])(
    'does not arm from the %s unfurl route',
    async (path) => {
      const app = await freshIsolate()
      const h = harness()

      await app.fetch(new Request(`https://tangent.app.space${path}`), h.env, h.ctx)
      await Promise.all(h.waited)

      expect(h.pinged).toEqual([])
    },
  )

  it('does not arm from a static asset request', async () => {
    const app = await freshIsolate()
    const h = harness()

    await app.fetch(
      new Request('https://tangent.app.space/assets/index-abc123.css'),
      h.env,
      h.ctx,
    )
    await Promise.all(h.waited)

    expect(h.pinged).toEqual([])
  })
})
