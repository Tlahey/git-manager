import { useMemo } from 'react'
import { BellOff, GitPullRequest } from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import { EmptyState, NoResults } from '@git-manager/components'
import { Toolbar } from './Toolbar'
import { TableHeader } from './ListHelpers'
import { usePRSort } from '../hooks/listHooks'
import { useListToolbar } from '../hooks/useListToolbar'
import { PRRowSkeleton } from './RowSkeletons'
import { PRRow } from './PRRow'
import { useLaunchpadStore } from '../stores/launchpad.store'
import { timeUntil } from '../lib/launchpadUtils'
import type { MockPR } from '../../../lib/github/types'

interface SnoozedPRsTabProps {
  snoozedPRs: MockPR[]
  pinnedIds: Set<string>
  onTogglePin: (id: string) => void
  loading: boolean
}

/** The Snoozed tab: PRs hidden from the other lists until their wake time. Same search/filter/sort
 * toolbar as the other PR tabs; each row shows how long it stays snoozed, and the row's own snooze
 * control (left edge) brings it back now. */
export function SnoozedPRsTab({ snoozedPRs, pinnedIds, onTogglePin, loading }: SnoozedPRsTabProps) {
  const { t } = useTranslation('launchpad')
  const snoozed = useLaunchpadStore((s) => s.snoozed)

  const repos = useMemo(() => [...new Set(snoozedPRs.map((p) => p.repo))].sort(), [snoozedPRs])
  const statuses = useMemo(() => [...new Set(snoozedPRs.map((p) => p.status))].sort(), [snoozedPRs])
  const authors = useMemo(() => [...new Set(snoozedPRs.map((p) => p.author))].sort(), [snoozedPRs])

  const { search, sortKey, sortDir, statusFilter, repoFilter, authorFilter, toolbarProps } =
    useListToolbar({ repos, statuses, authors })

  const filtered = useMemo(
    () =>
      snoozedPRs.filter((pr) => {
        if (statusFilter.size > 0 && !statusFilter.has(pr.status)) return false
        if (repoFilter.size > 0 && !repoFilter.has(pr.repo)) return false
        if (authorFilter.size > 0 && !authorFilter.has(pr.author)) return false
        if (search) {
          const q = search.toLowerCase()
          return (
            pr.title.toLowerCase().includes(q) ||
            pr.author.toLowerCase().includes(q) ||
            pr.repo.toLowerCase().includes(q) ||
            String(pr.number).includes(q)
          )
        }
        return true
      }),
    [snoozedPRs, search, statusFilter, repoFilter, authorFilter]
  )

  const sortedPRs = usePRSort(filtered, sortKey, sortDir)

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Toolbar {...toolbarProps} />

      <TableHeader />

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <>
            <PRRowSkeleton />
            <PRRowSkeleton />
          </>
        ) : snoozedPRs.length === 0 ? (
          <EmptyState
            icon={<BellOff className="h-6 w-6 text-primary" />}
            title={t('snooze.emptyTitle')}
            description={t('snooze.emptyDesc')}
          />
        ) : sortedPRs.length === 0 ? (
          <NoResults
            icon={<GitPullRequest className="h-6 w-6 opacity-30" />}
            message={t('followed.noMatch')}
          />
        ) : (
          sortedPRs.map((pr) => {
            const until = snoozed[pr.id] ?? null
            const remaining = timeUntil(until)
            return (
              <div key={pr.id} className="group/snoozed relative">
                <PRRow pr={pr} pinned={pinnedIds.has(pr.id)} onTogglePin={onTogglePin} />
                <div className="pointer-events-none absolute top-1/2 right-[150px] flex -translate-y-1/2 items-center gap-1.5">
                  <span
                    className="rounded border border-border/50 bg-muted/60 px-1.5 py-px text-[10px] text-muted-foreground"
                    data-testid={`snoozed-until-${pr.id}`}
                  >
                    {remaining
                      ? t('snooze.snoozedFor', { time: remaining })
                      : t('snooze.snoozedIndefinitely')}
                  </span>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
