import { useState, useMemo } from 'react'
import { AlertCircle } from 'lucide-react'
import { Toolbar } from './Toolbar'
import { IssueRowSkeleton } from './RowSkeletons'
import { IssueRow } from './IssueRow'
import { LoadMore, useSetFilter } from './ListHelpers'
import type { MockIssue, SortKey, SortDir } from '../types'

const PAGE_SIZE = 20

interface IssuesTabProps {
  allIssues: MockIssue[]
  loading: boolean
}

export function IssuesTab({ allIssues, loading }: IssuesTabProps) {
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [statusFilter, toggleStatus, clearStatus] = useSetFilter()
  const [repoFilter, toggleRepo, clearRepo] = useSetFilter()
  const [authorFilter, toggleAuthor, clearAuthor] = useSetFilter()
  const [shown, setShown] = useState(PAGE_SIZE)

  const repos = useMemo(() => [...new Set(allIssues.map((i) => i.repo))].sort(), [allIssues])
  const statuses = useMemo(() => [...new Set(allIssues.map((i) => i.status))].sort(), [allIssues])
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
        if (statusFilter.size > 0 && !statusFilter.has(issue.status)) return false
        if (repoFilter.size > 0 && !repoFilter.has(issue.repo)) return false
        if (authorFilter.size > 0 && !authorFilter.has(issue.author)) return false
        if (search) {
          const q = search.toLowerCase()
          return (
            issue.title.toLowerCase().includes(q) ||
            issue.author.toLowerCase().includes(q) ||
            String(issue.number).includes(q)
          )
        }
        return true
      })
      .sort((a, b) => {
        let cmp = 0
        if (sortKey === 'date') cmp = a.updatedAt.getTime() - b.updatedAt.getTime()
        else if (sortKey === 'author') cmp = a.author.localeCompare(b.author)
        else if (sortKey === 'repo') cmp = a.repo.localeCompare(b.repo)
        else if (sortKey === 'status') cmp = a.status.localeCompare(b.status)
        return sortDir === 'desc' ? -cmp : cmp
      })
  }, [allIssues, search, statusFilter, repoFilter, authorFilter, sortKey, sortDir])

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
      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-muted/10 px-4 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60">
        <div className="w-4 shrink-0" />
        <div className="min-w-0 flex-1">Item</div>
        <div className="w-[52px] shrink-0 text-right">Updated</div>
        <div className="w-[70px] shrink-0 text-center">Status</div>
        <div className="w-[90px] shrink-0">Author</div>
        <div className="w-[60px] shrink-0 text-center">Assigned</div>
        <div className="w-[110px] shrink-0">Repo</div>
        <div className="w-6 shrink-0" />
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
            <p className="text-xs">No issues match your filters</p>
          </div>
        ) : (
          <>
            {filtered.slice(0, shown).map((issue) => (
              <IssueRow key={issue.id} issue={issue} />
            ))}
            <LoadMore
              total={filtered.length}
              shown={shown}
              onLoadMore={() => setShown((n) => n + PAGE_SIZE)}
            />
          </>
        )}
      </div>
    </div>
  )
}
