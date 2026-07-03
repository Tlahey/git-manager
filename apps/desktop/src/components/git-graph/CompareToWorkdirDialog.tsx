import { useQuery } from '@tanstack/react-query'
import { useTranslation } from '@git-manager/i18n'
import { ScrollArea, Spinner } from '@git-manager/ui'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@git-manager/ui'
import { apiCompareCommitToWorkdir } from '../../api/git.api'
import { DiffViewer } from './DiffViewer'

interface CompareToWorkdirDialogProps {
  repoPath: string
  oid: string
  shortOid: string
  open: boolean
  onClose: () => void
}

/** Compare l'arbre d'un commit avec le répertoire de travail actuel (pas l'index). */
export function CompareToWorkdirDialog({ repoPath, oid, shortOid, open, onClose }: CompareToWorkdirDialogProps) {
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
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{t('gitTree.contextMenu.compareToWorkdir')}</DialogTitle>
          <DialogDescription>{t('gitTree.createBranch.from', { sha: shortOid })}</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner className="h-5 w-5" />
          </div>
        ) : (
          <ScrollArea className="flex-1 min-h-0">
            <div className="space-y-3 pr-3">
              {diff?.files.length ? (
                diff.files.map((file, i) => <DiffViewer key={i} file={file} />)
              ) : (
                <p className="text-xs text-muted-foreground">{t('gitTree.contextMenu.noDifferences')}</p>
              )}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  )
}
