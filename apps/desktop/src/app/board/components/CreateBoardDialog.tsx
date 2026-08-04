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
  Textarea,
} from '@git-manager/ui'

interface CreateBoardDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  canUseRemote: boolean
  onSubmit: (
    name: string,
    source: BoardSource,
    dodTemplate: string,
    cardPrefix: string
  ) => Promise<unknown>
}

/** New-board dialog: a name, which backend it lives on, and optionally the Definition-of-Done
 * template its cards start from. Columns start from `boardDefaults.defaultColumns()` — edited
 * afterward via `ColumnEditorDialog`, not chosen here; tags likewise via `BoardSettingsDialog`. */
export function CreateBoardDialog({ open, onOpenChange, canUseRemote, onSubmit }: CreateBoardDialogProps) {
  const { t } = useTranslation('board')
  const [name, setName] = useState('')
  const [source, setSource] = useState<BoardSource>('local')
  const [dodTemplate, setDodTemplate] = useState('')
  const [cardPrefix, setCardPrefix] = useState('')
  const [pending, setPending] = useState(false)

  function handleOpenChange(next: boolean) {
    if (!next) {
      setName('')
      setSource('local')
      setDodTemplate('')
      setCardPrefix('')
    }
    onOpenChange(next)
  }

  async function handleSubmit() {
    if (!name.trim()) return
    setPending(true)
    try {
      await onSubmit(name.trim(), source, dodTemplate, cardPrefix)
      handleOpenChange(false)
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
