import type { BoardCard } from '@git-manager/git-types'
import type { BoardData } from '../hooks/useBoardData'
import { apiCreateAndCheckoutBranch, apiCheckoutBranch } from '../../../api/git.api'
import { CloseSprintDialog } from './CloseSprintDialog'
import { BoardCardDialog } from './BoardCardDialog'
import { CreateBoardDialog } from './CreateBoardDialog'
import { ColumnEditorDialog } from './ColumnEditorDialog'
import { BoardSettingsDialog } from './BoardSettingsDialog'
import { DeleteBoardDialog } from './DeleteBoardDialog'
import { DeleteCardDialog } from './DeleteCardDialog'
import { MoveCardDialog } from './MoveCardDialog'
import { AddIssueDialog } from './AddIssueDialog'
import { ArchivedCardsDialog } from './ArchivedCardsDialog'
import { DeleteArchivedCardsDialog } from './DeleteArchivedCardsDialog'
import { ArchiveColumnDialog } from './ArchiveColumnDialog'
import { MoveColumnDialog } from './MoveColumnDialog'
import { defaultColumns, branchNameForCard, offeredCardPrefixes } from '../lib/boardDefaults'
import { cardIdentifier } from '../lib/cardMeta'
import { columnMoveTargetsFor, moveTargetsFor } from '../lib/cardMoveTargets'
import { linkWrite, unlinkWrite, type DisplayedLinkKind, type ResolvedLink } from '../lib/cardLinks'
import { useCardComments } from '../hooks/useCardComments'
import type { BoardDialogs } from '../hooks/useBoardDialogs'

interface BoardDialogsManagerProps {
  repoPath: string
  /** The board's data and every mutation on it — this component's whole job is wiring the two. */
  data: BoardData
  /** Which dialog is on screen, and the way back out — see `useBoardDialogs`. */
  dialogs: BoardDialogs
}

/**
 * Renders the fourteen dialogs the board page can raise, and wires each one to the mutation it
 * performs.
 *
 * The split is three-way, following the pattern {@link SidebarDialogsManager} and
 * `GitGraphOverlayManager` already use for the same problem (2026-08 retrofit, architecture-guardian
 * R3): `useBoardDialogs` owns *which* dialog is open, `BoardPage` owns the board itself and its
 * layout, and this owns *what each dialog does*. That last part is the half that grows — every new
 * card capability arrives as another handler — so it is the half worth having on its own.
 *
 * It takes the whole `useBoardData` result rather than one prop per callback deliberately: the
 * alternative is forty props whose only purpose is to be forwarded unchanged, and the coupling is
 * real either way since there is exactly one board page.
 */
