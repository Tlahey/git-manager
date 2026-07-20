import { useState, useMemo } from 'react'
import { CheckSquare } from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import { Toolbar } from './Toolbar'
import { TableHeader, LoadMore, useSetFilter } from './ListHelpers'
import { PRRowSkeleton } from './RowSkeletons'
import { PRRow } from './PRRow'
import type { MockPR, SortKey, SortDir } from '../types'

const PAGE_SIZE = 20

interface WaitingForReviewTabProps {
  allPRs: MockPR[]
  pinnedIds: Set<string>
  onTogglePin: (id: string) => void
  loading: boolean
}

export function WaitingForReviewTab({
  allPRs,
  pinnedIds,
  onTogglePin,
  loading,
}: WaitingForReviewTabProps) {
  const { t } = useTranslation('launchpad')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [statusFilter, toggleStatus, clearStatus] = useSetFilter()
  const [repoFilter, toggleRepo, clearRepo] = useSetFilter()
  const [authorFilter, toggleAuthor, clearAuthor] = useSetFilter()
  const [shown, setShown] = useState(PAGE_SIZE)

  const repos = useMemo(() => [...new Set(allPRs.map((p) => p.repo))].sort(), [allPRs])
  const statuses = useMemo(() => [...new Set(allPRs.map((p) => p.status))].sort(), [allPRs])
  const authors = useMemo(() => [...new Set(allPRs.map((p) => p.author))].sort(), [allPRs])

  function handleSort(k: SortKey) {
    if (k === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(k)
      setSortDir('desc')
    }
  }

  const waitingPRs = useMemo(() => {
    return allPRs
      .filter((pr) => pr.needsMyReview)
      .filter((pr) => {
        if (statusFilter.size > 0 && !statusFilter.has(pr.status)) return false
        if (repoFilter.size > 0 && !repoFilter.has(pr.repo)) return false
        if (authorFilter.size > 0 && !authorFilter.has(pr.author)) return false
        if (search) {
          const q = search.toLowerCase()
          return (
            pr.title.toLowerCase().includes(q) ||
            pr.author.toLowerCase().includes(q) ||
            pr.repo.toLowerCase().includes(q)
          )
        }
        return true
      })
      .sort((a, b) => {
        let cmp = 0
        if (sortKey === 'date') cmp = a.updatedAt.getTime() - b.updatedAt.getTime()
        else if (sortKey === 'author') cmp = a.author.localeCompare(b.author)
        else if (sortKey === 'repo') cmp = a.repo.localeCompare(b.repo)
        return sortDir === 'desc' ? -cmp : cmp
      })
  }, [allPRs, search, statusFilter, repoFilter, authorFilter, sortKey, sortDir])

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
            <PRRowSkeleton />
            <PRRowSkeleton />
          </>
        ) : waitingPRs.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground/50">
            <CheckSquare className="h-6 w-6 opacity-30" />
            <p className="text-xs">{t('waiting.allCaughtUp')}</p>
          </div>
        ) : (
          <>
            {waitingPRs.slice(0, shown).map((pr) => (
              <PRRow key={pr.id} pr={pr} pinned={pinnedIds.has(pr.id)} onTogglePin={onTogglePin} />
            ))}
            <LoadMore
              total={waitingPRs.length}
              shown={shown}
              onLoadMore={() => setShown((n) => n + PAGE_SIZE)}
            />
          </>
        )}
      </div>
    </div>
  )
}
