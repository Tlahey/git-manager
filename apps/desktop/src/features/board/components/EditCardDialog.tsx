import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@git-manager/ui'
import { CardTitleField } from './CardTitleField'
import { CardDescriptionField } from './CardDescriptionField'
import { CardDodSection } from './CardDodSection'
import { CardActivitySection } from './CardActivitySection'
import { CardMetaSidebar } from './CardMetaSidebar'
import { CardActionsMenu } from './CardActionsMenu'
import { CardKindIcon } from './CardKindIcon'
import { CardLinksSection } from './CardLinksSection'
import { CardStatusPicker } from './CardStatusPicker'
import { CardBreadcrumb } from './CardBreadcrumb'
import { CardArchivedBadge } from './CardArchivedBadge'
import type { EditProps } from './BoardCardDialog'

/**
 * The card as a record: a wide two-pane view, content on the left and metadata on the right, with
 * every field editable on click and saved on its own — the same gesture the PR and issue views
 * already teach.
 *
 * The left column's blocks each own their heading and their fold (`CardContentSection`); the right
 * column groups its fields into named panels (`CardMetaSidebar`). Neither is this component's
 * business: what lives here is the frame, the header and which piece goes where.
 */
export function EditCardDialog({
  open,
  onOpenChange,
  repoPath,
  tags,
  attachmentUrlPrefix,
  readOnly,
  card,
  onPatch,
  onDelete,
  onDuplicate,
  onArchive,
  onUnarchive,
  onMove,
  columns,
  boardName,
  boardSource,
  cards,
  boards,
  onAddLink,
  onRemoveLink,
  onCreateTag,
  comments,
  commentsLoading,
  onAddComment,
  repliesEnabled,
  history,
  historyLoading,
  onCreateBranch,
  onCheckoutBranch,
  onUnlinkBranch,
  onCreatePr,
  onCreateWorktree,
  onUnlinkWorktree,
  onUntrack,
  onOpenCard,
}: EditProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* The centred variant ships `max-w-lg grid p-6`; `cn()` is twMerge-backed and `className`
          lands last, so each of those is replaced rather than fought with. */}
      {/* `bg-popover` rather than the default `bg-background`: in the dark theme those are 11% and
          4.9% lightness, and a dialog is exactly the floating surface `--popover` exists for. */}
      <DialogContent
        data-testid="board-card-dialog"
        className="flex h-[85vh] max-w-[1100px] flex-col gap-0 overflow-hidden bg-popover p-0"
      >
        {/* `pr-12` keeps the actions menu clear of the close button `DialogContent` pins at
            `right-4 top-4` — the two were landing on top of each other. */}
        <DialogHeader className="shrink-0 space-y-0 border-b border-border py-2.5 pr-12 pl-4">
          <CardBreadcrumb
            card={card}
            boardName={boardName}
            boardSource={boardSource}
            cards={cards}
            onOpenCard={onOpenCard}
            onAddLink={onAddLink ? (target, kind) => onAddLink(target, kind) : undefined}
            readOnly={readOnly}
          />
          <DialogTitle className="flex items-center gap-2">
            <CardKindIcon kind={card.kind} className="shrink-0" />
            <CardTitleField
              title={card.title}
              readOnly={readOnly}
              onSave={(title) => onPatch({ title })}
            />
            {/* Before the actions menu, not after: archiving is performed *from* that menu, and the
                confirmation of what just happened belongs next to the title rather than tucked
                behind the control that caused it. */}
            <CardArchivedBadge archivedAt={card.archivedAt} testId="card-dialog-archived" />
            <CardActionsMenu
              testId="card-dialog-actions-menu"
              onDuplicate={readOnly || !onDuplicate ? undefined : () => void onDuplicate()}
              onArchive={readOnly || !onArchive ? undefined : () => void onArchive()}
              onUnarchive={readOnly || !onUnarchive ? undefined : () => void onUnarchive()}
              onMove={readOnly ? undefined : onMove}
              // Deleting is confirmed by the caller — this only asks for it.
              onDelete={readOnly || !onDelete ? undefined : () => void onDelete()}
            />
          </DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="min-w-0 flex-1 overflow-y-auto">
            <CardDescriptionField
              description={card.description}
              onSave={(description) => onPatch({ description })}
              repoPath={repoPath}
              attachmentUrlPrefix={attachmentUrlPrefix}
              readOnly={readOnly}
            />

            <CardDodSection dod={card.dod} onSave={(dod) => onPatch({ dod })} readOnly={readOnly} />

            {cards && boards && onAddLink && onRemoveLink && (
              <CardLinksSection
                card={card}
                cards={cards}
                boards={boards}
                onAdd={onAddLink}
                onRemove={onRemoveLink}
                onOpenCard={onOpenCard}
                readOnly={readOnly}
              />
            )}

            <CardActivitySection
              comments={comments}
              commentsLoading={commentsLoading}
              onSubmit={onAddComment}
              repliesEnabled={repliesEnabled}
              repoPath={repoPath}
              attachmentUrlPrefix={attachmentUrlPrefix}
              disabled={readOnly}
              history={history}
              historyLoading={historyLoading}
              columns={columns ?? []}
              tags={tags}
            />
          </div>

          {/* One step darker than the content column, so the split reads as depth rather than as one
              flat slab. Wide enough for a label column beside every value — see `CardFieldRow`. */}
          <div className="w-[320px] shrink-0 overflow-y-auto border-l border-border bg-card/60">
            {/* Above the fields, not among them: which column a card is in is the one thing about it
                that the whole board is arranged by. */}
            {columns && (
              <div className="px-3 pt-3" data-testid="card-status-block">
                <CardStatusPicker
                  columns={columns}
                  columnId={card.columnId}
                  onChange={(columnId) => onPatch({ columnId })}
                  readOnly={readOnly}
                />
              </div>
            )}
            <CardMetaSidebar
              card={card}
              tags={tags}
              repoPath={repoPath}
              onPatch={onPatch}
              onCreateTag={onCreateTag}
              onCreateBranch={onCreateBranch}
              onCheckoutBranch={onCheckoutBranch}
              onUnlinkBranch={onUnlinkBranch}
              onCreatePr={onCreatePr}
              onCreateWorktree={onCreateWorktree}
              onUnlinkWorktree={onUnlinkWorktree}
              onUntrack={onUntrack}
              readOnly={readOnly}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
