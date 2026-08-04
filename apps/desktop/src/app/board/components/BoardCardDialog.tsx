import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Input,
  Spinner,
} from '@git-manager/ui'
import type {
  BoardCard,
  BoardCardPatch,
  BoardComment,
  BoardTag,
} from '@git-manager/git-types'
import { AttachmentTextarea } from './AttachmentTextarea'
import { CardTitleField } from './CardTitleField'
import { CardDescriptionField } from './CardDescriptionField'
import { CardDodSection } from './CardDodSection'
import { CardCommentsSection } from './CardCommentsSection'
import { CardMetaSidebar } from './CardMetaSidebar'
import { CardActionsMenu } from './CardActionsMenu'
import { cardIdentifier } from '../cardMeta'

interface BoardCardDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  repoPath: string
  tags: BoardTag[]
  attachmentUrlPrefix?: string
  /** A closed sprint's cards are readable but not editable. */
  readOnly?: boolean
}

interface CreateProps extends BoardCardDialogProps {
  mode: 'create'
  /** The board's Definition-of-Done template, seeding the new card's checklist. */
  dodTemplate: string
  onCreate: (title: string, description: string, dod: string) => Promise<unknown>
}

interface EditProps extends BoardCardDialogProps {
  mode: 'edit'
  card: BoardCard
  onPatch: (patch: BoardCardPatch) => Promise<unknown>
  onDelete?: () => Promise<unknown>
  onDuplicate?: () => Promise<unknown>
  onArchive?: () => Promise<unknown>
  onUnarchive?: () => Promise<unknown>
  onConvertToIssue?: () => void
  /** Creates a tag on the board from the card — see `CardTagPicker`. */
  onCreateTag?: (name: string) => Promise<BoardTag | null>
  comments: BoardComment[]
  commentsLoading?: boolean
  onAddComment: (body: string) => Promise<unknown>
  onCreateBranch?: () => Promise<unknown>
  onCheckoutBranch?: () => Promise<unknown>
  onUnlinkBranch?: () => Promise<unknown>
  /** Severs a tracked card's link to its GitHub issue — see `CardTrackingSection`. */
  onUntrack?: () => Promise<unknown>
}

/**
 * The card, in the two shapes it genuinely has.
 *
 * **Edit** is a wide, two-pane record: content on the left (description, checklist, discussion),
 * metadata on the right, and every field editable on click and saved on its own — the same gesture
 * the PR and issue views already teach.
 *
 * **Create** stays a small form with one Create button, and that asymmetry is not an oversight: per
 * field saving needs a card to save *to*, and there isn't one yet. The new card opens in edit mode
 * straight after, which is where the rest of its fields get filled in.
 */
export function BoardCardDialog(props: CreateProps | EditProps) {
  return props.mode === 'create' ? <CreateCardDialog {...props} /> : <EditCardDialog {...props} />
}

function CreateCardDialog({
  open,
  onOpenChange,
  repoPath,
  attachmentUrlPrefix,
  dodTemplate,
  onCreate,
}: CreateProps) {
  const { t } = useTranslation('board')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dod, setDod] = useState(dodTemplate)
  const [pending, setPending] = useState(false)

  async function submit() {
    if (!title.trim()) return
    setPending(true)
    try {
      await onCreate(title.trim(), description, dod)
      onOpenChange(false)
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="board-card-dialog">
        <DialogHeader>
          <DialogTitle>{t('card.dialog.createTitle')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('card.dialog.titlePlaceholder')}
            disabled={pending}
            autoFocus
            data-testid="board-card-title-input"
          />
          <AttachmentTextarea
            value={description}
            onChange={setDescription}
            repoPath={repoPath}
            attachmentUrlPrefix={attachmentUrlPrefix}
            placeholder={t('card.dialog.descriptionPlaceholder')}
            disabled={pending}
            className="text-xs"
            data-testid="board-card-description-input"
          />
          <div className="space-y-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t('card.dod.label')}
            </span>
            <AttachmentTextarea
              value={dod}
              onChange={setDod}
              repoPath={repoPath}
              placeholder={t('card.dod.placeholder')}
              rows={4}
              disabled={pending}
              className="text-xs"
              data-testid="board-card-dod-input"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" disabled={pending} onClick={() => onOpenChange(false)}>
            {t('card.dialog.cancel')}
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            disabled={pending || !title.trim()}
            onClick={() => void submit()}
            data-testid="board-card-save"
          >
            {pending && <Spinner className="h-3 w-3" />}
            {t('card.dialog.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditCardDialog({
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
  onConvertToIssue,
  onCreateTag,
  comments,
  commentsLoading,
  onAddComment,
  onCreateBranch,
  onCheckoutBranch,
  onUnlinkBranch,
  onUntrack,
}: EditProps) {
  const identifier = cardIdentifier(card)

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
        <DialogHeader className="shrink-0 space-y-0 border-b border-border py-2.5 pl-4 pr-12">
          <DialogTitle className="flex items-center gap-2">
            {identifier && (
              <span
                data-testid="card-identifier"
                className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
              >
                {identifier}
              </span>
            )}
            <CardTitleField
              title={card.title}
              readOnly={readOnly}
              onSave={(title) => onPatch({ title })}
            />
            <CardActionsMenu
              onDuplicate={readOnly || !onDuplicate ? undefined : () => void onDuplicate()}
              onArchive={readOnly || !onArchive ? undefined : () => void onArchive()}
              onUnarchive={readOnly || !onUnarchive ? undefined : () => void onUnarchive()}
              onConvertToIssue={readOnly ? undefined : onConvertToIssue}
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
            <CardDodSection
              dod={card.dod}
              onSave={(dod) => onPatch({ dod })}
              readOnly={readOnly}
            />
            <div className="px-4 py-3">
              <CardCommentsSection
                comments={comments}
                loading={commentsLoading}
                onSubmit={onAddComment}
                repoPath={repoPath}
                attachmentUrlPrefix={attachmentUrlPrefix}
                disabled={readOnly}
              />
            </div>
          </div>

          {/* One step darker than the content column, so the split reads as depth rather than as
              one flat slab. */}
          <div className="w-[230px] shrink-0 overflow-y-auto border-l border-border bg-card/60">
            <CardMetaSidebar
              card={card}
              tags={tags}
              repoPath={repoPath}
              onPatch={onPatch}
              onCreateTag={onCreateTag}
              onCreateBranch={onCreateBranch}
              onCheckoutBranch={onCheckoutBranch}
              onUnlinkBranch={onUnlinkBranch}
              onUntrack={onUntrack}
              readOnly={readOnly}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
