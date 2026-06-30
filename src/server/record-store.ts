/**
 * Record-store helpers — env-based CRUD against the app's RecordRoom DO from
 * any worker/DO isolate (the matchmaker DO, the game DO's onGameEnd, the daily
 * helper, cron). Mirrors what `ActionTools` does for server actions, but works
 * outside an action context where there is no `ctx.tools`.
 *
 * Every call carries `X-App-Action: true`, which bypasses the caller's RBAC
 * (the worker is the trust boundary). The X-User-Id is the app owner so the
 * call resolves as admin even if the App-Action bypass were ever tightened.
 */

import type { ActionResult } from 'deepspace/worker'

/** The minimal env a record-store call needs. The worker `Env` satisfies it. */
export interface RecordStoreEnv {
  RECORD_ROOMS: DurableObjectNamespace
  APP_NAME: string
  OWNER_USER_ID: string
}

/** A record envelope as returned by the tools API. */
export interface RecordEnvelope<T = Record<string, unknown>> {
  recordId: string
  data: T
  createdBy: string
  createdAt: string
  updatedAt: string
}

function appRoomStub(env: RecordStoreEnv): DurableObjectStub {
  return env.RECORD_ROOMS.get(env.RECORD_ROOMS.idFromName(`app:${env.APP_NAME}`))
}

async function execTool<TData>(
  env: RecordStoreEnv,
  tool: string,
  params: Record<string, unknown>,
): Promise<ActionResult<TData>> {
  const stub = appRoomStub(env)
  const res = await stub.fetch(
    new Request('https://internal/api/tools/execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': env.OWNER_USER_ID,
        'X-App-Action': 'true',
      },
      body: JSON.stringify({ tool, params }),
    }),
  )
  return res.json() as Promise<ActionResult<TData>>
}

/** Query a collection. Returns the matching record envelopes (or []). */
export async function queryRecords<T = Record<string, unknown>>(
  env: RecordStoreEnv,
  collection: string,
  options: {
    where?: Record<string, unknown>
    orderBy?: string
    orderDir?: 'asc' | 'desc'
    limit?: number
  } = {},
): Promise<Array<RecordEnvelope<T>>> {
  const r = await execTool<{ records: Array<RecordEnvelope<T>>; count: number }>(
    env,
    'records.query',
    { collection, ...options },
  )
  return r.success ? r.data.records : []
}

/** Get one record by id, or null when missing. */
export async function getRecord<T = Record<string, unknown>>(
  env: RecordStoreEnv,
  collection: string,
  recordId: string,
): Promise<RecordEnvelope<T> | null> {
  const r = await execTool<{ record: RecordEnvelope<T> }>(env, 'records.get', {
    collection,
    recordId,
  })
  return r.success ? r.data.record : null
}

/** Create a record. Returns the new recordId, or null on failure. */
export async function createRecord(
  env: RecordStoreEnv,
  collection: string,
  data: Record<string, unknown>,
  recordId?: string,
): Promise<string | null> {
  const r = await execTool<{ recordId: string }>(env, 'records.create', {
    collection,
    data,
    ...(recordId ? { recordId } : {}),
  })
  return r.success ? r.data.recordId : null
}

/** Merge-update a record. Returns true on success. */
export async function updateRecord(
  env: RecordStoreEnv,
  collection: string,
  recordId: string,
  data: Record<string, unknown>,
): Promise<boolean> {
  const r = await execTool(env, 'records.update', { collection, recordId, data })
  return r.success
}
