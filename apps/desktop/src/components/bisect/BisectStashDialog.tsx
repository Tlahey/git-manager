import { useTranslation } from '@git-manager/i18n'
import { useBisectUIStore } from '../../stores/bisectUI.store'
import { useStashDialogStore } from '../../stores/stashDialog.store'
import { useBisectActions } from '../../hooks/useBisectActions'
import { StashConfirmDialog } from '../shared/StashConfirmDialog'

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
  const isOpen = useStashDialogStore((s) => s.isOpen && s.reason === 'bisect')
  const closeDialog = useStashDialogStore((s) => s.closeDialog)
  const beginSetup = useBisectUIStore((s) => s.beginSetup)
  const { stashForBisect, pending } = useBisectActions(repoPath)

  async function handleConfirm() {
    const ok = await stashForBisect()
    if (ok) {
      closeDialog()
      beginSetup()
    }
  }

  return (
    <StashConfirmDialog
      open={isOpen}
      onOpenChange={(next) => !next && closeDialog()}
      title={t('bisect.stash.title')}
      description={t('bisect.stash.description')}
      cancelLabel={t('bisect.stash.cancel')}
      confirmLabel={t('bisect.stash.confirm')}
      onCancel={closeDialog}
      onConfirm={handleConfirm}
      pending={pending}
      testId="bisect-stash-dialog"
      confirmTestId="bisect-stash-confirm"
    />
  )
}
