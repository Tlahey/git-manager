import { useTranslation } from '@git-manager/i18n'
import { Button } from '@git-manager/ui'
import { Bug, Check, X, SkipForward, Ban } from 'lucide-react'
import { useBisectState } from '../../hooks/useBisectState'
import { useBisectActions } from '../../hooks/useBisectActions'

interface BisectBannerProps {
  repoPath: string
}

/**
 * Top banner shown while a bisect search is in progress: it names the commit currently under test,
 * the remaining progress, and carries the step-validation buttons (good / bad / skip / abort).
 * Hides itself once the search resolves — the {@link BisectResultBanner} at the bottom takes over.
 */
export function BisectBanner({ repoPath }: BisectBannerProps) {
  const { t } = useTranslation('git')
  const { data: bisect } = useBisectState(repoPath)
  const { mark, reset, pending } = useBisectActions(repoPath)

  if (!bisect?.active || bisect.firstBadOid) return null

  const shortOid = bisect.currentOid?.slice(0, 7)
  const summary = bisect.currentSummary ?? ''

  return (
    <div
      data-testid="bisect-banner"
      className="flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-3 py-1.5"
    >
      <Bug className="h-3.5 w-3.5 shrink-0 text-amber-500" />
      <div className="flex min-w-0 flex-1 items-center gap-1.5 text-xs">
        <span className="font-medium text-amber-600 dark:text-amber-400">
          {t('bisect.banner.title')}
        </span>
        {shortOid && (
          <span className="min-w-0 truncate text-amber-600/80 dark:text-amber-400/80">
            {t('bisect.banner.testing', { sha: shortOid })}
            {summary ? ` — ${summary}` : ''}
          </span>
        )}
        {bisect.stepsRemaining != null && (
          <span className="shrink-0 whitespace-nowrap text-amber-600/70 dark:text-amber-400/70">
            {t('bisect.banner.progress', {
              steps: bisect.stepsRemaining,
              revs: bisect.revsRemaining ?? 0,
            })}
          </span>
        )}
      </div>

      <Button
        size="sm"
        className="h-6 gap-1 bg-green-600 px-2 text-xs text-white hover:bg-green-700"
        disabled={pending}
        onClick={() => mark('good')}
        data-testid="bisect-good-button"
      >
        <Check className="h-3.5 w-3.5" />
        {t('bisect.actions.good')}
      </Button>
      <Button
        size="sm"
        className="h-6 gap-1 bg-red-600 px-2 text-xs text-white hover:bg-red-700"
        disabled={pending}
        onClick={() => mark('bad')}
        data-testid="bisect-bad-button"
      >
        <X className="h-3.5 w-3.5" />
        {t('bisect.actions.bad')}
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-6 gap-1 border-amber-500/40 px-2 text-xs text-amber-600 hover:bg-amber-500/20 dark:text-amber-400"
        disabled={pending}
        onClick={() => mark('skip')}
        data-testid="bisect-skip-button"
      >
        <SkipForward className="h-3.5 w-3.5" />
        {t('bisect.actions.skip')}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-6 gap-1 px-2 text-xs text-destructive hover:bg-destructive/10"
        disabled={pending}
        onClick={reset}
        data-testid="bisect-abort-button"
      >
        <Ban className="h-3.5 w-3.5" />
        {t('bisect.actions.abort')}
      </Button>
    </div>
  )
}
