import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import type { BoardSource } from '@git-manager/git-types'
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  Spinner,
  Switch,
  Textarea,
} from '@git-manager/ui'
import { firstIterationName } from '../lib/boardIteration'

interface CreateBoardDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  canUseRemote: boolean
  onSubmit: (
    name: string,
    source: BoardSource,
    dodTemplate: string,
    cardPrefix: string,
    iteration: boolean
  ) => Promise<unknown>
}

/**
 * New-board dialog: a name, whether it is an iteration, which backend it lives on, and optionally the
 * Definition-of-Done template its cards start from. Columns start from
 * `boardDefaults.defaultColumns()` — edited afterward via `ColumnEditorDialog`, not chosen here; tags
 * likewise via `BoardSettingsDialog`.
 *
 * **Iteration is asked here and only here.** It decides whether the board can ever be closed, which
 * is a statement about what the board *is* — a sprint that ends, or a backlog that doesn't — rather
 * than a preference to revise later. Getting it wrong costs creating another board, which is cheap;
 * the alternative, a board mid-sprint being reclassified as one that never ends, has no sensible
 * meaning for the report and the successor it would have produced.
 */
export function CreateBoardDialog({ open, onOpenChange, canUseRemote, onSubmit }: CreateBoardDialogProps) {
  const { t } = useTranslation('board')
  const [name, setName] = useState('')
  const [source, setSource] = useState<BoardSource>('local')
  const [dodTemplate, setDodTemplate] = useState('')
  const [cardPrefix, setCardPrefix] = useState('')
  const [iteration, setIteration] = useState(true)
  const [pending, setPending] = useState(false)

  function handleOpenChange(next: boolean) {
    if (!next) {
      setName('')
      setSource('local')
      setDodTemplate('')
      setCardPrefix('')
      setIteration(true)
    }
    onOpenChange(next)
  }

  async function handleSubmit() {
    if (!name.trim()) return
    setPending(true)
    try {
      await onSubmit(name.trim(), source, dodTemplate, cardPrefix, iteration)
      handleOpenChange(false)
    } catch {
      // Reported by the action layer (`reportWriteFailures`); swallowed here so the rejection isn't
      // an unhandled one, and so the dialog stays open on what the user typed.
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent data-testid="create-board-dialog">
        <DialogHeader>
          <DialogTitle>{t('createBoard.title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="board-name-input">{t('createBoard.nameLabel')}</Label>
            <Input
              id="board-name-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('createBoard.namePlaceholder')}
              disabled={pending}
              autoFocus
              data-testid="board-name-input"
            />
          </div>

          <div className="space-y-1.5">
            <label className="flex cursor-pointer items-start gap-2 text-xs">
              <Switch
                checked={iteration}
                onChange={(e) => setIteration(e.target.checked)}
                disabled={pending}
                data-testid="board-iteration-input"
              />
              <span>
                <span className="block font-medium text-foreground">
                  {t('createBoard.iterationLabel')}
                </span>
                <span className="block text-muted-foreground">
                  {iteration
                    ? t('createBoard.iterationDescription', {
                        example: firstIterationName(name || 'Sprint', true),
                      })
                    : t('createBoard.standingDescription')}
                </span>
              </span>
            </label>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="board-prefix-input">{t('createBoard.prefixLabel')}</Label>
            <Input
              id="board-prefix-input"
              value={cardPrefix}
              onChange={(e) => setCardPrefix(e.target.value)}
              placeholder={t('createBoard.prefixPlaceholder')}
              disabled={pending}
              maxLength={10}
              className="uppercase"
              data-testid="board-prefix-input"
            />
            <p className="text-[10px] text-muted-foreground">
              {t('createBoard.prefixHint', { example: cardPrefix.trim().toUpperCase() || 'GM' })}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>{t('createBoard.backendLabel')}</Label>
            <RadioGroup value={source} onValueChange={(v) => setSource(v as BoardSource)} disabled={pending}>
              <label className="flex cursor-pointer items-start gap-2 text-xs">
                <RadioGroupItem value="local" className="mt-0.5" />
                <span>
                  <span className="block font-medium text-foreground">{t('createBoard.localLabel')}</span>
                  <span className="block text-muted-foreground">{t('createBoard.localDescription')}</span>
                </span>
              </label>
              <label
                className={`flex items-start gap-2 text-xs ${canUseRemote ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}
              >
                <RadioGroupItem value="remote" disabled={!canUseRemote} className="mt-0.5" />
                <span>
                  <span className="block font-medium text-foreground">{t('createBoard.remoteLabel')}</span>
                  <span className="block text-muted-foreground">
                    {canUseRemote
                      ? t('createBoard.remoteDescription')
                      : t('createBoard.remoteUnavailable')}
                  </span>
                </span>
              </label>
            </RadioGroup>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="board-dod-input">{t('createBoard.dodLabel')}</Label>
            <Textarea
              id="board-dod-input"
              value={dodTemplate}
              onChange={(e) => setDodTemplate(e.target.value)}
              placeholder={t('boardSettings.dodPlaceholder')}
              rows={3}
              disabled={pending}
              className="text-xs"
              data-testid="board-dod-template-input"
            />
            <p className="text-[10px] text-muted-foreground">{t('boardSettings.dodHint')}</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" disabled={pending} onClick={() => handleOpenChange(false)}>
            {t('card.dialog.cancel')}
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            disabled={pending || !name.trim()}
            onClick={() => void handleSubmit()}
            data-testid="create-board-submit"
          >
            {pending && <Spinner className="h-3 w-3" />}
            {t('createBoard.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
