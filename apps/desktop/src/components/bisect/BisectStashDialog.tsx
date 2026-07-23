import { useTranslation } from '@git-manager/i18n'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
} from '@git-manager/ui'
import { Archive } from 'lucide-react'
import { useBisectUIStore } from '../../stores/bisectUI.store'
import { useBisectActions } from '../../hooks/useBisectActions'

interface BisectStashDialogProps {
  repoPath: string
}

/**
 * Shown the moment a bisect is started (from the tools menu) when the worktree is dirty — before
 * the commit selection even begins, because git bisect needs a clean tree to check out the commits
 * to test. Confirming stashes every change and then opens the commit-picking setup (the stash is
 * popped back automatically when the bisect ends or is cancelled). Refusing does nothing — no
 * bisect is started.
 */
export function BisectStashDialog({ repoPath }: BisectStashDialogProps) {
  const { t } = useTranslation('git')
  const open = useBisectUIStore((s) => s.stashDialogOpen)
  const closeStashDialog = useBisectUIStore((s) => s.closeStashDialog)
  const beginSetup = useBisectUIStore((s) => s.beginSetup)
  const { stashForBisect, pending } = useBisectActions(repoPath)

  async function handleConfirm() {
    const ok = await stashForBisect()
    if (ok) {
      closeStashDialog()
      beginSetup()
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && closeStashDialog()}>
      <DialogContent className="max-w-md" data-testid="bisect-stash-dialog">
        <DialogHeader>
          <DialogTitle>{t('bisect.stash.title')}</DialogTitle>
          <DialogDescription>{t('bisect.stash.description')}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={closeStashDialog} disabled={pending}>
            {t('bisect.stash.cancel')}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={pending}
            className="gap-1.5"
            data-testid="bisect-stash-confirm"
          >
            <Archive className="h-4 w-4" />
            {t('bisect.stash.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
