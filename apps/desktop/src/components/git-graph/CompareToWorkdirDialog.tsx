import { useQuery } from '@tanstack/react-query'
import { useTranslation } from '@git-manager/i18n'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@git-manager/ui'
import { apiCompareCommitToWorkdir } from '../../api/git.api'
import { DiffFilesPanel } from './components/DiffFilesPanel'

interface CompareToWorkdirDialogProps {
  repoPath: string
  oid: string
  shortOid: string
  open: boolean
  onClose: () => void
}

/** Compares a commit's tree with the current working directory (not the index). */
export function CompareToWorkdirDialog({
  repoPath,
  oid,
  shortOid,
  open,
  onClose,
}: CompareToWorkdirDialogProps) {
  const { t } = useTranslation('git')

  const { data: diff, isLoading } = useQuery({
    queryKey: ['compare-commit-workdir', repoPath, oid],
    queryFn: () => apiCompareCommitToWorkdir(repoPath, oid),
    enabled: open,
  })

  function handleOpenChange(next: boolean) {
    if (!next) onClose()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="flex max-h-[80vh] max-w-3xl flex-col"
        data-testid="compare-workdir-dialog"
      >
        <DialogHeader>
          <DialogTitle>{t('gitTree.contextMenu.compareToWorkdir')}</DialogTitle>
          <DialogDescription>{t('gitTree.createBranch.from', { sha: shortOid })}</DialogDescription>
        </DialogHeader>

        <DiffFilesPanel
          diff={diff}
          isLoading={isLoading}
          emptyMessage={t('gitTree.contextMenu.noDifferences')}
        />
      </DialogContent>
    </Dialog>
  )
}
