import { useMemo, useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Button, Spinner } from '@git-manager/ui'
import { Kanban } from 'lucide-react'
import type { BoardCard } from '@git-manager/git-types'
import { useBoardData } from '../../hooks/useBoardData'
import { useBoardControlsStore } from '../../stores/boardControls.store'
import { apiCreateAndCheckoutBranch, apiCheckoutBranch } from '../../api/git.api'
import { BoardPageHeader } from './components/BoardPageHeader'
import { BoardColumnsArea } from './components/BoardColumnsArea'
import { CloseSprintDialog } from './components/CloseSprintDialog'
import { SprintSummaryView } from './components/SprintSummaryView'
import { BoardCardDialog } from './components/BoardCardDialog'
import { CreateBoardDialog } from './components/CreateBoardDialog'
import { ColumnEditorDialog } from './components/ColumnEditorDialog'
import { BoardSettingsDialog } from './components/BoardSettingsDialog'
import { DeleteBoardDialog } from './components/DeleteBoardDialog'
import { DeleteCardDialog } from './components/DeleteCardDialog'
import { ConvertToIssueDialog } from './components/ConvertToIssueDialog'
import { AddIssueDialog } from './components/AddIssueDialog'
import { ArchivedCardsDialog } from './components/ArchivedCardsDialog'
import { defaultColumns, branchNameForCard } from './boardDefaults'
import { useCardComments } from './useCardComments'

interface BoardPageProps {
  repoPath: string
}

/**
 * The open dialog. Edit mode holds the card's **id**, never the card object: a snapshot goes stale
 * the moment any field is saved, and since a card's `revision` is its optimistic-concurrency token,
 * editing a second field would send the previous revision and be rejected as a conflict.
 */
type CardDialogState = { mode: 'create'; columnId: string } | { mode: 'edit'; cardId: string }

/**
 * Where closing a dialog should put you back.
 *
 * Several dialogs here open *from* another one — a card from the archive list, a delete confirmation
 * from either. They replace rather than stack: the card dialog is 1100px tall and covers whatever is
 * behind it completely, so a second modal layer would buy nothing but a backdrop over a backdrop.
 * What was missing is the way back — closing the card dropped you on the board instead of into the
 * list you were reading.
 *
 * A single origin, not a growing stack: every one of these chains is exactly two deep, and a stack
 * that can only ever hold one entry is a stack that will be wrong the first time it holds two.
 */
type DialogOrigin = { kind: 'archived' } | { kind: 'card'; cardId: string }

/** The Kanban board page — a sibling top-level feature to Launchpad (see `App.tsx`/`TabBar.tsx`),
 * generic over both backends via `useBoardData`, with `@dnd-kit` driving cross-column drag and
 * in-column reorder. */
