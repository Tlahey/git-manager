import { useState, useMemo, useCallback } from 'react'
import { BellOff, GitPullRequest } from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import { Toolbar } from './Toolbar'
import { TableHeader, usePRSort, useSetFilter } from './ListHelpers'
import { PRRowSkeleton } from './RowSkeletons'
import { PRRow } from './PRRow'
import { useLaunchpadStore } from '../../../stores/launchpad.store'
import { timeUntil } from '../utils'
import type { MockPR, SortKey, SortDir } from '../types'

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

  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [statusFilter, toggleStatus, clearStatus] = useSetFilter()
  const [repoFilter, toggleRepo, clearRepo] = useSetFilter()
  const [authorFilter, toggleAuthor, clearAuthor] = useSetFilter()

  const handleSort = useCallback((k: SortKey) => {
    setSortKey((prevKey) => {
      if (k === prevKey) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
        return prevKey
      }
      setSortDir('desc')
      return k
    })
  }, [])

  const repos = useMemo(() => [...new Set(snoozedPRs.map((p) => p.repo))].sort(), [snoozedPRs])
  const statuses = useMemo(() => [...new Set(snoozedPRs.map((p) => p.status))].sort(), [snoozedPRs])
  const authors = useMemo(() => [...new Set(snoozedPRs.map((p) => p.author))].sort(), [snoozedPRs])

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
      <Toolbar
        search={search}
        onSearch={setSearch}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={handleSort}
        statusFilter={statusFilter}
        onToggleStatus={toggleStatus}
        onClearStatus={clearStatus}
        repoFilter={repoFilter}
        onToggleRepo={toggleRepo}
        onClearRepo={clearRepo}
        authorFilter={authorFilter}
        onToggleAuthor={toggleAuthor}
        onClearAuthor={clearAuthor}
        repos={repos}
        statuses={statuses}
        authors={authors}
      />

      <TableHeader />

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <>
            <PRRowSkeleton />
            <PRRowSkeleton />
          </>
        ) : snoozedPRs.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/10 bg-primary/5">
              <BellOff className="h-6 w-6 text-primary" />
            </div>
            <h3 className="mb-1 text-sm font-semibold text-foreground">{t('snooze.emptyTitle')}</h3>
            <p className="max-w-[280px] text-xs text-muted-foreground">{t('snooze.emptyDesc')}</p>
          </div>
        ) : sortedPRs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground/50">
            <GitPullRequest className="mb-2 h-6 w-6 opacity-30" />
            <p className="text-xs">{t('followed.noMatch')}</p>
          </div>
        ) : (
          sortedPRs.map((pr) => {
            const until = snoozed[pr.id] ?? null
            const remaining = timeUntil(until)
            return (
              <div key={pr.id} className="group/snoozed relative">
                <PRRow pr={pr} pinned={pinnedIds.has(pr.id)} onTogglePin={onTogglePin} />
                <div className="pointer-events-none absolute right-[150px] top-1/2 flex -translate-y-1/2 items-center gap-1.5">
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
