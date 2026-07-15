import { useEffect, useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@git-manager/ui'
import { useBranches } from '../../../hooks/useBranches'

interface PrBaseBranchDialogProps {
  repoPath: string
  open: boolean
  currentBase: string | null
  onSelect: (branch: string) => void
  onClose: () => void
}

/** Picks a different base branch for the PR. Reuses the same {@link useBranches} data as the rest of
 * the app (e.g. the worktree dialog) rather than a bespoke branch source. */
export function PrBaseBranchDialog({
  repoPath,
  open,
  currentBase,
  onSelect,
  onClose,
}: PrBaseBranchDialogProps) {
  const { t } = useTranslation('git')
  const { data: branches = [] } = useBranches(repoPath)
  const localBranches = branches.filter((b) => !b.isRemote)
  const [selected, setSelected] = useState(currentBase ?? '')

  // Re-sync when reopened with a different current base or once branches resolve.
  useEffect(() => {
    if (open) setSelected(currentBase ?? localBranches[0]?.shortName ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currentBase])

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="pr-base-branch-dialog">
        <DialogHeader>
          <DialogTitle>{t('pr.baseDialog.title')}</DialogTitle>
        </DialogHeader>

        <div className="py-1">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            data-testid="pr-base-branch-select"
            className="block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          >
            {localBranches.map((b) => (
              <option key={b.name} value={b.shortName}>
                {b.shortName}
              </option>
            ))}
          </select>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t('pr.baseDialog.cancel')}
          </Button>
          <Button
            size="sm"
            disabled={!selected}
            data-testid="pr-base-branch-confirm"
            onClick={() => {
              onSelect(selected)
              onClose()
            }}
          >
            {t('pr.baseDialog.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
