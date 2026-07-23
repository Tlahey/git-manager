import { useState, useMemo, useCallback, type ReactNode } from 'react'
import { GitMerge, UserPlus, AlertTriangle, Eye, PencilRuler, Pin } from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import type { TagTone } from '@git-manager/ui'

import { Toolbar } from './Toolbar'
import { TableHeader, GroupHeader, LoadMore, usePRSort, useSetFilter } from './ListHelpers'
import { PRRowSkeleton } from './RowSkeletons'
import { PRRow } from './PRRow'
import type { MockPR, SortKey, SortDir } from '../types'

const PAGE_SIZE = 20

type BucketKey = 'ready' | 'unassigned' | 'conflicts' | 'needsReview' | 'draft'

/**
 * Bucket a (non-pinned, still-open) PR by the next action it needs. Priority order matters: a draft
 * with conflicts is a draft first; conflicts outrank a pending review; an approved, mergeable PR is
 * "ready"; anything else is still waiting on reviewers.
 */
function bucketOf(pr: MockPR): BucketKey {
  if (pr.isDraft) return 'draft'
  if (pr.needsRebase) return 'conflicts'
  if (pr.needsMyReview) return 'needsReview'
  if (pr.reviewStatus === 'approved' || pr.status === 'approved') return 'ready'
  return 'unassigned'
}

interface PullRequestsTabProps {
  allPRs: MockPR[]
  pinnedIds: Set<string>
  onTogglePin: (id: string) => void
  loading: boolean
}

export function PullRequestsTab({ allPRs, pinnedIds, onTogglePin, loading }: PullRequestsTabProps) {
  const { t } = useTranslation('launchpad')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [statusFilter, toggleStatus, clearStatus] = useSetFilter()
  const [repoFilter, toggleRepo, clearRepo] = useSetFilter()
  const [authorFilter, toggleAuthor, clearAuthor] = useSetFilter()
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
  const [shown, setShown] = useState<Record<string, number>>({})

  const isOpen = (k: string) => openGroups[k] !== false
  const toggleGroup = (k: string) => setOpenGroups((p) => ({ ...p, [k]: !(p[k] !== false) }))
  const shownFor = (k: string) => shown[k] ?? PAGE_SIZE
  const loadMore = (k: string) => setShown((p) => ({ ...p, [k]: (p[k] ?? PAGE_SIZE) + PAGE_SIZE }))

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

  const repos = useMemo(() => [...new Set(allPRs.map((p) => p.repo))].sort(), [allPRs])
  const statuses = useMemo(() => [...new Set(allPRs.map((p) => p.status))].sort(), [allPRs])
  const authors = useMemo(() => [...new Set(allPRs.map((p) => p.author))].sort(), [allPRs])

  const filtered = useMemo(() => {
    return allPRs.filter((pr) => {
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
    })
  }, [allPRs, search, statusFilter, repoFilter, authorFilter])

  const pinnedPRs = usePRSort(
    useMemo(() => filtered.filter((pr) => pinnedIds.has(pr.id)), [filtered, pinnedIds]),
    sortKey,
    sortDir
  )

  // Non-pinned, still-open PRs bucketed by needed action (merged/closed drop out of this view).
  const grouped = useMemo(() => {
    const g: Record<BucketKey, MockPR[]> = {
      ready: [],
      unassigned: [],
      conflicts: [],
      needsReview: [],
      draft: [],
    }
    for (const pr of filtered) {
      if (pinnedIds.has(pr.id) || pr.status === 'merged' || pr.status === 'closed') continue
      g[bucketOf(pr)].push(pr)
    }
    return g
  }, [filtered, pinnedIds])

  const readySorted = usePRSort(grouped.ready, sortKey, sortDir)
  const unassignedSorted = usePRSort(grouped.unassigned, sortKey, sortDir)
  const conflictsSorted = usePRSort(grouped.conflicts, sortKey, sortDir)
  const needsReviewSorted = usePRSort(grouped.needsReview, sortKey, sortDir)
  const draftSorted = usePRSort(grouped.draft, sortKey, sortDir)

  const buckets: {
    key: BucketKey
    label: string
    icon: ReactNode
    iconClassName: string
    tone: TagTone
    items: MockPR[]
  }[] = [
    {
      key: 'ready',
      label: t('group.readyToMerge'),
      icon: <GitMerge className="h-3 w-3" />,
      iconClassName: 'text-green-400',
      tone: 'success',
      items: readySorted,
    },
    {
      key: 'unassigned',
      label: t('group.unassignedReviewers'),
      icon: <UserPlus className="h-3 w-3" />,
      iconClassName: 'text-blue-400',
      tone: 'info',
      items: unassignedSorted,
    },
    {
      key: 'conflicts',
      label: t('group.resolveConflicts'),
      icon: <AlertTriangle className="h-3 w-3" />,
      iconClassName: 'text-red-400',
      tone: 'danger',
      items: conflictsSorted,
    },
    {
      key: 'needsReview',
      label: t('group.needsReview'),
      icon: <Eye className="h-3 w-3" />,
      iconClassName: 'text-orange-400',
      tone: 'warning',
      items: needsReviewSorted,
    },
    {
      key: 'draft',
      label: t('group.draft'),
      icon: <PencilRuler className="h-3 w-3" />,
      iconClassName: 'text-muted-foreground',
      tone: 'neutral',
      items: draftSorted,
    },
  ]

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
        ) : (
          <>
            {pinnedPRs.length > 0 && (
              <>
                <GroupHeader
                  label={t('group.pinned')}
                  count={pinnedPRs.length}
                  open={isOpen('pinned')}
                  onToggle={() => toggleGroup('pinned')}
                  icon={<Pin className="h-3 w-3" />}
                  iconClassName="text-amber-400"
                  tone="warning"
                />
                {isOpen('pinned') &&
                  pinnedPRs.map((pr) => (
                    <PRRow key={pr.id} pr={pr} pinned onTogglePin={onTogglePin} />
                  ))}
              </>
            )}
            {buckets.map((b) => (
              <div key={b.key}>
                <GroupHeader
                  label={b.label}
                  count={b.items.length}
                  open={isOpen(b.key)}
                  onToggle={() => toggleGroup(b.key)}
                  icon={b.icon}
                  iconClassName={b.iconClassName}
                  tone={b.tone}
                />
                {isOpen(b.key) && (
                  <>
                    {b.items.slice(0, shownFor(b.key)).map((pr) => (
                      <PRRow key={pr.id} pr={pr} pinned={false} onTogglePin={onTogglePin} />
                    ))}
                    <LoadMore
                      total={b.items.length}
                      shown={shownFor(b.key)}
                      onLoadMore={() => loadMore(b.key)}
                    />
                  </>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
