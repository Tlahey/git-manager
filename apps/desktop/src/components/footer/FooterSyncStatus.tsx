import { ArrowDown, ArrowUp, CloudOff } from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import { Tooltip } from '@git-manager/ui'
import { useBranches } from '../../hooks/useBranches'

interface FooterSyncStatusProps {
  repoPath: string
}

/**
 * Commits to pull (↓) and to push (↑) for the checked-out branch against its upstream — the same
 * counts as the toolbar's Pull/Push badges, kept on screen whichever view the tab shows.
 */
export function FooterSyncStatus({ repoPath }: FooterSyncStatusProps) {
  const { t } = useTranslation('common')
  const { data: branches } = useBranches(repoPath)
  const head = branches?.find((b) => b.isHead && !b.isRemote)
  if (!head) return null

  // Without an upstream libgit2 has nothing to count against, so "0 / 0" would be a lie.
  if (!head.upstream) {
    return (
      <Tooltip content={t('footer.sync.noUpstreamTitle')}>
        <span
          data-testid="footer-sync-no-upstream"
          className="flex items-center gap-1 text-muted-foreground"
        >
          <CloudOff className="h-3.5 w-3.5" aria-hidden />
          <span>{t('footer.sync.noUpstream')}</span>
        </span>
      </Tooltip>
    )
  }

  const pullLabel = t('git:remote.commitsToPull', { count: head.behindCount })
  const pushLabel = t('git:remote.commitsToPush', { count: head.aheadCount })

  return (
    <div data-testid="footer-sync-status" className="flex items-center gap-2 font-mono">
      <Tooltip content={pullLabel}>
        <span
          data-testid="footer-sync-behind"
          className={`flex items-center gap-0.5 ${
            head.behindCount > 0 ? 'font-semibold text-foreground' : 'text-muted-foreground'
          }`}
        >
          <ArrowDown
            className={`h-3.5 w-3.5 ${head.behindCount > 0 ? 'text-amber-500' : ''}`}
            aria-hidden
          />
          <span aria-hidden>{head.behindCount}</span>
          <span className="sr-only">{pullLabel}</span>
        </span>
      </Tooltip>
      <Tooltip content={pushLabel}>
        <span
          data-testid="footer-sync-ahead"
          className={`flex items-center gap-0.5 ${
            head.aheadCount > 0 ? 'font-semibold text-foreground' : 'text-muted-foreground'
          }`}
        >
          <ArrowUp
            className={`h-3.5 w-3.5 ${head.aheadCount > 0 ? 'text-emerald-500' : ''}`}
            aria-hidden
          />
          <span aria-hidden>{head.aheadCount}</span>
          <span className="sr-only">{pushLabel}</span>
        </span>
      </Tooltip>
    </div>
  )
}
