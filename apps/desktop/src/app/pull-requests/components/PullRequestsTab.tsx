import { useState, useMemo, useCallback } from 'react'
import { Plus, ChevronDown, ChevronRight, Trash2, BookOpen, Eye, GitPullRequest } from 'lucide-react'
import { Toolbar } from './Toolbar'
import { TableHeader, GroupHeader, LoadMore, usePRSort, useSetFilter } from './ListHelpers'
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

interface PullRequestsTabProps {
  allPRs: MockPR[]
  followedPRs: MockPR[]
  pinnedIds: Set<string>
  onTogglePin: (id: string) => void
  onAddFollowed: (pr: MockPR) => void
  onRemoveFollowed: (id: string) => void
  loading: boolean
}

export function PullRequestsTab({
  allPRs,
  followedPRs,
  pinnedIds,
  onTogglePin,
  onAddFollowed,
  onRemoveFollowed,
  loading,
}: PullRequestsTabProps) {
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [statusFilter, toggleStatus, clearStatus] = useSetFilter()
  const [repoFilter, toggleRepo, clearRepo] = useSetFilter()
  const [authorFilter, toggleAuthor, clearAuthor] = useSetFilter()
  const [gNeedsOpen, setGNeedsOpen] = useState(true)
  const [gOtherOpen, setGOtherOpen] = useState(true)
  const [gPinnedOpen, setGPinnedOpen] = useState(true)
  const [gFollowedOpen, setGFollowedOpen] = useState(true)
  const [shownNeeds, setShownNeeds] = useState(PAGE_SIZE)
  const [shownOther, setShownOther] = useState(PAGE_SIZE)
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

  const combined = useMemo(() => [...allPRs, ...followedPRs], [allPRs, followedPRs])
  const repos = useMemo(() => [...new Set(combined.map((p) => p.repo))].sort(), [combined])
  const statuses = useMemo(() => [...new Set(combined.map((p) => p.status))].sort(), [combined])
  const authors = useMemo(() => [...new Set(combined.map((p) => p.author))].sort(), [combined])

  const filtered = useMemo(() => {
    return combined.filter((pr) => {
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
  }, [combined, search, statusFilter, repoFilter, authorFilter])

  const pinnedPRs = usePRSort(
    useMemo(() => filtered.filter((pr) => pinnedIds.has(pr.id)), [filtered, pinnedIds]),
    sortKey,
    sortDir
  )
  const followedFiltered = usePRSort(
    useMemo(() => filtered.filter((pr) => pr.isFollowed && !pinnedIds.has(pr.id)), [filtered, pinnedIds]),
    sortKey,
    sortDir
  )
  const needsReview = usePRSort(
    useMemo(() => filtered.filter((pr) => pr.needsMyReview && !pinnedIds.has(pr.id) && !pr.isFollowed), [
      filtered,
      pinnedIds,
    ]),
    sortKey,
    sortDir
  )
  const other = usePRSort(
    useMemo(() => filtered.filter((pr) => !pr.needsMyReview && !pinnedIds.has(pr.id) && !pr.isFollowed), [
      filtered,
      pinnedIds,
    ]),
    sortKey,
    sortDir
  )

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
                  label="Pinned"
                  count={pinnedPRs.length}
                  open={gPinnedOpen}
                  onToggle={() => setGPinnedOpen((v) => !v)}
                  accent="text-amber-400"
                />
                {gPinnedOpen &&
                  pinnedPRs.map((pr) => (
                    <PRRow key={pr.id} pr={pr} pinned onTogglePin={onTogglePin} />
                  ))}
              </>
            )}
            <GroupHeader
              label="Needs my review"
              count={needsReview.length}
              open={gNeedsOpen}
              onToggle={() => setGNeedsOpen((v) => !v)}
              accent="text-orange-400"
            />
            {gNeedsOpen && (
              <>
                {needsReview.length === 0 && (
                  <div className="flex items-center justify-center py-6 text-xs text-muted-foreground/50">
                    <Eye className="h-4 w-4 mr-2 opacity-30" /> No PRs waiting for your review
                  </div>
                )}
                {needsReview.slice(0, shownNeeds).map((pr) => (
                  <PRRow key={pr.id} pr={pr} pinned={false} onTogglePin={onTogglePin} />
                ))}
                <LoadMore
                  total={needsReview.length}
                  shown={shownNeeds}
                  onLoadMore={() => setShownNeeds((n) => n + PAGE_SIZE)}
                />
              </>
            )}
            <GroupHeader
              label="Other pull requests"
              count={other.length}
              open={gOtherOpen}
              onToggle={() => setGOtherOpen((v) => !v)}
            />
            {gOtherOpen && (
              <>
                {other.length === 0 && (
                  <div className="flex items-center justify-center py-6 text-xs text-muted-foreground/50">
                    <GitPullRequest className="h-4 w-4 mr-2 opacity-30" /> No pull requests
                  </div>
                )}
                {other.slice(0, shownOther).map((pr) => (
                  <PRRow key={pr.id} pr={pr} pinned={false} onTogglePin={onTogglePin} />
                ))}
                <LoadMore
                  total={other.length}
                  shown={shownOther}
                  onLoadMore={() => setShownOther((n) => n + PAGE_SIZE)}
                />
              </>
            )}
            {/* Followed */}
            <div className="flex items-center border-b border-border/50">
              <button
                onClick={() => setGFollowedOpen((v) => !v)}
                className="flex flex-1 items-center gap-2 px-4 py-2 bg-muted/20 hover:bg-muted/30 transition-colors"
              >
                {gFollowedOpen ? (
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                )}
                <span className="text-[10px] font-semibold uppercase tracking-wider text-sky-400">Followed PRs</span>
                <span className="rounded-full px-1.5 py-px text-[9px] font-bold leading-none bg-sky-500/20 text-sky-400">
                  {followedFiltered.length}
                </span>
              </button>
              <button
                onClick={() => setShowFollowDialog(true)}
                className="flex items-center gap-1 mx-2 h-6 px-2 rounded border border-dashed border-border hover:border-primary/40 hover:bg-primary/5 text-muted-foreground hover:text-primary text-[10px] transition-colors"
              >
                <Plus className="h-3 w-3" /> Add by URL
              </button>
            </div>
            {gFollowedOpen && (
              <>
                {followedFiltered.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-6 gap-2 text-muted-foreground/50">
                    <BookOpen className="h-5 w-5 opacity-30" />
                    <p className="text-xs">No followed PRs yet.</p>
                    <button
                      onClick={() => setShowFollowDialog(true)}
                      className="flex items-center gap-1 text-[10px] text-primary hover:underline"
                    >
                      <Plus className="h-3 w-3" /> Add PR by URL
                    </button>
                  </div>
                )}
                {followedFiltered.map((pr) => (
                  <div key={pr.id} className="relative group/followed">
                    <PRRow pr={pr} pinned={pinnedIds.has(pr.id)} onTogglePin={onTogglePin} />
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onRemoveFollowed(pr.id)
                      }}
                      className="absolute right-10 top-1/2 -translate-y-1/2 opacity-0 group-hover/followed:opacity-100 h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-destructive transition-all"
                      title="Remove"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </>
            )}
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
