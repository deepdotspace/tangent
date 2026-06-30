/** Load a race article body (real served HTML, else the demo graph). */

import { useEffect, useState } from 'react'
import { useGuestId } from './guest'
import { fetchArticle } from './actionClient'
import { getDemoArticle, type DemoArticle } from './demo'

export interface RaceArticle {
  title: string
  cat: string
  html?: string
  demo?: DemoArticle
  loading: boolean
}

export function useRaceArticle(title: string | undefined, demoMode: boolean): RaceArticle {
  const guestId = useGuestId()
  const [article, setArticle] = useState<RaceArticle>({ title: title ?? '', cat: '', loading: true })

  useEffect(() => {
    if (!title) return
    let cancelled = false
    setArticle((a) => ({ ...a, title, loading: true }))
    ;(async () => {
      if (!demoMode) {
        const real = await fetchArticle(title, guestId)
        if (cancelled) return
        if (real) {
          setArticle({ title: real.canonicalTitle, cat: 'Wikipedia', html: real.servedHtml, loading: false })
          return
        }
      }
      if (cancelled) return
      const demo = getDemoArticle(title)
      setArticle({ title, cat: demo.cat, demo, loading: false })
    })()
    return () => {
      cancelled = true
    }
  }, [title, demoMode, guestId])

  return article
}
