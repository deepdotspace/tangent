// @vitest-environment jsdom
/**
 * Regression: the race screen re-renders continuously (the live room ticks at
 * TICK_RATE, the async par-ghost every 950 ms) while the player reads a static
 * article. Nothing about the article changes on those ticks, so its DOM must not
 * be rebuilt.
 *
 * It used to be. `dangerouslySetInnerHTML` is compared by object identity, so a
 * fresh `{ __html }` literal made React re-assign `innerHTML` on every render and
 * replace every node in the prose several times a second. That destroyed the
 * link under the cursor (the flickering hover) and swallowed clicks whose
 * mousedown and mouseup straddled a rebuild (the "click it twice" bug).
 */

import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, act, fireEvent } from '@testing-library/react'
import { ArticlePane } from './ArticlePane'

const HTML =
  '<p>The <a class="tg-link" data-tg-to="Genetics" href="/go/Genetics">study of genes</a> ' +
  'grew out of <a class="tg-link" data-tg-to="Botany" href="/go/Botany">botany</a>.</p>'

/**
 * Mirrors the real call sites: a parent that re-renders on a race tick and
 * rebuilds the `onHop` closure each time (race.tsx passed an inline arrow).
 */
function Stage({ onHop }: { onHop: (t: string) => void }) {
  const [tick, setTick] = useState(0)
  ;(Stage as unknown as { tick: () => void }).tick = () => setTick((t) => t + 1)
  return (
    <div data-tick={tick}>
      <ArticlePane
        title="Albert Einstein"
        cat="Wikipedia"
        html={HTML}
        targetTitle="Genetics"
        oneAway={false}
        onHop={(t) => onHop(t)}
      />
    </div>
  )
}
const tickStage = async () => {
  await act(async () => {
    ;(Stage as unknown as { tick: () => void }).tick()
  })
}

describe('ArticlePane — article DOM stability across race ticks', () => {
  it('keeps the same link nodes when the page re-renders around it', async () => {
    const { container } = render(<Stage onHop={vi.fn()} />)
    const before = container.querySelector('a.tg-link[data-tg-to="Genetics"]')
    expect(before).toBeTruthy()

    for (let i = 0; i < 5; i++) await tickStage()

    const after = container.querySelector('a.tg-link[data-tg-to="Genetics"]')
    // Node IDENTITY, not just presence: a rebuilt node is a different object,
    // and the browser drops :hover and the in-flight mousedown when it happens.
    expect(after).toBe(before)
  })

  it('still hops when the click lands on a node captured before a re-render', async () => {
    const onHop = vi.fn()
    const { container } = render(<Stage onHop={onHop} />)

    // The browser resolves a click against the element it saw at mousedown. Hold
    // that reference, let a race tick land, then complete the click on it.
    const pressed = container.querySelector('a.tg-link[data-tg-to="Genetics"]') as HTMLElement
    await tickStage()
    fireEvent.click(pressed)

    expect(onHop).toHaveBeenCalledTimes(1)
    expect(onHop).toHaveBeenCalledWith('Genetics')
  })

  it('registers the delegated click listener once per article, not once per render', async () => {
    const { container } = render(<Stage onHop={vi.fn()} />)
    const body = container.querySelector('.tg-article-body') as HTMLElement

    let adds = 0
    let removes = 0
    const origAdd = body.addEventListener.bind(body)
    const origRemove = body.removeEventListener.bind(body)
    body.addEventListener = ((t: string, ...rest: unknown[]) => {
      if (t === 'click') adds++
      return (origAdd as (...a: unknown[]) => void)(t, ...rest)
    }) as typeof body.addEventListener
    body.removeEventListener = ((t: string, ...rest: unknown[]) => {
      if (t === 'click') removes++
      return (origRemove as (...a: unknown[]) => void)(t, ...rest)
    }) as typeof body.removeEventListener

    for (let i = 0; i < 5; i++) await tickStage()

    expect(adds).toBe(0)
    expect(removes).toBe(0)
  })

  it('still hops on a plain click, and marks the target link when one away', async () => {
    const onHop = vi.fn()
    const { container, rerender } = render(<Stage onHop={onHop} />)

    fireEvent.click(container.querySelector('a.tg-link[data-tg-to="Botany"]')!)
    expect(onHop).toHaveBeenCalledWith('Botany')

    rerender(
      <div>
        <ArticlePane
          title="Albert Einstein"
          cat="Wikipedia"
          html={HTML}
          targetTitle="Genetics"
          oneAway
          onHop={onHop}
        />
      </div>,
    )
    expect(container.querySelector('a.tg-link[data-tg-to="Genetics"]')!.classList.contains('tg-target')).toBe(true)
  })
})
