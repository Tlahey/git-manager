import { useTranslation } from '@git-manager/i18n'
import { Button } from '@git-manager/ui'
import { Crosshair, Eye, RotateCcw } from 'lucide-react'
import { useBisectState } from '../../hooks/useBisectState'
import { useBisectActions } from '../../hooks/useBisectActions'
import { useRepoUIStore } from '../../stores/repoUI.store'

interface BisectResultBannerProps {
  repoPath: string
}

/**
 * Bottom banner shown once a bisect search resolves: it names the first bad commit and offers to
 * select it in the graph (to inspect its diff) or end the session (`git bisect reset`).
 */
export function BisectResultBanner({ repoPath }: BisectResultBannerProps) {
  const { t } = useTranslation('git')
  const { data: bisect } = useBisectState(repoPath)
  const { reset, pending } = useBisectActions(repoPath)

  if (!bisect?.active || !bisect.firstBadOid) return null

  const shortOid = bisect.firstBadOid.slice(0, 7)
  const summary = bisect.firstBadSummary ?? ''

  return (
    <div
      data-testid="bisect-result-banner"
      className="flex items-center gap-2 border-t border-red-500/30 bg-red-500/10 px-3 py-1.5"
    >
      <Crosshair className="h-4 w-4 shrink-0 text-red-500" />
      <div className="flex min-w-0 flex-1 items-center gap-1.5 text-xs">
        <span className="font-medium text-red-600 dark:text-red-400">
          {t('bisect.result.title')}
        </span>
        <span className="min-w-0 truncate text-red-600/80 dark:text-red-400/80">
          <code className="font-mono">{shortOid}</code>
          {summary ? ` — ${summary}` : ''}
        </span>
      </div>

      <Button
        size="sm"
        variant="outline"
        className="h-6 gap-1 px-2 text-xs"
        onClick={() => useRepoUIStore.getState().setPendingGraphSelection(bisect.firstBadOid!)}
        data-testid="bisect-view-commit-button"
      >
        <Eye className="h-3.5 w-3.5" />
        {t('bisect.result.viewCommit')}
      </Button>
      <Button
        size="sm"
        className="h-6 gap-1 px-2 text-xs"
        disabled={pending}
        onClick={reset}
        data-testid="bisect-finish-button"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        {t('bisect.result.finish')}
      </Button>
    </div>
  )
}
