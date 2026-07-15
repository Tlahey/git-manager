import { useTranslation } from '@git-manager/i18n'
import { Spinner } from '@git-manager/ui'
import { ChevronLeft } from 'lucide-react'
import { usePrFiles } from '../../../hooks/usePrFiles'
import { PrFileDiff } from './PrFileDiff'

interface PrFileDiffCenterProps {
  repoPath: string
  prNumber: number
  filename: string
  /** Back to the PR detail view (clears the selected PR file). */
  onClose: () => void
}

/** Center-panel takeover showing one PR file's diff, reached by clicking a file in the side panel.
 * Keeps the PR's file list on the right; the back button returns to the PR detail view. */
export function PrFileDiffCenter({ repoPath, prNumber, filename, onClose }: PrFileDiffCenterProps) {
  const { t } = useTranslation('git')
  const { files, isLoading } = usePrFiles(repoPath, prNumber)
  const file = files.find((f) => f.filename === filename)

  return (
    <div data-testid="pr-file-diff-center" className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <button
          onClick={onClose}
          data-testid="pr-file-diff-back"
          className="flex items-center gap-1 rounded px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          {t('pr.diff.back')}
        </button>
        <span className="truncate font-mono text-xs text-foreground" title={filename}>
          {filename}
        </span>
        {file && (
          <span className="ml-auto shrink-0 font-mono text-[10px]">
            <span className="text-green-500">+{file.additions}</span>{' '}
            <span className="text-destructive">-{file.deletions}</span>
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && !file ? (
          <div className="flex items-center gap-2 p-4">
            <Spinner className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{t('pr.view.loading')}</span>
          </div>
        ) : !file ? (
          <p className="p-4 text-xs italic text-muted-foreground">{t('pr.diff.notFound')}</p>
        ) : (
          <PrFileDiff patch={file.patch} status={file.status} />
        )}
      </div>
    </div>
  )
}
