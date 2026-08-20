// @vitest-environment jsdom
/**
 * Private rooms have no server side (the matchmaker answers quick / chaos /
 * ranked only), so the mode grid must present them as not yet available instead
 * of routing the player into the "could not find a room" screen. These tests
 * pin the user-facing guarantee: a mode marked `comingSoon` is visible, labelled
 * and inert, and every other mode still selects normally.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, within } from '@testing-library/react'
import { ModeGrid, MODE_TILES } from './home'

const tileFor = (container: HTMLElement, name: string) =>
  within(container).getByText(name).closest('button') as HTMLButtonElement

describe('ModeGrid — unbuilt modes', () => {
  it('marks Private room as coming soon and does not select it', () => {
    const onSelect = vi.fn()
    const { container } = render(<ModeGrid onSelect={onSelect} />)

    const tile = tileFor(container, 'Private room')
    expect(within(tile).getByText('Coming soon')).toBeTruthy()
    expect(tile.getAttribute('aria-disabled')).toBe('true')

    fireEvent.click(tile)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('leaves every playable mode selectable', () => {
    const onSelect = vi.fn()
    const { container } = render(<ModeGrid onSelect={onSelect} />)

    for (const m of MODE_TILES.filter((t) => !t.comingSoon)) {
      onSelect.mockClear()
      fireEvent.click(tileFor(container, m.name))
      expect(onSelect).toHaveBeenCalledWith(m.id)
    }
  })

  it('keeps quick, chaos, ranked, series and solo playable', () => {
    const playable = MODE_TILES.filter((t) => !t.comingSoon).map((t) => t.id)
    expect(playable).toEqual(expect.arrayContaining(['quick', 'chaos', 'ranked', 'series', 'solo']))
    expect(MODE_TILES.filter((t) => t.comingSoon).map((t) => t.id)).toEqual(['private'])
  })
})
