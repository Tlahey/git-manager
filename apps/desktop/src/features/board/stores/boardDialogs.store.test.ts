import { describe, it, expect, beforeEach } from 'vitest'
import { makeCard } from '../test/boardFactories'
import { useBoardDialogsStore } from './boardDialogs.store'

function dialogs() {
  return useBoardDialogsStore.getState()
}

beforeEach(() => {
  useBoardDialogsStore.getState().reset()
})

describe('boardDialogs.store — the board-level slot', () => {
  it('starts with nothing open', () => {
    expect(dialogs().openDialog).toBeNull()
    expect(dialogs().isOpen('archived')).toBe(false)
  })

  it('opens one dialog by name', () => {
    dialogs().open('boardSettings')
    expect(dialogs().isOpen('boardSettings')).toBe(true)
  })

  /** Every one of these is modal and covers the board the others open from, so opening a second
   * closes the first rather than stacking two backdrops. */
  it('replaces whatever was open rather than stacking', () => {
    dialogs().open('boardSettings')
    dialogs().open('columnEditor')

    expect(dialogs().isOpen('columnEditor')).toBe(true)
    expect(dialogs().isOpen('boardSettings')).toBe(false)
  })

  it('closes through the shape a dialog’s onOpenChange has', () => {
    dialogs().setOpen('addIssue', true)
    dialogs().setOpen('addIssue', false)
    expect(dialogs().openDialog).toBeNull()
  })

  /** The board view leaving the screen must not leave a modal armed for the next time it is opened —
   * the state outlives the page now that it is a store. */
  it('closes everything on reset', () => {
    dialogs().open('archived')
    dialogs().setCardDialog({ mode: 'edit', cardId: 'c1' })
    dialogs().setMovingCard(makeCard())
    dialogs().setDeletingCard(makeCard())
    dialogs().setColumnAction({ kind: 'archive', columnId: 'col-1' })

    dialogs().reset()

    expect(useBoardDialogsStore.getState()).toMatchObject({
      openDialog: null,
      cardDialog: null,
      movingCard: null,
      deletingCard: null,
      columnAction: null,
      originTrail: [],
    })
  })
})

describe('boardDialogs.store — the way back', () => {
  it('reopens the archive list a card was opened from', () => {
    dialogs().open('archived')

    dialogs().openFrom({ kind: 'archived' }, () =>
      dialogs().setCardDialog({ mode: 'edit', cardId: 'c1' })
    )
    // The list gives way to the card rather than sitting behind it.
    expect(dialogs().isOpen('archived')).toBe(false)
    expect(dialogs().cardDialog).toEqual({ mode: 'edit', cardId: 'c1' })

    dialogs().setCardDialog(null)
    dialogs().returnToOrigin()
    expect(dialogs().isOpen('archived')).toBe(true)
  })

  it('reopens the card a delete confirmation was started from', () => {
    const card = makeCard()
    dialogs().setCardDialog({ mode: 'edit', cardId: 'c1' })

    dialogs().openFrom({ kind: 'card', cardId: 'c1' }, () => dialogs().setDeletingCard(card))
    expect(dialogs().cardDialog).toBeNull()
    expect(dialogs().deletingCard).toBe(card)

    dialogs().setDeletingCard(null)
    dialogs().returnToOrigin()
    expect(dialogs().cardDialog).toEqual({ mode: 'edit', cardId: 'c1' })
  })

  it('goes nowhere when the dialog was opened from the board itself', () => {
    dialogs().setMovingCard(makeCard())

    dialogs().setMovingCard(null)
    dialogs().returnToOrigin()

    expect(dialogs().cardDialog).toBeNull()
    expect(dialogs().openDialog).toBeNull()
  })

  /** The origin is spent once used: coming back a second time would put a dialog on screen that
   * nothing asked for. */
  it('forgets the origin after returning to it', () => {
    dialogs().openFrom({ kind: 'archived' }, () => {})
    dialogs().returnToOrigin()
    dialogs().setOpen('archived', false)
    dialogs().returnToOrigin()

    expect(dialogs().openDialog).toBeNull()
  })

  /**
   * The chain this used to get wrong: archive list → card → delete confirmation is three deep, and a
   * single origin slot meant the second hop overwrote the first. Cancelling came back to the card,
   * and closing the card then dropped you on the board instead of the list you were reading.
   */
  it('unwinds a three-deep chain one hop at a time', () => {
    dialogs().open('archived')

    // The list opens a card…
    dialogs().openFrom({ kind: 'archived' }, () =>
      dialogs().setCardDialog({ mode: 'edit', cardId: 'c1' })
    )
    // …and the card raises a delete confirmation.
    dialogs().openFrom({ kind: 'card', cardId: 'c1' }, () => dialogs().setDeletingCard(makeCard()))

    dialogs().setDeletingCard(null)
    dialogs().returnToOrigin()
    expect(dialogs().cardDialog).toEqual({ mode: 'edit', cardId: 'c1' })

    dialogs().setCardDialog(null)
    dialogs().returnToOrigin()
    expect(dialogs().isOpen('archived')).toBe(true)
  })

  it('leaves the trail empty once it has been walked back', () => {
    dialogs().openFrom({ kind: 'archived' }, () => {})
    dialogs().openFrom({ kind: 'card', cardId: 'c9' }, () => {})
    dialogs().returnToOrigin()
    dialogs().returnToOrigin()

    dialogs().setCardDialog(null)
    dialogs().setOpen('archived', false)
    dialogs().returnToOrigin()

    expect(dialogs().cardDialog).toBeNull()
    expect(dialogs().openDialog).toBeNull()
  })
})
