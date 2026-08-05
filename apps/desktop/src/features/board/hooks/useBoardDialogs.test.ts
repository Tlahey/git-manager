import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { makeCard } from '../test/boardFactories'
import { useBoardDialogs } from './useBoardDialogs'

describe('useBoardDialogs — the board-level slot', () => {
  it('starts with nothing open', () => {
    const { result } = renderHook(() => useBoardDialogs())
    expect(result.current.openDialog).toBeNull()
    expect(result.current.isOpen('archived')).toBe(false)
  })

  it('opens one dialog by name', () => {
    const { result } = renderHook(() => useBoardDialogs())
    act(() => result.current.open('boardSettings'))
    expect(result.current.isOpen('boardSettings')).toBe(true)
  })

  /** Every one of these is modal and covers the header the others open from, so opening a second
   * closes the first rather than stacking two backdrops. */
  it('replaces whatever was open rather than stacking', () => {
    const { result } = renderHook(() => useBoardDialogs())
    act(() => result.current.open('boardSettings'))
    act(() => result.current.open('columnEditor'))

    expect(result.current.isOpen('columnEditor')).toBe(true)
    expect(result.current.isOpen('boardSettings')).toBe(false)
  })

  it('closes through the shape a dialog’s onOpenChange has', () => {
    const { result } = renderHook(() => useBoardDialogs())
    act(() => result.current.setOpen('addIssue', true))
    act(() => result.current.setOpen('addIssue', false))
    expect(result.current.openDialog).toBeNull()
  })
})

describe('useBoardDialogs — the way back', () => {
  it('reopens the archive list a card was opened from', () => {
    const { result } = renderHook(() => useBoardDialogs())
    act(() => result.current.open('archived'))

    act(() =>
      result.current.openFrom({ kind: 'archived' }, () =>
        result.current.setCardDialog({ mode: 'edit', cardId: 'c1' })
      )
    )
    // The list gives way to the card rather than sitting behind it.
    expect(result.current.isOpen('archived')).toBe(false)
    expect(result.current.cardDialog).toEqual({ mode: 'edit', cardId: 'c1' })

    act(() => {
      result.current.setCardDialog(null)
      result.current.returnToOrigin()
    })
    expect(result.current.isOpen('archived')).toBe(true)
  })

  it('reopens the card a delete confirmation was started from', () => {
    const { result } = renderHook(() => useBoardDialogs())
    const card = makeCard()
    act(() => result.current.setCardDialog({ mode: 'edit', cardId: 'c1' }))

    act(() =>
      result.current.openFrom({ kind: 'card', cardId: 'c1' }, () =>
        result.current.setDeletingCard(card)
      )
    )
    expect(result.current.cardDialog).toBeNull()
    expect(result.current.deletingCard).toBe(card)

    act(() => {
      result.current.setDeletingCard(null)
      result.current.returnToOrigin()
    })
    expect(result.current.cardDialog).toEqual({ mode: 'edit', cardId: 'c1' })
  })

  it('goes nowhere when the dialog was opened from the board itself', () => {
    const { result } = renderHook(() => useBoardDialogs())
    act(() => result.current.setMovingCard(makeCard()))

    act(() => {
      result.current.setMovingCard(null)
      result.current.returnToOrigin()
    })
    expect(result.current.cardDialog).toBeNull()
    expect(result.current.openDialog).toBeNull()
  })

  /** The origin is spent once used: coming back a second time would put a dialog on screen that
   * nothing asked for. */
  it('forgets the origin after returning to it', () => {
    const { result } = renderHook(() => useBoardDialogs())
    act(() => result.current.openFrom({ kind: 'archived' }, () => {}))
    act(() => result.current.returnToOrigin())
    act(() => result.current.setOpen('archived', false))
    act(() => result.current.returnToOrigin())

    expect(result.current.openDialog).toBeNull()
  })

  /**
   * The chain this used to get wrong: archive list → card → delete confirmation is three deep, and a
   * single origin slot meant the second hop overwrote the first. Cancelling came back to the card,
   * and closing the card then dropped you on the board instead of the list you were reading.
   */
  it('unwinds a three-deep chain one hop at a time', () => {
    const { result } = renderHook(() => useBoardDialogs())
    act(() => result.current.open('archived'))

    // The list opens a card…
    act(() =>
      result.current.openFrom({ kind: 'archived' }, () =>
        result.current.setCardDialog({ mode: 'edit', cardId: 'c1' })
      )
    )
    // …and the card raises a delete confirmation.
    act(() =>
      result.current.openFrom({ kind: 'card', cardId: 'c1' }, () =>
        result.current.setDeletingCard(makeCard())
      )
    )

    act(() => {
      result.current.setDeletingCard(null)
      result.current.returnToOrigin()
    })
    expect(result.current.cardDialog).toEqual({ mode: 'edit', cardId: 'c1' })

    act(() => {
      result.current.setCardDialog(null)
      result.current.returnToOrigin()
    })
    expect(result.current.isOpen('archived')).toBe(true)
  })

  it('leaves the trail empty once it has been walked back', () => {
    const { result } = renderHook(() => useBoardDialogs())
    act(() => result.current.openFrom({ kind: 'archived' }, () => {}))
    act(() => result.current.openFrom({ kind: 'card', cardId: 'c9' }, () => {}))
    act(() => result.current.returnToOrigin())
    act(() => result.current.returnToOrigin())

    act(() => {
      result.current.setCardDialog(null)
      result.current.setOpen('archived', false)
      result.current.returnToOrigin()
    })
    expect(result.current.cardDialog).toBeNull()
    expect(result.current.openDialog).toBeNull()
  })
})
