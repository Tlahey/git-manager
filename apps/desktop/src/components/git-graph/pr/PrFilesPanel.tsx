import { useMemo } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Spinner } from '@git-manager/ui'
import { useRepoUIStore } from '../../../stores/repoUI.store'
import { usePrFiles } from '../../../hooks/usePrFiles'
import { CommitFileList, type ProcessedFileItem } from '../components/CommitFileList'

interface PrFilesPanelProps {
  repoPath: string
  prNumber: number
}

/** Map a GitHub PR file status to the app's `ProcessedFileItem` status vocabulary. */
function mapStatus(status: string): ProcessedFileItem['status'] {
  switch (status) {
    case 'added':
    case 'copied':
      return 'added'
    case 'removed':
      return 'deleted'
    case 'renamed':
      return 'renamed'
    default:
      return 'modified'
  }
}

/** The always-visible right panel while a PR is open: only the PR's changed files, rendered with the
 * shared list/tree file browser ({@link CommitFileList}, read-only). Clicking a file opens its diff
 * in the center panel via `activePrFile`. PR metadata lives in the center content, not here. */
export function PrFilesPanel({ repoPath, prNumber }: PrFilesPanelProps) {
  const { t } = useTranslation('git')
  const { files, isLoading } = usePrFiles(repoPath, prNumber)
  const setActivePrFile = useRepoUIStore((s) => s.setActivePrFile)

  const processedFiles = useMemo<ProcessedFileItem[]>(
    () =>
      files.map((f) => ({
        path: f.filename,
        status: mapStatus(f.status),
        additions: f.additions,
        deletions: f.deletions,
        staged: false,
      })),
    [files]
  )

  return (
    <div data-testid="pr-files-panel" className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-2">
        {isLoading && files.length === 0 ? (
          <div className="flex items-center gap-2 p-2">
            <Spinner className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{t('pr.view.loading')}</span>
          </div>
        ) : (
          <CommitFileList
            repoPath={repoPath}
            isWip={false}
            commitOid={`pr-${prNumber}`}
            cacheKey={`pr:${repoPath}:${prNumber}`}
            processedFiles={processedFiles}
            title={t('pr.view.filesChanged')}
            emptyMessage={t('pr.view.filesEmpty')}
            onSelectFileDiff={(file) => setActivePrFile(file.path)}
          />
        )}
      </div>
    </div>
  )
}
