import { useEffect, useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { AlertTriangle, ArrowDownUp, Combine } from 'lucide-react'
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  RadioGroup,
  RadioGroupItem,
  ScrollArea,
  Spinner,
  cn,
} from '@git-manager/ui'
import type { PendingCommitReorder } from '../../hooks/useCommitReorderDrag'

/** Preview rows shown before the list is scrolled — enough for the change to read at a glance. */
const PREVIEW_MAX_HEIGHT = 220

interface CommitReorderDialogProps {
  pending: PendingCommitReorder | null
  busy: boolean
  onCancel: () => void
  onConfirm: (mode: 'squash' | 'fixup') => void
}

/**
 * Confirms a commit drag before it rewrites anything: what will move, where it lands, the resulting
 * order, and — for a combine — whether the folded commits keep their messages.
 *
 * The preview is the *result* rather than a diff of the two orders: the graph the user is looking
 * at already shows the "before", so showing the "after" in the same top-is-newest order is what
 * lets them check the drop landed where they aimed without decoding a second representation.
 */
export function CommitReorderDialog({
  pending,
  busy,
  onCancel,
  onConfirm,
}: CommitReorderDialogProps) {
  const { t } = useTranslation('git')
  const [mode, setMode] = useState<'squash' | 'fixup'>('fixup')

  // Each drop is its own decision: a previous choice of "keep both messages" must not silently
  // apply to the next combine.
  useEffect(() => {
    if (pending) setMode('fixup')
  }, [pending])

  if (!pending) return null

  const isCombine = pending.operation.kind === 'combine'
  const movedOids = new Set(pending.sources.map((c) => c.oid))
  const count = pending.sources.length

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-lg" data-testid="commit-reorder-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isCombine ? (
              <Combine className="h-4 w-4" aria-hidden />
            ) : (
              <ArrowDownUp className="h-4 w-4" aria-hidden />
            )}
            {isCombine ? t('commitReorder.combineTitle') : t('commitReorder.reorderTitle')}
          </DialogTitle>
          <DialogDescription>
            {isCombine
              ? t('commitReorder.combineDescription', {
                  count,
                  target: pending.target.subject,
                })
              : t('commitReorder.reorderDescription', {
                  count,
                  target: pending.target.subject,
                })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t('commitReorder.previewTitle')}
          </p>
          <ScrollArea style={{ maxHeight: PREVIEW_MAX_HEIGHT }} className="rounded-md border">
            <ul data-testid="commit-reorder-preview">
              {pending.preview.map((commit) => {
                const moved = movedOids.has(commit.oid)
                const folded = isCombine && moved
                return (
                  <li
                    key={commit.oid}
                    data-testid={`commit-reorder-preview-${commit.shortOid}`}
                    data-moved={moved || undefined}
                    className={cn(
                      'flex items-center gap-2 px-2.5 py-1.5 text-xs',
                      moved && 'bg-primary/10 font-medium',
                      folded && 'pl-6'
                    )}
                  >
                    <code className="shrink-0 font-mono text-[10px] text-muted-foreground">
                      {commit.shortOid}
                    </code>
                    <span className="min-w-0 flex-1 truncate">{commit.subject}</span>
                    {folded && (
                      <span className="shrink-0 text-[10px] uppercase text-primary">
                        {mode === 'squash'
                          ? t('commitReorder.badgeSquash')
                          : t('commitReorder.badgeFixup')}
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          </ScrollArea>

          {isCombine && (
            <RadioGroup
              value={mode}
              onValueChange={(value) => setMode(value as 'squash' | 'fixup')}
              disabled={busy}
              className="gap-1.5"
            >
              <Label className="flex cursor-pointer items-center gap-2 text-xs font-normal">
                <RadioGroupItem value="fixup" data-testid="commit-reorder-mode-fixup" />
                {t('commitReorder.modeFixup')}
              </Label>
              <Label className="flex cursor-pointer items-center gap-2 text-xs font-normal">
                <RadioGroupItem value="squash" data-testid="commit-reorder-mode-squash" />
                {t('commitReorder.modeSquash')}
              </Label>
            </RadioGroup>
          )}

          {pending.rewritesPublished && (
            <Alert
              variant="warning"
              role="alert"
              icon={<AlertTriangle className="h-3.5 w-3.5" />}
              data-testid="commit-reorder-published-warning"
            >
              {t('commitReorder.publishedWarning')}
            </Alert>
          )}

          <p className="text-[11px] text-muted-foreground">
            {t('commitReorder.conflictHint', { count: pending.operation.affectedOids.length })}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            {t('commitReorder.cancel')}
          </Button>
          <Button
            onClick={() => onConfirm(mode)}
            disabled={busy}
            className="gap-1.5"
            data-testid="commit-reorder-confirm"
          >
            {busy && <Spinner className="h-3.5 w-3.5" />}
            {isCombine ? t('commitReorder.confirmCombine') : t('commitReorder.confirmReorder')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
