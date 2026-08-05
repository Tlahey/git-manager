import { useState } from 'react'
import type { BoardCard } from '@git-manager/git-types'

/**
 * The open card dialog. Edit mode holds the card's **id**, never the card object: a snapshot goes
 * stale the moment any field is saved, and since a card's `revision` is its optimistic-concurrency
 * token, editing a second field would send the previous revision and be rejected as a conflict.
 */
export type CardDialogState = { mode: 'create'; columnId: string } | { mode: 'edit'; cardId: string }

/**
 * The board-level dialogs, all raised from the page header (or the empty state).
 *
 * One slot rather than seven booleans, because they are **mutually exclusive in fact**: every one is
 * modal and covers the header the others are opened from, so two could never be true at once. Seven
 * independent flags could represent that impossible state, and `openFrom` below would then have to
 * remember to clear each of them by name — which is exactly the bug it used to carry, closing only
 * the archive list.
 */
export type BoardDialogName =
  | 'createBoard'
  | 'columnEditor'
  | 'boardSettings'
  | 'deleteBoard'
  | 'closeSprint'
  | 'addIssue'
  | 'archived'

/**
 * Where closing a dialog should put you back.
 *
 * Several of these open *from* another one — a card from the archive list, a delete confirmation
 * from either. They **replace on screen** rather than stack: the card dialog is 1100px tall and
 * covers whatever is behind it completely, so a second modal layer would buy nothing but a backdrop
 * over a backdrop. What was missing is the way back — closing the card dropped you on the board
 * instead of into the list you were reading.
 *
 * The *trail* is a real stack, though, and used not to be. It was one slot, on the stated grounds
 * that "every one of these chains is exactly two deep" — which is false: archive list → card →
 * delete confirmation is three, entirely reachable, and the second `openFrom` overwrote the first.
 * Cancelling the delete came back to the card, and closing the card then dropped you on the board
 * rather than into the archive list you had been reading. One entry per hop, popped on the way out.
 */
export type DialogOrigin = { kind: 'archived' } | { kind: 'card'; cardId: string }

export interface BoardDialogs {
  /** The board-level dialog on screen, or `null` — see {@link BoardDialogName}. */
  openDialog: BoardDialogName | null
  isOpen: (name: BoardDialogName) => boolean
  /** Shaped for a dialog's `onOpenChange`, so a call site reads `(open) => setOpen('archived', open)`. */
  setOpen: (name: BoardDialogName, open: boolean) => void
  open: (name: BoardDialogName) => void

  cardDialog: CardDialogState | null
  setCardDialog: (state: CardDialogState | null) => void
  /** The card whose "move to another board" dialog is up, or `null`. */
  movingCard: BoardCard | null
  setMovingCard: (card: BoardCard | null) => void
  /** The card whose delete confirmation is up, or `null`. */
  deletingCard: BoardCard | null
  setDeletingCard: (card: BoardCard | null) => void

  /** Opens `next` from the dialog currently on screen, remembering where to come back to. */
  openFrom: (origin: DialogOrigin, next: () => void) => void
  /** Reopens whatever the dialog just closed was opened from, one hop at a time; a no-op when it was
   * opened from the board itself. */
  returnToOrigin: () => void
}

/**
 * Which of the board page's dialogs is on screen, and the way back out of the ones that were opened
 * from another.
 *
 * Pure state: no data, no effects, no knowledge of what any dialog *does* — which is what makes the
 * return-path rule above testable on its own rather than only through a page that mounts eleven
 * dialogs. `BoardPage` owns the board data, `BoardDialogsManager` renders the dialogs, and this owns
 * the question of which one you are looking at.
 */
export function useBoardDialogs(): BoardDialogs {
  const [openDialog, setOpenDialog] = useState<BoardDialogName | null>(null)
  const [cardDialog, setCardDialog] = useState<CardDialogState | null>(null)
  const [movingCard, setMovingCard] = useState<BoardCard | null>(null)
  const [deletingCard, setDeletingCard] = useState<BoardCard | null>(null)
  const [originTrail, setOriginTrail] = useState<DialogOrigin[]>([])

  function openFrom(origin: DialogOrigin, next: () => void) {
    setOpenDialog(null)
    setCardDialog(null)
    setOriginTrail((trail) => [...trail, origin])
    next()
  }

  /**
   * A card that was deleted in the meantime needs no special case: the card dialog resolves its id
   * out of the live card list, so a stale id simply renders nothing.
   */
  function returnToOrigin() {
    const origin = originTrail[originTrail.length - 1]
    if (!origin) return
    if (origin.kind === 'archived') setOpenDialog('archived')
    else setCardDialog({ mode: 'edit', cardId: origin.cardId })
    setOriginTrail((trail) => trail.slice(0, -1))
  }

  return {
    openDialog,
    isOpen: (name) => openDialog === name,
    setOpen: (name, open) => setOpenDialog(open ? name : null),
    open: (name) => setOpenDialog(name),
    cardDialog,
    setCardDialog,
    movingCard,
    setMovingCard,
    deletingCard,
    setDeletingCard,
    openFrom,
    returnToOrigin,
  }
}
