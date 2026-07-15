import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Spinner, cn } from '@git-manager/ui'
import { CodeEditor } from '@git-manager/editor'
import { ChevronLeft, FileText, GitCompare } from 'lucide-react'
import { usePrFileContents } from '../../../hooks/usePrFileContents'
import { ThreeWayMergeEditor } from '../../merge-editor/ThreeWayMergeEditor'

interface PrFileDiffCenterProps {
  repoPath: string
  prNumber: number
  filename: string
  /** Back to the PR detail view (clears the selected PR file). */
  onClose: () => void
}

/** Center-panel takeover showing one PR file — the same Monaco diff/file view as a commit file
 * (collapsible unchanged regions, syntax highlighting, a diff ⇄ file toggle). The two versions are
 * fetched from GitHub ({@link usePrFileContents}). The PR's file list stays on the right. */
export function PrFileDiffCenter({ repoPath, prNumber, filename, onClose }: PrFileDiffCenterProps) {
  const { t } = useTranslation('git')
  const [tab, setTab] = useState<'diff' | 'file'>('diff')
  const { file, original, modified, isBinary, isLoading } = usePrFileContents(
    repoPath,
    prNumber,
    filename
  )

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
          <span className="shrink-0 font-mono text-[10px]">
            <span className="text-green-500">+{file.additions}</span>{' '}
            <span className="text-destructive">-{file.deletions}</span>
          </span>
        )}

        <div className="ml-auto flex shrink-0 items-center overflow-hidden rounded border border-border">
          <button
            onClick={() => setTab('diff')}
            data-testid="pr-file-diff-tab-diff"
            className={cn(
              'flex items-center gap-1 px-2 py-1 text-[11px] transition-colors',
              tab === 'diff' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
            )}
          >
            <GitCompare className="h-3 w-3" />
            {t('pr.diff.viewDiff')}
          </button>
          <button
            onClick={() => setTab('file')}
            data-testid="pr-file-diff-tab-file"
            className={cn(
              'flex items-center gap-1 px-2 py-1 text-[11px] transition-colors',
              tab === 'file' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
            )}
          >
            <FileText className="h-3 w-3" />
            {t('pr.diff.viewFile')}
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {isLoading ? (
          <div className="flex items-center gap-2 p-4">
            <Spinner className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{t('pr.view.loading')}</span>
          </div>
        ) : !file ? (
          <p className="p-4 text-xs italic text-muted-foreground">{t('pr.diff.notFound')}</p>
        ) : isBinary ? (
          <p data-testid="pr-file-diff-binary" className="p-4 text-xs italic text-muted-foreground">
            {t('pr.diff.binary')}
          </p>
        ) : tab === 'file' ? (
          <CodeEditor content={modified || original} filePath={filename} />
        ) : (
          <ThreeWayMergeEditor
            repoPath={repoPath}
            filePath={filename}
            original={original}
            modified={modified}
            isTwoWay
          />
        )}
      </div>
    </div>
  )
}