export function BoardDialogsManager({ repoPath, data, dialogs }: BoardDialogsManagerProps) {
  const {
    boards,
    activeBoard,
    cards,
    canUseRemote,
    createBoard,
    updateBoardColumns,
    deleteBoard,
    createCard,
    updateCard,
    deleteCard,
    deleteArchivedCards,
    archiveColumn,
    moveColumnCards,
    duplicateCard,
    addComment,
    loadComments,
    updateBoardMeta,
    assignCardIdentifiers,
    createTagAndAssign,
    closeSprint,
    moveCardToBoard,
    addIssueToBoard,
    untrackCard,
    trackedIssueNumbers,
  } = data
  const { cardDialog, setCardDialog, movingCard, deletingCard, setDeletingCard, columnAction } =
    dialogs

  /** A column is held by id, so its name is resolved from the board as it stands now. */
  const columnName = (columnId: string) =>
    activeBoard?.columns.find((c) => c.id === columnId)?.name ?? columnId
  /** What a column-wide action would touch — archived cards are already off the board. */
  const liveColumnCards = (columnId: string) =>
    cards.filter((c) => c.columnId === columnId && !c.archivedAt)

  // Resolved from the live list on every render, so a field saved a moment ago is reflected here —
  // including the card's fresh `revision`, which the next save needs to be accepted.
  const editingCard =
    cardDialog?.mode === 'edit' ? (cards.find((c) => c.id === cardDialog.cardId) ?? null) : null
  const { comments: cardComments, loading: commentsLoading } = useCardComments(
    editingCard,
    loadComments
  )

  /**
   * Relating two cards writes on **one** of them — whichever stores the forward half, which is not
   * always the one on screen: saying "this card is blocked by X" is `blocks` written on X. See
   * `cardLinks.ts`, which owns that rule; here it is only dispatched to `updateCard`.
   */
  function addLink(from: BoardCard, target: BoardCard, kind: DisplayedLinkKind) {
    const write = linkWrite(from, target, kind)
    // `null` means the relation already exists, or the card was linked to itself.
    if (!write) return Promise.resolve()
    return updateCard(write.card, { links: write.links })
  }

  return (
    <>
      <CreateBoardDialog
        open={dialogs.isOpen('createBoard')}
        onOpenChange={(open) => dialogs.setOpen('createBoard', open)}
        canUseRemote={canUseRemote}
        onSubmit={(name, source, dodTemplate, cardPrefix, iteration) =>
          createBoard(name, defaultColumns(), source, dodTemplate, cardPrefix, iteration)
        }
      />

      {activeBoard && (
        <ColumnEditorDialog
          open={dialogs.isOpen('columnEditor')}
          onOpenChange={(open) => dialogs.setOpen('columnEditor', open)}
          columns={activeBoard.columns}
          onSave={updateBoardColumns}
        />
      )}

      {activeBoard && (
        <CloseSprintDialog
          open={dialogs.isOpen('closeSprint')}
          onOpenChange={(open) => dialogs.setOpen('closeSprint', open)}
          board={activeBoard}
          cards={cards}
          onConfirm={closeSprint}
        />
      )}

      {activeBoard && (
        <BoardSettingsDialog
          open={dialogs.isOpen('boardSettings')}
          onOpenChange={(open) => dialogs.setOpen('boardSettings', open)}
          name={activeBoard.name}
          tags={activeBoard.tags}
          dodTemplate={activeBoard.dodTemplate}
          cardPrefixes={activeBoard.cardPrefixes}
          // A closed sprint is read-only, so it is offered no repair — its tickets are part of a
          // report now, and renumbering them would rewrite what that report refers to.
          unnumberedCardCount={
            activeBoard.closedAt ? 0 : cards.filter((c) => !cardIdentifier(c)).length
          }
          onAssignIdentifiers={assignCardIdentifiers}
          onSave={updateBoardMeta}
        />
      )}

      {activeBoard && (
        <DeleteBoardDialog
          open={dialogs.isOpen('deleteBoard')}
          onOpenChange={(open) => dialogs.setOpen('deleteBoard', open)}
          boardName={activeBoard.name}
          source={activeBoard.source}
          cardCount={cards.length}
          onConfirm={(deleteCards) => deleteBoard(activeBoard, deleteCards)}
        />
      )}

      {activeBoard && columnAction?.kind === 'archive' && (
        <ArchiveColumnDialog
          open
          onOpenChange={(open) => {
            if (!open) dialogs.setColumnAction(null)
          }}
          columnName={columnName(columnAction.columnId)}
          count={liveColumnCards(columnAction.columnId).length}
          onConfirm={() => archiveColumn(columnAction.columnId)}
        />
      )}

      {activeBoard && columnAction?.kind === 'move' && (
        <MoveColumnDialog
          open
          onOpenChange={(open) => {
            if (!open) dialogs.setColumnAction(null)
          }}
          targets={columnMoveTargetsFor(boards, activeBoard)}
          columnName={columnName(columnAction.columnId)}
          columnId={columnAction.columnId}
          count={liveColumnCards(columnAction.columnId).length}
          onSubmit={(targetBoardId, targetColumnId) =>
            moveColumnCards(columnAction.columnId, targetBoardId, targetColumnId)
          }
        />
      )}

      {cardDialog?.mode === 'create' && activeBoard && (
        <BoardCardDialog
          mode="create"
          open
          onOpenChange={(open) => {
            if (!open) setCardDialog(null)
          }}
          repoPath={repoPath}
          tags={activeBoard.tags}
          dodTemplate={activeBoard.dodTemplate}
          // The board's own prefixes, or the default derived from its name when it offers none — a
          // board created before it had one would otherwise go on making cards with no identifier.
          cardPrefixes={offeredCardPrefixes(activeBoard)}
          onCreate={async ({ title, description, dod, prefix, kind }) => {
            // A prefix typed in the dialog needs no board write of its own: both backends add an
            // unseen prefix to the board's list in the same write that allocates the card's number,
            // so the sequence and the list can never disagree.
            const created = await createCard(cardDialog.columnId, title, description, prefix, kind)
            // Only when there is no active board, which this dialog cannot be open without — the
            // dialog still has to go somewhere rather than hang open on a card that wasn't made.
            if (!created) {
              setCardDialog(null)
              return
            }
            // `createCard` carries only title/description on both backends. The checklist follows
            // only when it differs from the template the card already inherited, so an ordinary new
            // card stays a single commit in the board's history.
            if (dod !== activeBoard.dodTemplate) await updateCard(created, { dod })
            // The new card reopens in the full editor, which is where the rest of it gets filled in.
            setCardDialog({ mode: 'edit', cardId: created.id })
          }}
        />
      )}

      {editingCard && (
        <BoardCardDialog
          mode="edit"
          // Remounting per card is what resets each field's own editing state. Keyed on the id, not
          // the revision — re-keying on every save would tear the dialog down mid-edit.
          key={editingCard.id}
          open
          onOpenChange={(open) => {
            if (!open) {
              setCardDialog(null)
              dialogs.returnToOrigin()
            }
          }}
          repoPath={repoPath}
          tags={activeBoard?.tags ?? []}
          readOnly={Boolean(activeBoard?.closedAt)}
          card={editingCard}
          onPatch={(patch) => updateCard(editingCard, patch)}
          onDelete={() => {
            // Cancelling the confirmation puts the card back on screen, which is where it was.
            dialogs.openFrom({ kind: 'card', cardId: editingCard.id }, () =>
              setDeletingCard(editingCard)
            )
            return Promise.resolve()
          }}
          onArchive={
            editingCard.archivedAt
              ? undefined
              : () => updateCard(editingCard, { archivedAt: new Date().toISOString() })
          }
          onUnarchive={
            editingCard.archivedAt ? () => updateCard(editingCard, { archivedAt: null }) : undefined
          }
          onDuplicate={() => duplicateCard(editingCard)}
          onCreateTag={(name) => createTagAndAssign(editingCard, name)}
          comments={cardComments}
          commentsLoading={commentsLoading}
          onAddComment={(body) => addComment(editingCard, body)}
          onCreateBranch={async () => {
            const branchName = branchNameForCard(editingCard.title)
            await apiCreateAndCheckoutBranch(repoPath, branchName, 'HEAD')
            await updateCard(editingCard, { linkedBranch: branchName })
          }}
          onCheckoutBranch={() =>
            editingCard.linkedBranch
              ? apiCheckoutBranch(repoPath, editingCard.linkedBranch)
              : Promise.resolve()
          }
          onUnlinkBranch={() => updateCard(editingCard, { linkedBranch: null })}
          onUntrack={editingCard.sourceIssue ? () => untrackCard(editingCard) : undefined}
          columns={activeBoard?.columns}
          boardName={activeBoard?.name}
          boardSource={activeBoard?.source}
          cards={cards}
          boards={boards}
          onAddLink={(target, kind) => addLink(editingCard, target, kind)}
          // Navigating to the parent *replaces* this dialog rather than stacking one: the card you
          // came from is one breadcrumb click away in the other direction.
          onOpenCard={(cardId) => setCardDialog({ mode: 'edit', cardId })}
          onRemoveLink={(link: ResolvedLink) =>
            updateCard(link.owner, { links: unlinkWrite(link) })
          }
          onMove={
            moveTargetsFor(boards, editingCard, activeBoard?.source ?? 'local').length > 0
              ? () =>
                  dialogs.openFrom({ kind: 'card', cardId: editingCard.id }, () =>
                    dialogs.setMovingCard(editingCard)
                  )
              : undefined
          }
        />
      )}

      {activeBoard && (
        <AddIssueDialog
          open={dialogs.isOpen('addIssue')}
          onOpenChange={(open) => dialogs.setOpen('addIssue', open)}
          repoPath={repoPath}
          columns={activeBoard.columns}
          trackedIssueNumbers={trackedIssueNumbers}
          onSubmit={(issueNumber, columnId) => addIssueToBoard(issueNumber, columnId)}
        />
      )}

      {activeBoard && (
        <ArchivedCardsDialog
          open={dialogs.isOpen('archived')}
          onOpenChange={(open) => dialogs.setOpen('archived', open)}
          board={activeBoard}
          cards={cards}
          onOpenCard={(card) =>
            dialogs.openFrom({ kind: 'archived' }, () =>
              setCardDialog({ mode: 'edit', cardId: card.id })
            )
          }
          onUnarchive={(card) => updateCard(card, { archivedAt: null })}
          onDelete={(card) => dialogs.openFrom({ kind: 'archived' }, () => setDeletingCard(card))}
          // A closed sprint is inert: its archive is part of the record, not a drawer to empty.
          onDeleteAll={
            activeBoard.closedAt
              ? undefined
              : () => dialogs.openFrom({ kind: 'archived' }, () => dialogs.open('purgeArchived'))
          }
        />
      )}

      <DeleteArchivedCardsDialog
        open={dialogs.isOpen('purgeArchived')}
        onOpenChange={(open) => {
          if (!open) {
            dialogs.setOpen('purgeArchived', false)
            // Cancelling puts the archive list back, which is where it was raised from — and so does
            // confirming, onto a list that is now empty and says so.
            dialogs.returnToOrigin()
          }
        }}
        count={cards.filter((c) => c.archivedAt).length}
        onConfirm={deleteArchivedCards}
      />

      <DeleteCardDialog
        open={deletingCard !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeletingCard(null)
            dialogs.returnToOrigin()
          }
        }}
        cardTitle={deletingCard?.title ?? ''}
        onConfirm={() => (deletingCard ? deleteCard(deletingCard) : Promise.resolve())}
        onArchive={
          deletingCard && !deletingCard.archivedAt
            ? () => updateCard(deletingCard, { archivedAt: new Date().toISOString() })
            : undefined
        }
      />

      <MoveCardDialog
        open={movingCard !== null}
        onOpenChange={(open) => {
          if (!open) {
            dialogs.setMovingCard(null)
            dialogs.returnToOrigin()
          }
        }}
        targets={
          movingCard ? moveTargetsFor(boards, movingCard, activeBoard?.source ?? 'local') : []
        }
        currentColumnId={movingCard?.columnId ?? ''}
        onSubmit={(targetBoardId, targetColumnId) =>
          movingCard
            ? moveCardToBoard(movingCard, targetBoardId, targetColumnId)
            : Promise.resolve()
        }
      />
    </>
  )
}
