import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Input, Spinner } from '@git-manager/ui'
import type { BoardCardKind } from '@git-manager/git-types'
import { AttachmentTextarea } from './AttachmentTextarea'
import { CardKindPicker } from './CardKindPicker'
import { CardPrefixPicker } from './CardPrefixPicker'
import type { CreateProps } from './BoardCardDialog'

/**
 * The new-card form: a small dialog with one Create button.
 *
 * Deliberately not the two-pane record its edit counterpart is — per-field saving needs a card to
 * save *to*, and there isn't one yet. It collects only what has to be decided before the card
 * exists (its kind, its identifier sequence, its title) plus the two fields that are awkward to fill
 * in afterwards; the new card then opens in the full editor, which is where the rest happens.
 */
export function CreateCardDialog({
  open,
  onOpenChange,
  repoPath,
  attachmentUrlPrefix,
  dodTemplate,
  cardPrefixes,
  onCreate,
}: CreateProps) {
  const { t } = useTranslation('board')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dod, setDod] = useState(dodTemplate)
  // The board's first prefix, which is the one it was created with — a board that offers none starts
  // the card with no identifier rather than inventing a sequence for it.
  const [prefix, setPrefix] = useState(cardPrefixes[0] ?? '')
  const [kind, setKind] = useState<BoardCardKind>('task')
  const [pending, setPending] = useState(false)

  async function submit() {
    if (!title.trim()) return
    setPending(true)
    try {
      await onCreate({ title: title.trim(), description, dod, prefix, kind })
    } catch {
      // Reported by the action layer (`reportWriteFailures`); swallowed here so the rejection isn't
      // an unhandled one, and so the dialog stays open on what the user typed.
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
          {/* Kind first: it is the one choice that changes how the title should be written. */}
          <CardKindPicker value={kind} onChange={setKind} disabled={pending} />

          <div className="flex gap-2">
            <div className="w-[170px] shrink-0">
              <CardPrefixPicker
                prefixes={cardPrefixes}
                value={prefix}
                onChange={setPrefix}
                disabled={pending}
              />
            </div>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('card.dialog.titlePlaceholder')}
              disabled={pending}
              autoFocus
              className="min-w-0 flex-1"
              data-testid="board-card-title-input"
            />
          </div>

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
