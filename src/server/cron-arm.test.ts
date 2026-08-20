import { describe, it, expect, vi, afterEach } from 'vitest'
import { cronRoomName, createCronArmer } from './cron-arm'
import { APP_NAME, SCOPE_ID } from '../constants'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('cronRoomName (the id that decides whether arming hits the real room)', () => {
  it('addresses the room as app:<APP_NAME>', () => {
    expect(cronRoomName('tangent')).toBe('app:tangent')
  })

  // The footgun: this app keys its rooms by APP_NAME while DEEPSPACE_APP_ID is
  // a completely different string. Arming `app:<DEEPSPACE_APP_ID>` would create
  // a second, empty CronRoom, return a perfectly happy response, and leave
  // roll-daily dead. Pin the id to the key the rest of the app already uses —
  // the same one src/cron.ts hands buildCronContext.
  it('matches SCOPE_ID, the key every other server-side room uses', () => {
    expect(cronRoomName(APP_NAME)).toBe(SCOPE_ID)
  })

  it('is not derived from a DeepSpace app id', () => {
    // The literal DEEPSPACE_APP_ID from wrangler.toml.
    expect(cronRoomName(APP_NAME)).not.toBe('app:app_01KZ4FMTXKV24V9BJ9N1XYST4J')
  })
})

describe('createCronArmer (one ping per isolate, retried on failure)', () => {
  it('pings on the first call and returns something to wait on', async () => {
    const ping = vi.fn().mockResolvedValue(new Response(null, { status: 404 }))
    const arm = createCronArmer()

    const first = arm(ping)
    expect(first).not.toBeNull()
    await first
    expect(ping).toHaveBeenCalledTimes(1)
  })

  it('does not ping again once armed — the alarm self-perpetuates', async () => {
    const ping = vi.fn().mockResolvedValue(new Response(null, { status: 404 }))
    const arm = createCronArmer()

    await arm(ping)
    expect(arm(ping)).toBeNull()
    expect(arm(ping)).toBeNull()
    expect(ping).toHaveBeenCalledTimes(1)
  })

  it('latches immediately, so concurrent requests in one isolate ping once', () => {
    const ping = vi.fn().mockReturnValue(new Promise(() => {}))
    const arm = createCronArmer()

    arm(ping)
    arm(ping)
    arm(ping)
    expect(ping).toHaveBeenCalledTimes(1)
  })

  // A CronRoom that arms and then answers 404 (BaseRoom has no route for a bare
  // path) has still armed. Only a failure means the DO was never reached.
  it('treats a resolved 404 as a successful arming', async () => {
    const ping = vi.fn().mockResolvedValue(new Response('Not Found', { status: 404 }))
    const arm = createCronArmer()

    await arm(ping)
    expect(arm(ping)).toBeNull()
    expect(ping).toHaveBeenCalledTimes(1)
  })

  it('un-latches after a failed ping so a later request retries', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const ping = vi
      .fn()
      .mockRejectedValueOnce(new Error('DO unreachable'))
      .mockResolvedValue(undefined)
    const arm = createCronArmer()

    await arm(ping)
    const retry = arm(ping)
    expect(retry).not.toBeNull()
    await retry
    expect(ping).toHaveBeenCalledTimes(2)
  })

  it('never rejects — a dead cron room must not fail the request it rode in on', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const arm = createCronArmer()
    await expect(arm(() => Promise.reject(new Error('boom')))).resolves.toBeUndefined()
  })

  // The realistic failure is synchronous, not a rejected promise: a missing or
  // renamed CRON_ROOMS binding makes `ns.get(ns.idFromName(...))` throw a
  // TypeError before any promise exists. Unguarded, that escapes the armer and
  // 500s the first request into every new isolate.
  it('never throws when the ping fails synchronously', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const arm = createCronArmer()
    const missingBinding = () => {
      const ns = undefined as unknown as { idFromName: (n: string) => string }
      return Promise.resolve(ns.idFromName('app:tangent'))
    }
    await expect(arm(missingBinding)).resolves.toBeUndefined()
  })

  it('un-latches after a synchronous failure so a later request retries', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const ping = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new TypeError("Cannot read properties of undefined (reading 'idFromName')")
      })
      .mockResolvedValue(undefined)
    const arm = createCronArmer()

    await arm(ping)
    const retry = arm(ping)
    expect(retry).not.toBeNull()
    await retry
    expect(ping).toHaveBeenCalledTimes(2)
  })

  it('gives each isolate its own latch', async () => {
    const ping = vi.fn().mockResolvedValue(undefined)
    await createCronArmer()(ping)
    await createCronArmer()(ping)
    expect(ping).toHaveBeenCalledTimes(2)
  })
})
