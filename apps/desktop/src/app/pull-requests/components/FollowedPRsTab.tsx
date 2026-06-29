import { useState, useMemo, useCallback } from 'react'
import { Plus, Trash2, BookOpen, GitPullRequest } from 'lucide-react'
import { Toolbar } from './Toolbar'
import { TableHeader, LoadMore, usePRSort, useSetFilter } from './ListHelpers'
import { PRRowSkeleton } from './RowSkeletons'
import { PRRow } from './PRRow'
import { FollowPRDialog } from './FollowPRDialog'
import type { MockPR, SortKey, SortDir } from '../types'

const PAGE_SIZE = 20

function parseFollowedPR(url: string): MockPR | null {
  const match = url.match(/\/pull\/(\d+)$/)
  if (!match) return null
  const repoMatch = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\//)
  const repo = repoMatch ? repoMatch[2] : 'unknown'
  return {
    id: `followed-${url}`,
    number: parseInt(match[1]),
    title: `PR #${match[1]} — ${repo}`,
    repo,
    repoUrl: url.split('/pull/')[0],
    url,
    status: 'open',
    ciStatus: null,
    author: '—',
    authorAvatar: 'https://avatars.githubusercontent.com/u/1?v=4',
    collaborators: [],
    filesChanged: 0,
    additions: 0,
    deletions: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    reviewStatus: 'pending',
    isDraft: false,
    isFollowed: true,
    labels: [],
    comments: 0,
  }
}

interface FollowedPRsTabProps {
  followedPRs: MockPR[]
  pinnedIds: Set<string>
  onTogglePin: (id: string) => void
  onAddFollowed: (pr: MockPR) => void
  onRemoveFollowed: (id: string) => void
  loading: boolean
}

export function FollowedPRsTab({
  followedPRs,
  pinnedIds,
  onTogglePin,
  onAddFollowed,
  onRemoveFollowed,
  loading,
}: FollowedPRsTabProps) {
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [statusFilter, toggleStatus, clearStatus] = useSetFilter()
  const [repoFilter, toggleRepo, clearRepo] = useSetFilter()
  const [authorFilter, toggleAuthor, clearAuthor] = useSetFilter()
  const [shown, setShown] = useState(PAGE_SIZE)
  const [showFollowDialog, setShowFollowDialog] = useState(false)

  const handleSort = useCallback((k: SortKey) => {
    setSortKey((prevKey) => {
      if (k === prevKey) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
        return prevKey
      } else {
        setSortDir('desc')
        return k
      }
    })
  }, [])

  const repos = useMemo(() => [...new Set(followedPRs.map((p) => p.repo))].sort(), [followedPRs])
  const statuses = useMemo(() => [...new Set(followedPRs.map((p) => p.status))].sort(), [followedPRs])
  const authors = useMemo(() => [...new Set(followedPRs.map((p) => p.author))].sort(), [followedPRs])

  const filtered = useMemo(() => {
    return followedPRs.filter((pr) => {
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
  }, [followedPRs, search, statusFilter, repoFilter, authorFilter])

  const sortedPRs = usePRSort(filtered, sortKey, sortDir)

  return (
    <div className="flex flex-col h-full overflow-hidden">
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
      >
        <button
          onClick={() => setShowFollowDialog(true)}
          className="flex items-center gap-1.5 h-7 px-3 rounded-md bg-primary text-primary-foreground hover:bg-primary/95 text-xs font-semibold shadow-sm transition-all duration-200"
        >
          <Plus className="h-3.5 w-3.5" /> Follow PR
        </button>
      </Toolbar>

      <TableHeader />

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <>
            <PRRowSkeleton />
            <PRRowSkeleton />
            <PRRowSkeleton />
          </>
        ) : followedPRs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-primary/5 flex items-center justify-center border border-primary/10 mb-4">
              <BookOpen className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-sm font-semibold text-foreground mb-1">No followed PRs yet</h3>
            <p className="text-xs text-muted-foreground max-w-[280px] mb-4">
              Keep an eye on specific external pull requests by adding their GitHub URLs.
            </p>
            <button
              onClick={() => setShowFollowDialog(true)}
              className="flex items-center gap-1.5 h-8 px-4 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-medium shadow transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> Add PR by URL
            </button>
          </div>
        ) : sortedPRs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground/50">
            <GitPullRequest className="h-6 w-6 opacity-30 mb-2" />
            <p className="text-xs">No PRs match your search or filters.</p>
          </div>
        ) : (
          <>
            {sortedPRs.slice(0, shown).map((pr) => (
              <div key={pr.id} className="relative group/followed">
                <PRRow pr={pr} pinned={pinnedIds.has(pr.id)} onTogglePin={onTogglePin} />
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemoveFollowed(pr.id)
                  }}
                  className="absolute right-10 top-1/2 -translate-y-1/2 opacity-0 group-hover/followed:opacity-100 h-6 w-6 flex items-center justify-center rounded-md bg-card/85 backdrop-blur-sm border border-border text-muted-foreground hover:text-destructive hover:border-destructive/20 shadow-sm transition-all duration-150"
                  title="Unfollow PR"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <LoadMore
              total={sortedPRs.length}
              shown={shown}
              onLoadMore={() => setShown((n) => n + PAGE_SIZE)}
            />
          </>
        )}
      </div>

      {showFollowDialog && (
        <FollowPRDialog
          onAdd={(url) => {
            const pr = parseFollowedPR(url)
            if (pr) onAddFollowed(pr)
          }}
          onClose={() => setShowFollowDialog(false)}
        />
      )}
    </div>
  )
}
