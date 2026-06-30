/** Small formatting helpers shared by the HUD, results, and share card. */

/** A speedrun-style clock: m:ss.t (tenths). 58400ms -> "0:58.4". */
export function formatClock(ms: number): string {
  const t = Math.max(0, ms) / 1000
  const m = Math.floor(t / 60)
  const s = t % 60
  const sStr = s.toFixed(1)
  return `${m}:${Number(s) < 10 ? '0' : ''}${sStr}`
}

/** A coarse countdown clock for "next daily in": HH:MM:SS. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const p = (n: number) => (n < 10 ? '0' : '') + n
  return `${p(h)}:${p(m)}:${p(s)}`
}

/** ms until the next UTC midnight (when the daily rolls over). */
export function msUntilNextUtcMidnight(now = Date.now()): number {
  const d = new Date(now)
  const next = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate() + 1,
    0,
    0,
    0,
    0,
  )
  return next - now
}

/** Today's UTC date as YYYY-MM-DD (the dailyChallenge key). */
export function todayUtc(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10)
}

/** First grapheme of a name, uppercased, for avatar fallbacks. */
export function initialOf(name: string | undefined | null): string {
  const c = (name ?? '').trim()[0] ?? '?'
  return c.toUpperCase()
}
