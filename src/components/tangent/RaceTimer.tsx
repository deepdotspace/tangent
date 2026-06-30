/** A tabular-mono speedrun clock that ticks via rAF without re-rendering. */

import { useEffect, useRef } from 'react'
import { formatClock } from '../../game/client'

export function RaceTimer({ startMs, running }: { startMs: number; running: boolean }) {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    let raf = 0
    const loop = () => {
      if (ref.current) {
        ref.current.textContent = formatClock(running ? Date.now() - startMs : 0)
      }
      raf = requestAnimationFrame(loop)
    }
    if (running) {
      raf = requestAnimationFrame(loop)
    } else if (ref.current) {
      ref.current.textContent = formatClock(Math.max(0, Date.now() - startMs))
    }
    return () => cancelAnimationFrame(raf)
  }, [startMs, running])

  return <span ref={ref}>0:00.0</span>
}
