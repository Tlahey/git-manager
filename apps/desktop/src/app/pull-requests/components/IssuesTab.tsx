import { useState, useMemo } from 'react'
import { AlertCircle, User } from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import { Toolbar } from './Toolbar'
import { IssueRowSkeleton } from './RowSkeletons'
import { IssueRow } from './IssueRow'
import { InfiniteScrollSentinel, useSetFilter } from './ListHelpers'
import { useLaunchpadControlsStore } from '../../../stores/launchpadControls.store'
import { isMyIssue } from '../utils'
import type { MockIssue, SortKey, SortDir } from '../types'

/** Free-text match for an issue (title/author/repo/number). Empty query matches everything. */
function matchesIssueSearch(issue: MockIssue, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return (
    issue.title.toLowerCase().includes(q) ||
    issue.author.toLowerCase().includes(q) ||
    issue.repo.toLowerCase().includes(q) ||
    String(issue.number).includes(q)
  )
}

/** Rows shown before any lazy-load, and how many more each time the bottom sentinel is reached. */
const INITIAL_SHOWN = 50
const LOAD_STEP = 25

/**
 * Issues only ever have these two states, so the Status filter always offers both — even when the
 * current list happens to contain only one of them. The tab defaults to `open` (see `statusFilter`
 * below) so it matches the "open issues" count in the KPI bar / tab badge; closed issues stay
 * reachable by toggling `closed` here rather than living in a separate tab.
 */
const ISSUE_STATUSES = ['closed', 'open']

interface IssuesTabProps {
  allIssues: MockIssue[]
  loading: boolean
  /** Signed-in GitHub login, used by the default "Mine" filter. `null` in demo/signed-out mode,
   * where the filter is hidden and every fetched issue is shown. */
  currentUser: string | null
  pinnedIds: Set<string>
  onTogglePin: (id: string) => void
  /** Revalidate the issues list after a row mutation (e.g. an issue is closed). */
  onIssueChanged?: () => void
}

export function IssuesTab({
  allIssues,
  loading,
  currentUser,
  pinnedIds,
  onTogglePin,
  onIssueChanged,
}: IssuesTabProps) {
  const { t } = useTranslation('launchpad')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [statusFilter, toggleStatus, clearStatus] = useSetFilter(['open'])
  const [repoFilter, toggleRepo, clearRepo] = useSetFilter()
  const [authorFilter, toggleAuthor, clearAuthor] = useSetFilter()
  // We fetch every issue in the added repos, but default to showing only the user's own — cleared
  // via the toolbar toggle to browse all of a project's issues. No user (demo) => no filter.
  const [mineOnly, setMineOnly] = useState(true)
  const [shown, setShown] = useState(INITIAL_SHOWN)
  const globalSearch = useLaunchpadControlsStore((s) => s.search)

  const repos = useMemo(() => [...new Set(allIssues.map((i) => i.repo))].sort(), [allIssues])
  const authors = useMemo(() => [...new Set(allIssues.map((i) => i.author))].sort(), [allIssues])

  function handleSort(k: SortKey) {
    if (k === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(k)
      setSortDir('desc')
    }
  }

  const filtered = useMemo(() => {
    return allIssues
      .filter((issue) => {
        if (mineOnly && currentUser && !isMyIssue(issue, currentUser)) return false
        if (statusFilter.size > 0 && !statusFilter.has(issue.status)) return false
        if (repoFilter.size > 0 && !repoFilter.has(issue.repo)) return false
        if (authorFilter.size > 0 && !authorFilter.has(issue.author)) return false
        return matchesIssueSearch(issue, search) && matchesIssueSearch(issue, globalSearch)
      })
      .sort((a, b) => {
        let cmp = 0
        if (sortKey === 'date') cmp = a.updatedAt.getTime() - b.updatedAt.getTime()
        else if (sortKey === 'author') cmp = a.author.localeCompare(b.author)
        else if (sortKey === 'repo') cmp = a.repo.localeCompare(b.repo)
        else if (sortKey === 'status') cmp = a.status.localeCompare(b.status)
        return sortDir === 'desc' ? -cmp : cmp
      })
  }, [
    allIssues,
    search,
    globalSearch,
    mineOnly,
    currentUser,
    statusFilter,
    repoFilter,
    authorFilter,
    sortKey,
    sortDir,
  ])

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
        statuses={ISSUE_STATUSES}
        authors={authors}
      >
        {currentUser && (
          <button
            onClick={() => setMineOnly((v) => !v)}
            data-testid="issues-mine-toggle"
            aria-pressed={mineOnly}
            className={`flex h-7 items-center gap-1 rounded border px-2 text-[10px] transition-colors ${
              mineOnly
                ? 'border-primary/30 bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            <User className="h-3 w-3" /> {t('issues.mineOnly')}
          </button>
        )}
      </Toolbar>
      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-muted/10 px-4 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60">
        <div className="w-7 shrink-0" />
        <div className="w-[52px] shrink-0 text-right">{t('table.updated')}</div>
        <div className="w-[70px] shrink-0 text-center">{t('table.status')}</div>
        <div className="min-w-0 flex-1">{t('table.item')}</div>
        <div className="w-[90px] shrink-0">{t('table.author')}</div>
        <div className="w-[60px] shrink-0 text-center">{t('table.assigned')}</div>
        <div className="w-[130px] shrink-0">{t('table.repo')}</div>
        <div className="w-[150px] shrink-0" />
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <>
            <IssueRowSkeleton />
            <IssueRowSkeleton />
            <IssueRowSkeleton />
            <IssueRowSkeleton />
          </>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground/50">
            <AlertCircle className="h-6 w-6 opacity-30" />
            <p className="text-xs">{t('issues.noMatch')}</p>
          </div>
        ) : (
          <>
            {filtered.slice(0, shown).map((issue) => (
              <IssueRow
                key={issue.id}
                issue={issue}
                pinned={pinnedIds.has(issue.id)}
                onTogglePin={onTogglePin}
                onChanged={onIssueChanged}
              />
            ))}
            <InfiniteScrollSentinel
              hasMore={shown < filtered.length}
              onLoadMore={() => setShown((n) => n + LOAD_STEP)}
              loadedCount={Math.min(shown, filtered.length)}
            />
          </>
        )}
      </div>
    </div>
  )
}