export function BoardPage({ repoPath }: BoardPageProps) {
  const { t } = useTranslation('board')
  const {
    boards,
    boardsLoading,
    activeBoard,
    setActiveBoard,
    cards,
    cardsLoading,
    canUseRemote,
    remoteBoards,
    createBoard,
    updateBoardColumns,
    deleteBoard,
    createCard,
    updateCard,
    moveCard,
    deleteCard,
    duplicateCard,
    addComment,
    loadComments,
    updateBoardMeta,
    createTagAndAssign,
    closeSprint,
    convertCardToIssue,
    addIssueToBoard,
    untrackCard,
    trackedIssueNumbers,
  } = useBoardData(repoPath)

  const search = useBoardControlsStore((s) => s.search)
  const setSearch = useBoardControlsStore((s) => s.setSearch)

  const [createBoardOpen, setCreateBoardOpen] = useState(false)
  const [columnEditorOpen, setColumnEditorOpen] = useState(false)
  const [boardSettingsOpen, setBoardSettingsOpen] = useState(false)
  const [deleteBoardOpen, setDeleteBoardOpen] = useState(false)
  const [closeSprintOpen, setCloseSprintOpen] = useState(false)
  const [showClosed, setShowClosed] = useState(false)
  const [cardDialog, setCardDialog] = useState<CardDialogState | null>(null)
  const [addIssueOpen, setAddIssueOpen] = useState(false)
  const [archivedOpen, setArchivedOpen] = useState(false)
  const [dialogOrigin, setDialogOrigin] = useState<DialogOrigin | null>(null)
  const [convertingCard, setConvertingCard] = useState<BoardCard | null>(null)
  const [deletingCard, setDeletingCard] = useState<BoardCard | null>(null)
  // Resolved from the live list on every render, so a field saved a moment ago is reflected here —
  // including the card's fresh `revision`, which the next save needs to be accepted.
  const editingCard =
    cardDialog?.mode === 'edit' ? (cards.find((c) => c.id === cardDialog.cardId) ?? null) : null
  const { comments: cardComments, loading: commentsLoading } = useCardComments(
    editingCard,
    loadComments
  )


  const isClosed = Boolean(activeBoard?.closedAt)
  // Closed sprints stay listed but out of the way. The one currently open is always shown, so a
  // sprint doesn't vanish from under the user the moment they close it.
  const visibleBoards = useMemo(
    () => boards.filter((b) => showClosed || !b.closedAt || b.id === activeBoard?.id),
    [boards, showClosed, activeBoard?.id]
  )

  /**
   * What the columns show.
   *
   * An archived card is hidden while browsing and returns as soon as there is a search — which is
   * the whole point of archiving over deleting: the card is still there, just out of the way. So the
   * search deliberately runs over *every* card, archived included.
   */
  const filteredCards = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return cards.filter((c) => !c.archivedAt)
    return cards.filter(
      (c) => c.title.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)
    )
  }, [cards, search])

  /** Opens `next` from the dialog currently on screen, remembering where to come back to. */
  function openFrom(origin: DialogOrigin, next: () => void) {
    setArchivedOpen(false)
    setCardDialog(null)
    setDialogOrigin(origin)
    next()
  }

  /**
   * Reopens whatever the dialog just closed was opened from.
   *
   * A card that was deleted in the meantime needs no special case: `editingCard` resolves it out of
   * the live card list, so a stale id simply renders nothing.
   */
  function returnToOrigin() {
    if (!dialogOrigin) return
    if (dialogOrigin.kind === 'archived') setArchivedOpen(true)
    else setCardDialog({ mode: 'edit', cardId: dialogOrigin.cardId })
    setDialogOrigin(null)
  }

  const cardActionsFor = (card: BoardCard) =>
    isClosed
      ? undefined
      : {
          onDuplicate: () => void duplicateCard(card),
          onArchive: card.archivedAt
            ? undefined
            : () => void updateCard(card, { archivedAt: new Date().toISOString() }),
          onUnarchive: card.archivedAt
            ? () => void updateCard(card, { archivedAt: null })
            : undefined,
          onDelete: () => setDeletingCard(card),
        }


  if (boardsLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <Spinner className="h-5 w-5" />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <BoardPageHeader
        boards={visibleBoards}
        activeBoard={activeBoard}
        onSelectBoard={setActiveBoard}
        search={search}
        onSearchChange={setSearch}
        showClosed={showClosed}
        onShowClosedChange={setShowClosed}
        canUseRemote={canUseRemote}
        onAddIssue={() => setAddIssueOpen(true)}
        archivedCount={cards.filter((c) => c.archivedAt).length}
        onOpenArchived={() => setArchivedOpen(true)}
        onEditColumns={() => setColumnEditorOpen(true)}
        onOpenSettings={() => setBoardSettingsOpen(true)}
        onCloseSprint={() => setCloseSprintOpen(true)}
        onDeleteBoard={() => setDeleteBoardOpen(true)}
        onCreateBoard={() => setCreateBoardOpen(true)}
      />

      {/* `overflow-hidden`, not `overflow-auto`: the columns are what scroll, each inside its own
          track, so a long column never drags the whole board's scrollbar with it. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
        {!activeBoard ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <Kanban className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">{t('page.emptyState')}</p>
            <Button size="sm" onClick={() => setCreateBoardOpen(true)}>
              {t('page.newBoard')}
            </Button>
          </div>
        ) : cardsLoading ? (
          <div className="flex h-full items-center justify-center">
            <Spinner className="h-5 w-5" />
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            {isClosed && (
              <div
                className="flex shrink-0 flex-wrap items-center gap-3 rounded border border-border bg-card/50 px-3 py-2"
                data-testid="board-closed-banner"
              >
                <p className="text-xs font-medium text-foreground">{t('sprint.readOnly')}</p>
                {activeBoard.closedAt && (
                  <p className="text-[11px] text-muted-foreground">
                    {t('sprint.closedOn', {
                      date: new Date(activeBoard.closedAt).toLocaleDateString(),
                    })}
                  </p>
                )}
              </div>
            )}

            {isClosed && activeBoard.summary && (
              <div className="max-h-64 max-w-md shrink-0 overflow-y-auto rounded border border-border bg-card/30 p-3">
                <h2 className="mb-2 text-xs font-semibold text-foreground">
                  {t('sprint.summaryTitle')}
                </h2>
                <SprintSummaryView summary={activeBoard.summary} />
              </div>
            )}

            <BoardColumnsArea
              board={activeBoard}
              cards={filteredCards}
              readOnly={isClosed}
              onAddCard={(columnId) => setCardDialog({ mode: 'create', columnId })}
              onCardClick={(card) => setCardDialog({ mode: 'edit', cardId: card.id })}
              onMoveCard={(card, columnId, order) => void moveCard(card, columnId, order)}
              cardActionsFor={cardActionsFor}
            />
          </div>
        )}
      </div>

      <CreateBoardDialog
        open={createBoardOpen}
        onOpenChange={setCreateBoardOpen}
        canUseRemote={canUseRemote}
        onSubmit={(name, source, dodTemplate, cardPrefix) =>
          createBoard(name, defaultColumns(), source, dodTemplate, cardPrefix)
        }
      />

      {activeBoard && (
        <ColumnEditorDialog
          open={columnEditorOpen}
          onOpenChange={setColumnEditorOpen}
          columns={activeBoard.columns}
          onSave={updateBoardColumns}
        />
      )}

      {activeBoard && (
        <CloseSprintDialog
          open={closeSprintOpen}
          onOpenChange={setCloseSprintOpen}
          board={activeBoard}
          cards={cards}
          onConfirm={closeSprint}
        />
      )}

      {activeBoard && (
        <BoardSettingsDialog
          open={boardSettingsOpen}
          onOpenChange={setBoardSettingsOpen}
          name={activeBoard.name}
          tags={activeBoard.tags}
          dodTemplate={activeBoard.dodTemplate}
          cardPrefixes={activeBoard.cardPrefixes}
          onSave={updateBoardMeta}
        />
      )}

      {activeBoard && (
        <DeleteBoardDialog
          open={deleteBoardOpen}
          onOpenChange={setDeleteBoardOpen}
          boardName={activeBoard.name}
          onConfirm={() => deleteBoard(activeBoard)}
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
          onCreate={async (title, description, dod) => {
            const created = await createCard(cardDialog.columnId, title, description)
            if (!created) return
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
              returnToOrigin()
            }
          }}
          repoPath={repoPath}
          tags={activeBoard?.tags ?? []}
          readOnly={Boolean(activeBoard?.closedAt)}
          card={editingCard}
          onPatch={(patch) => updateCard(editingCard, patch)}
          onDelete={() => {
            // Cancelling the confirmation puts the card back on screen, which is where it was.
            openFrom({ kind: 'card', cardId: editingCard.id }, () => setDeletingCard(editingCard))
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
          onConvertToIssue={
            editingCard.boardId === activeBoard?.id &&
            activeBoard?.source === 'local' &&
            canUseRemote &&
            remoteBoards.length > 0
              ? () =>
                  openFrom({ kind: 'card', cardId: editingCard.id }, () =>
                    setConvertingCard(editingCard)
                  )
              : undefined
          }
        />
      )}

      {activeBoard && (
        <AddIssueDialog
          open={addIssueOpen}
          onOpenChange={setAddIssueOpen}
          repoPath={repoPath}
          columns={activeBoard.columns}
          trackedIssueNumbers={trackedIssueNumbers}
          onSubmit={(issueNumber, columnId) => addIssueToBoard(issueNumber, columnId)}
        />
      )}

      {activeBoard && (
        <ArchivedCardsDialog
          open={archivedOpen}
          onOpenChange={setArchivedOpen}
          board={activeBoard}
          cards={cards}
          onOpenCard={(card) =>
            openFrom({ kind: 'archived' }, () =>
              setCardDialog({ mode: 'edit', cardId: card.id })
            )
          }
          onUnarchive={(card) => updateCard(card, { archivedAt: null })}
          onDelete={(card) => openFrom({ kind: 'archived' }, () => setDeletingCard(card))}
        />
      )}

      <DeleteCardDialog
        open={deletingCard !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeletingCard(null)
            returnToOrigin()
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

      <ConvertToIssueDialog
        open={convertingCard !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConvertingCard(null)
            returnToOrigin()
          }
        }}
        remoteBoards={remoteBoards}
        onSubmit={(targetBoardId, targetColumnId) =>
          convertingCard
            ? convertCardToIssue(convertingCard, targetBoardId, targetColumnId)
            : Promise.resolve()
        }
      />
    </div>
  )
}
