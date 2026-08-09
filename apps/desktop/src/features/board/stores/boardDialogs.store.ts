import { create } from 'zustand'
import type { BoardCard } from '@git-manager/git-types'

/**
 * The open card dialog. Edit mode holds the card's **id**, never the card object: a snapshot goes
 * stale the moment any field is saved, and since a card's `revision` is its optimistic-concurrency
 * token, editing a second field would send the previous revision and be rejected as a conflict.
 */
export type CardDialogState = { mode: 'create'; columnId: string } | { mode: 'edit'; cardId: string }

/**
 * The board-level dialogs, raised from the toolbar (or the board's empty state).
 *
 * One slot rather than eight booleans, because they are **mutually exclusive in fact**: every one is
 * modal and covers the board the others are opened from, so two could never be true at once. Eight
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
  | 'purgeArchived'

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

/**
 * A column-wide action awaiting its confirmation.
 *
 * One slot holding *which* action on *which* column, rather than a column id per action, for the same
 * reason `BoardDialogName` is one slot: both dialogs are modal over the same board, so two could
 * never be up at once, and two independent slots could represent that impossible state. The column is
 * held by **id**, not by object, so a column renamed or reordered underneath resolves to whatever it
 * is now rather than to a stale copy.
 */
export type ColumnAction = { kind: 'archive' | 'move'; columnId: string }

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
  /** The column a column-wide action is being confirmed for, or `null` — see {@link ColumnAction}. */
  columnAction: ColumnAction | null
  setColumnAction: (action: ColumnAction | null) => void

  /** Opens `next` from the dialog currently on screen, remembering where to come back to. */
  openFrom: (origin: DialogOrigin, next: () => void) => void
  /** Reopens whatever the dialog just closed was opened from, one hop at a time; a no-op when it was
   * opened from the board itself. */
  returnToOrigin: () => void
  /** Closes everything and forgets the trail — the board view leaving the screen. */
  reset: () => void
}

/** Everything `reset` puts back, so adding a slot can't quietly escape it. */
const closed = () => ({
  openDialog: null,
  cardDialog: null,
  movingCard: null,
  deletingCard: null,
  columnAction: null,
  originTrail: [] as DialogOrigin[],
})

/**
 * Which of the board's dialogs is on screen, and the way back out of the ones that were opened from
 * another.
 *
 * **A store rather than the `useBoardDialogs` hook it started as**, because the buttons that raise
 * these dialogs no longer live in the same React tree as the dialogs themselves: the board's actions
 * moved into the app's own toolbar when the toolbar became view-scoped, while `BoardDialogsManager`
 * still renders them inside the page. Threading fifteen callbacks up through `RepoView` to reach the
 * toolbar would have coupled the app's chrome to the board's internals; one store keeps the coupling
 * to a single import of this feature's public surface.
 *
 * Pure state: no data, no effects, no knowledge of what any dialog *does* — which is what makes the
 * return-path rule above testable on its own rather than only through a page that mounts fourteen
 * dialogs. `BoardPage` owns the board data, `BoardDialogsManager` renders the dialogs, and this owns
 * the question of which one you are looking at.
 */
export const useBoardDialogsStore = create<BoardDialogs & { originTrail: DialogOrigin[] }>(
  (set, get) => ({
    ...closed(),

    isOpen: (name) => get().openDialog === name,
    setOpen: (name, open) => set({ openDialog: open ? name : null }),
    open: (name) => set({ openDialog: name }),
    setCardDialog: (cardDialog) => set({ cardDialog }),
    setMovingCard: (movingCard) => set({ movingCard }),
    setDeletingCard: (deletingCard) => set({ deletingCard }),
    setColumnAction: (columnAction) => set({ columnAction }),

    openFrom: (origin, next) => {
      set((state) => ({
        openDialog: null,
        cardDialog: null,
        originTrail: [...state.originTrail, origin],
      }))
      next()
    },

    /**
     * A card that was deleted in the meantime needs no special case: the card dialog resolves its id
     * out of the live card list, so a stale id simply renders nothing.
     */
    returnToOrigin: () => {
      const { originTrail } = get()
      const origin = originTrail[originTrail.length - 1]
      if (!origin) return
      set({
        ...(origin.kind === 'archived'
          ? { openDialog: 'archived' as const }
          : { cardDialog: { mode: 'edit' as const, cardId: origin.cardId } }),
        originTrail: originTrail.slice(0, -1),
      })
    },

    reset: () => set(closed()),
  })
)
