import { useQuery } from '@tanstack/react-query'
import { useTranslation } from '@git-manager/i18n'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@git-manager/ui'
import { apiGetCommitDiff } from '../../../api/git.api'
import { DiffFilesPanel } from './DiffFilesPanel'

interface CompareToParentDialogProps {
  repoPath: string
  oid: string
  shortOid: string
  /** 1-based, as in `git revert -m` and in the menu entry the user just clicked. */
  parentNumber: number
  /** Short sha of that parent, when it is in the loaded page — named in the description. */
  parentShortOid?: string
  open: boolean
  onClose: () => void
}

/**
 * The diff of a **merge** commit against one specific parent.
 *
 * A merge has one such reading per parent and no canonical one; the commit details panel always
 * shows the first, so parent 2 — everything the branch that received the merge had done on its own —
 * is otherwise unreachable in the app. `parentNumber` is 1-based for the user's sake and turns into
 * the backend's 0-based index here, in the one place that has to know the difference.
 */
export function CompareToParentDialog({
  repoPath,
  oid,
  shortOid,
  parentNumber,
  parentShortOid,
  open,
  onClose,
}: CompareToParentDialogProps) {
  const { t } = useTranslation('git')

  const { data: diff, isLoading } = useQuery({
    queryKey: ['compare-commit-parent', repoPath, oid, parentNumber],
    queryFn: () => apiGetCommitDiff(repoPath, oid, parentNumber - 1),
    enabled: open,
  })

  function handleOpenChange(next: boolean) {
    if (!next) onClose()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="flex max-h-[80vh] max-w-3xl flex-col"
        data-testid="compare-parent-dialog"
      >
        <DialogHeader>
          <DialogTitle>
            {t('gitTree.contextMenu.compareToParent', { parent: parentNumber })}
          </DialogTitle>
          <DialogDescription>
            {t('gitTree.compareParent.description', {
              sha: shortOid,
              parent: parentNumber,
              parentSha: parentShortOid ?? '',
            })}
          </DialogDescription>
        </DialogHeader>

        <DiffFilesPanel
          diff={diff}
          isLoading={isLoading}
          emptyMessage={t('gitTree.compareParent.noDifferences')}
        />
      </DialogContent>
    </Dialog>
  )
}
