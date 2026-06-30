/**
 * Share — the Wordle-style spoiler-free text for the Daily (FINAL-SPEC 8).
 * Tiles are par-relative; the route itself is NEVER revealed.
 */

export interface ShareInput {
  number: number
  start: string
  target: string
  clicks: number
  par: number
  streak?: number
}

/** Spoiler-free tile string. Green = within par, purple = on the dot, yellow = over. */
export function dailyShareText(input: ShareInput): string {
  const { number, start, target, clicks, par, streak } = input
  let tiles = ''
  for (let i = 0; i < clicks; i++) {
    if (clicks <= par) tiles += i < par ? '🟩' : '🟪'
    else tiles += i < par ? '🟩' : '🟨'
  }
  const lines = [
    `Tangent No.${number}`,
    `${start} to ${target} in ${clicks}`,
    tiles,
  ]
  if (typeof streak === 'number' && streak > 0) lines.push(`Streak ${streak}`)
  lines.push('Think you can find a shorter line?')
  return lines.join('\n')
}

/** A short caption for live/solo shares (the line is the graphic elsewhere). */
export function lineShareText(start: string, target: string, clicks: number): string {
  return `${start} to ${target} in ${clicks}. Think you can find a shorter line?`
}

/** Copy to clipboard, preferring the native share sheet on mobile. Returns true if handled. */
export async function shareOrCopy(text: string, title = 'Tangent'): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && 'share' in navigator && /Mobi|Android/i.test(navigator.userAgent)) {
      await (navigator as Navigator & { share: (d: ShareData) => Promise<void> }).share({ title, text })
      return true
    }
  } catch {
    /* user dismissed the sheet — fall through to clipboard */
  }
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* clipboard blocked */
  }
  return false
}
