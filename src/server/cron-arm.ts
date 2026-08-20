/**
 * Cron arming — the one thing that makes roll-daily actually run.
 *
 * The SDK's CronRoom does NOT arm its alarm in the constructor. Arming happens
 * inside its private ensureInitialized(), which runs only when the DO is
 * touched: fetch(), a WebSocket connect, or an alarm. Registering tasks in
 * src/cron.ts is therefore not enough — until something addresses the DO, no
 * alarm is ever scheduled and no task ever fires. Nothing errors; the task is
 * just silently dead forever.
 *
 * Tangent has no client that opens the cron monitor — worker.ts exposes
 * /ws/cron/:roomId but no page calls useCronMonitor, so that socket is never
 * opened — which is exactly why roll-daily has never run. The worker has to
 * poke the room itself. Once poked the room self-sustains: onAlarm() re-arms
 * at the end of every tick and the alarm survives redeploys. That makes arming
 * a one-shot-per-isolate job, not a per-request one.
 */

/**
 * The name the CronRoom DO is addressed by.
 *
 * Deliberately `app:<APP_NAME>` — the key every other server-side room in this
 * app uses (SCOPE_ID in src/constants.ts, what the client mounts RecordScope
 * on, what buildCronContext is handed in src/cron.ts) and the id the
 * /ws/cron/:roomId monitor would be opened with.
 *
 * It is NOT `app:<DEEPSPACE_APP_ID>`. In this app those are two different
 * strings — `tangent` vs `app_01KZ4FMTXKV24V9BJ9N1XYST4J` in wrangler.toml —
 * so addressing the wrong one would arm a second, empty CronRoom whose task
 * table nothing ever reads. The fetch would return a perfectly healthy
 * response and the real task would stay dead.
 */
export function cronRoomName(appName: string): string {
  return `app:${appName}`
}

/**
 * `c.executionCtx`, or null when there isn't one.
 *
 * Hono exposes executionCtx as a *throwing getter*, not an optional property:
 * it raises "This context has no ExecutionContext" whenever the worker was
 * entered as `app.fetch(request, env)` with no third argument, which is how
 * unit tests drive real routes. Arming has to read it before deciding to arm,
 * and reading it is the thing that can throw.
 *
 * Takes a thunk and is generic over its return so the caller keeps whatever
 * ExecutionContext shape its @cloudflare/workers-types version declares —
 * naming the type here would pin it to one (it gained a required `tracing`
 * member, so the bare global no longer matches Hono's).
 */
export function executionCtxOrNull<T>(read: () => T): T | null {
  try {
    return read()
  } catch {
    return null
  }
}

/**
 * A once-per-isolate arming latch.
 *
 * Returns a function that runs `ping` the first time it is called and returns
 * the in-flight promise; every later call returns null (nothing to wait on).
 * The latch closes *before* the ping is issued, so concurrent requests landing
 * in the same isolate produce exactly one ping, not one per request.
 *
 * If the ping fails, the latch is released so a later request in the same
 * isolate retries — a long-lived isolate must never be the reason the alarm
 * stays unarmed.
 *
 * A failed ping means the DO was unreachable. A *404 response* is not a
 * failure: CronRoom.fetch() arms the room and then falls through to BaseRoom,
 * which has no HTTP route for a bare path and answers 404. The arming already
 * happened by then, so a resolved 404 correctly keeps the latch closed.
 *
 * It never rejects, and it never throws. Arming rides along on a real request
 * and must never be able to fail the request it rode in on.
 */
export function createCronArmer(): (ping: () => Promise<unknown>) => Promise<void> | null {
  let armed = false
  return (ping) => {
    if (armed) return null
    armed = true
    const fail = (err: unknown) => {
      armed = false
      console.error('[cron-arm] could not arm the cron room; will retry:', err)
    }
    // `ping()` is called inside the try, not just awaited: the realistic
    // failure here is synchronous, not a rejected promise. If CRON_ROOMS is
    // missing or renamed, `ns.get(ns.idFromName(...))` throws a TypeError
    // before any promise exists, and an unguarded call would escape this
    // helper entirely and 500 the first request into every new isolate — a
    // dead cron turning into a broken app. That binding is not hypothetical to
    // rename: re-provisioning an undeployed app is done by renaming the
    // binding. Treat a synchronous throw exactly like a rejection: log it,
    // release the latch, let the next request retry.
    try {
      return ping().then(() => undefined, fail)
    } catch (err) {
      fail(err)
      return Promise.resolve()
    }
  }
}
