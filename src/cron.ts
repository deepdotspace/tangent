/**
 * Cron task definitions — registered into the AppCronRoom DO at construction
 * time (worker.ts). The DO alarm fires `runTask(name, env)` on the schedule
 * declared here; the DO itself records executions, tracks history, and
 * pushes status to admin clients via the `/ws/cron/:roomId` WebSocket.
 *
 * Each task declares EITHER `intervalMinutes` (run every N minutes) OR
 * `schedule` + `timezone` (5-field cron expression). CronRoom validates
 * the config at construction time and throws on ambiguous declarations.
 *
 * Example:
 *
 *   import type { CronTask } from 'deepspace/worker'
 *   import { buildCronContext } from 'deepspace/worker'
 *
 *   export const tasks: CronTask[] = [
 *     { name: 'heartbeat', intervalMinutes: 1 },
 *     { name: 'daily-report', schedule: '0 9 * * *', timezone: 'America/New_York' },
 *   ]
 *
 *   export async function runTask(name: string, env: Env): Promise<void> {
 *     const ctx = buildCronContext(env, env.OWNER_USER_ID, `app:${env.APP_NAME}`)
 *     if (name === 'heartbeat') {
 *       // …
 *     }
 *   }
 */

import type { CronTask } from 'deepspace/worker'
import { getOrCreateTodayDaily } from './server/daily'
import type { RecordStoreEnv } from './server/record-store'

export const tasks: CronTask[] = [
  // Roll today's daily just after the UTC midnight reset so /today and the home
  // hero always resolve to a curated pair (get-or-create is idempotent).
  { name: 'roll-daily', schedule: '5 0 * * *', timezone: 'UTC' },
]

export async function runTask(name: string, env: RecordStoreEnv): Promise<void> {
  switch (name) {
    case 'roll-daily': {
      await getOrCreateTodayDaily(env)
      return
    }
    // TODO (notifications domain): a `streak-at-risk` task that finds subjects
    // with an at-risk streak (>=3) who have not completed today's daily and
    // enqueues an idempotent email via Resend, guarded by UNIQUE(userId,type,
    // dateUTC) on the email types (RESOLUTIONS M7). Left as a seam — it needs
    // the Resend integration + the emailLog dedup owned by that domain.
    default:
      return
  }
}
