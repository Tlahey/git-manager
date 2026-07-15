import type { ReactNode } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Spinner } from '@git-manager/ui'
import { usePrFiles } from '../../../hooks/usePrFiles'

interface PrFilesListProps {
  repoPath: string
  prNumber: number
  /** Rendered on the "Files changed" header row (e.g. the "Submit a review" toggle). */
  headerAction?: ReactNode
}

/** Status letter + color for a GitHub PR file status word. */
function statusBadge(status: string): { letter: string; className: string } {
  switch (status) {
    case 'added':
      return { letter: 'A', className: 'text-green-500' }
    case 'removed':
      return { letter: 'D', className: 'text-destructive' }
    case 'renamed':
      return { letter: 'R', className: 'text-blue-500' }
    case 'copied':
      return { letter: 'C', className: 'text-blue-500' }
    default:
      return { letter: 'M', className: 'text-amber-500' }
  }
}

/** The "Files changed" block of the PR side panel: a count header (with an optional action slot) and
 * one row per changed file. A plain block — the side panel owns the scroll. */
export function PrFilesList({ repoPath, prNumber, headerAction }: PrFilesListProps) {
  const { t } = useTranslation('git')
  const { files, isLoading } = usePrFiles(repoPath, prNumber)

  return (
    <section data-testid="pr-files-list" className="border-b border-border">
      <div className="flex items-center gap-2 px-3 py-2">
        <h2 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {t('pr.view.filesChanged')}
        </h2>
        <span className="text-[11px] text-muted-foreground" data-testid="pr-files-count">
          {files.length}
        </span>
        {isLoading && <Spinner className="h-3 w-3 text-muted-foreground" />}
        {headerAction && <div className="ml-auto">{headerAction}</div>}
      </div>

      {!isLoading && files.length === 0 ? (
        <p className="px-3 pb-2 text-xs italic text-muted-foreground">{t('pr.view.filesEmpty')}</p>
      ) : (
        <ul className="pb-1">
          {files.map((f) => {
            const badge = statusBadge(f.status)
            return (
              <li
                key={f.filename}
                data-testid={`pr-file-${f.filename}`}
                className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent"
              >
                <span className={`w-3 shrink-0 font-mono font-bold ${badge.className}`}>
                  {badge.letter}
                </span>
                <span className="truncate text-foreground" title={f.filename}>
                  {f.filename}
                </span>
                <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
                  <span className="text-green-500">+{f.additions}</span>{' '}
                  <span className="text-destructive">-{f.deletions}</span>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
