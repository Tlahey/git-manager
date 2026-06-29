import { useState, useMemo } from 'react'
import { Search, X, GitPullRequest, AlertCircle, Plus, Layers, Pencil, Trash2 } from 'lucide-react'
import { useLaunchpadStore, type SavedFilter, type FilterStatus } from '../../../stores/launchpad.store'
import type { MockPR, MockIssue } from '../types'
import { TableHeader, LoadMore } from './ListHelpers'
import { PRRowSkeleton, IssueRowSkeleton } from './RowSkeletons'
import { PRRow } from './PRRow'
import { IssueRow } from './IssueRow'
import { FilterEditorDialog } from './FilterEditorDialog'

const PAGE_SIZE = 20

function matchesPR(pr: MockPR, f: SavedFilter): boolean {
  if (f.titleContains && !pr.title.toLowerCase().includes(f.titleContains.toLowerCase())) return false
  if (f.authorContains && !pr.author.toLowerCase().includes(f.authorContains.toLowerCase())) return false
  if (f.repo && pr.repo !== f.repo) return false
  if (f.labelContains && !pr.labels.some((l) => l.toLowerCase().includes(f.labelContains!.toLowerCase()))) return false
  if (f.statuses && f.statuses.length > 0 && !f.statuses.includes(pr.status as FilterStatus)) return false
  if (f.needsMyReview === true && !pr.needsMyReview) return false
  return true
}

function matchesIssue(issue: MockIssue, f: SavedFilter): boolean {
  if (f.titleContains && !issue.title.toLowerCase().includes(f.titleContains.toLowerCase())) return false
  if (f.authorContains && !issue.author.toLowerCase().includes(f.authorContains.toLowerCase())) return false
  if (f.repo && issue.repo !== f.repo) return false
  if (f.labelContains && !issue.labels.some((l) => l.toLowerCase().includes(f.labelContains!.toLowerCase()))) return false
  return true
}

interface CustomViewResultsProps {
  filter: SavedFilter
  allPRs: MockPR[]
  allIssues: MockIssue[]
  pinnedIds: Set<string>
  onTogglePin: (id: string) => void
  loading: boolean
}

function CustomViewResults({
  filter,
  allPRs,
  allIssues,
  pinnedIds,
  onTogglePin,
  loading,
}: CustomViewResultsProps) {
  const [shownPRs, setShownPRs] = useState(PAGE_SIZE)
  const [shownIssues, setShownIssues] = useState(PAGE_SIZE)
  const [search, setSearch] = useState('')

  const matchedPRs = useMemo(() => {
    if (filter.type === 'issues') return []
    return allPRs.filter((pr) => {
      if (search && !pr.title.toLowerCase().includes(search.toLowerCase())) return false
      return matchesPR(pr, filter)
    })
  }, [allPRs, filter, search])

  const matchedIssues = useMemo(() => {
    if (filter.type === 'prs') return []
    return allIssues.filter((issue) => {
      if (search && !issue.title.toLowerCase().includes(search.toLowerCase())) return false
      return matchesIssue(issue, filter)
    })
  }, [allIssues, filter, search])

  const total = matchedPRs.length + matchedIssues.length

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Search */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/5 shrink-0">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search within this view…"
            className="w-full pl-7 pr-6 h-7 rounded-md border border-border bg-card text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground">
          {total} result{total !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <>
            {filter.type !== 'issues' && (
              <>
                {filter.type === 'both' && (
                  <div className="flex items-center gap-2 px-4 py-2 bg-muted/15 border-b border-border/50 shrink-0">
                    <GitPullRequest className="h-3 w-3 text-green-400" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Pull Requests
                    </span>
                  </div>
                )}
                <TableHeader />
                <PRRowSkeleton />
                <PRRowSkeleton />
              </>
            )}
            {filter.type !== 'prs' && (
              <>
                {filter.type === 'both' && (
                  <div className="flex items-center gap-2 px-4 py-2 bg-muted/15 border-b border-border/50 shrink-0 mt-4">
                    <AlertCircle className="h-3 w-3 text-blue-400" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Issues
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-3 px-4 py-1.5 bg-muted/10 border-b border-border text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60 shrink-0">
                  <div className="w-4 shrink-0" />
                  <div className="flex-1 min-w-0">Item</div>
                  <div className="shrink-0 w-[52px] text-right">Updated</div>
                  <div className="shrink-0 w-[70px] text-center">Status</div>
                  <div className="shrink-0 w-[90px]">Author</div>
                  <div className="shrink-0 w-[60px] text-center">Assigned</div>
                  <div className="shrink-0 w-[110px]">Repo</div>
                  <div className="shrink-0 w-6" />
                </div>
                <IssueRowSkeleton />
                <IssueRowSkeleton />
              </>
            )}
          </>
        ) : total === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground/50">
            <span className="text-3xl">{filter.emoji}</span>
            <p className="text-xs">No results match this filter</p>
          </div>
        ) : (
          <>
            {matchedPRs.length > 0 && (
              <>
                {filter.type === 'both' && (
                  <div className="flex items-center gap-2 px-4 py-2 bg-muted/15 border-b border-border/50 shrink-0">
                    <GitPullRequest className="h-3 w-3 text-green-400" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Pull Requests
                    </span>
                    <span className="rounded-full px-1.5 py-px text-[9px] font-bold leading-none bg-muted text-muted-foreground">
                      {matchedPRs.length}
                    </span>
                  </div>
                )}
                <TableHeader />
                {matchedPRs
                  .slice(0, shownPRs)
                  .map((pr) => (
                    <PRRow key={pr.id} pr={pr} pinned={pinnedIds.has(pr.id)} onTogglePin={onTogglePin} />
                  ))}
                <LoadMore
                  total={matchedPRs.length}
                  shown={shownPRs}
                  onLoadMore={() => setShownPRs((n) => n + PAGE_SIZE)}
                />
              </>
            )}

            {matchedIssues.length > 0 && (
              <>
                {filter.type === 'both' && (
                  <div className="flex items-center gap-2 px-4 py-2 bg-muted/15 border-b border-border/50 shrink-0">
                    <AlertCircle className="h-3 w-3 text-blue-400" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Issues
                    </span>
                    <span className="rounded-full px-1.5 py-px text-[9px] font-bold leading-none bg-muted text-muted-foreground">
                      {matchedIssues.length}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-3 px-4 py-1.5 bg-muted/10 border-b border-border text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60 shrink-0">
                  <div className="w-4 shrink-0" />
                  <div className="flex-1 min-w-0">Item</div>
                  <div className="shrink-0 w-[52px] text-right">Updated</div>
                  <div className="shrink-0 w-[70px] text-center">Status</div>
                  <div className="shrink-0 w-[90px]">Author</div>
                  <div className="shrink-0 w-[60px] text-center">Assigned</div>
                  <div className="shrink-0 w-[110px]">Repo</div>
                  <div className="shrink-0 w-6" />
                </div>
                {matchedIssues
                  .slice(0, shownIssues)
                  .map((issue) => (
                    <IssueRow key={issue.id} issue={issue} />
                  ))}
                <LoadMore
                  total={matchedIssues.length}
                  shown={shownIssues}
                  onLoadMore={() => setShownIssues((n) => n + PAGE_SIZE)}
                />
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

interface CustomViewsTabProps {
  allPRs: MockPR[]
  allIssues: MockIssue[]
  pinnedIds: Set<string>
  onTogglePin: (id: string) => void
  loading: boolean
}

export function CustomViewsTab({ allPRs, allIssues, pinnedIds, onTogglePin, loading }: CustomViewsTabProps) {
  const { savedFilters, addFilter, updateFilter, deleteFilter } = useLaunchpadStore()
  const [activeFilterId, setActiveFilterId] = useState<string | null>(savedFilters[0]?.id ?? null)
  const [showEditor, setShowEditor] = useState(false)
  const [editingFilter, setEditingFilter] = useState<SavedFilter | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const activeFilter = savedFilters.find((f) => f.id === activeFilterId) ?? null

  function handleCreate(draft: Omit<SavedFilter, 'id' | 'createdAt'>) {
    addFilter(draft)
  }
  function handleUpdate(id: string, draft: Omit<SavedFilter, 'id' | 'createdAt'>) {
    updateFilter(id, draft)
  }
  function handleDelete(id: string) {
    deleteFilter(id)
    if (activeFilterId === id) {
      setActiveFilterId(savedFilters.filter((f) => f.id !== id)[0]?.id ?? null)
    }
    setConfirmDeleteId(null)
  }

  // Count matching items per filter
  function countForFilter(f: SavedFilter): number {
    const prCount = f.type === 'issues' ? 0 : allPRs.filter((pr) => matchesPR(pr, f)).length
    const issueCount = f.type === 'prs' ? 0 : allIssues.filter((issue) => matchesIssue(issue, f)).length
    return prCount + issueCount
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left sidebar — filter list */}
      <div className="w-52 shrink-0 flex flex-col border-r border-border bg-muted/5">
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Saved filters</span>
          <button
            onClick={() => {
              setEditingFilter(null)
              setShowEditor(true)
            }}
            className="h-5 w-5 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-primary transition-colors"
            title="New filter"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {savedFilters.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground/50 px-3">
              <Layers className="h-5 w-5 opacity-30" />
              <p className="text-[10px] text-center">
                No filters yet.
                <br />
                Click + to create one.
              </p>
            </div>
          )}
          {savedFilters.map((f) => {
            const count = countForFilter(f)
            const isActive = f.id === activeFilterId
            return (
              <div
                key={f.id}
                className={`group/filter relative flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
                  isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
                }`}
                onClick={() => setActiveFilterId(f.id)}
              >
                <span className="text-sm shrink-0">{f.emoji}</span>
                <span className="text-xs font-medium truncate flex-1">{f.name}</span>
                <span
                  className={`rounded-full px-1.5 py-px text-[9px] font-bold leading-none shrink-0 ${
                    isActive ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {count}
                </span>
                <div className="absolute right-1 hidden group-hover/filter:flex items-center gap-0.5">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setEditingFilter(f)
                      setShowEditor(true)
                    }}
                    className="h-5 w-5 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                    title="Edit"
                  >
                    <Pencil className="h-2.5 w-2.5" />
                  </button>
                  {confirmDeleteId === f.id ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(f.id)
                      }}
                      className="h-5 px-1 flex items-center justify-center rounded bg-destructive/10 text-destructive text-[9px] font-medium"
                    >
                      Confirm
                    </button>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setConfirmDeleteId(f.id)
                      }}
                      className="h-5 w-5 flex items-center justify-center rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                      title="Delete"
                    >
                      <Trash2 className="h-2.5 w-2.5" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Filter description */}
        {activeFilter && (
          <div className="border-t border-border px-3 py-3 space-y-1.5">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60">Criteria</p>
            {activeFilter.titleContains && (
              <p className="text-[10px] text-muted-foreground">
                <span className="font-medium text-foreground/70">Title:</span> "{activeFilter.titleContains}"
              </p>
            )}
            {activeFilter.authorContains && (
              <p className="text-[10px] text-muted-foreground">
                <span className="font-medium text-foreground/70">Author:</span> {activeFilter.authorContains}
              </p>
            )}
            {activeFilter.repo && (
              <p className="text-[10px] text-muted-foreground">
                <span className="font-medium text-foreground/70">Repo:</span> {activeFilter.repo}
              </p>
            )}
            {activeFilter.labelContains && (
              <p className="text-[10px] text-muted-foreground">
                <span className="font-medium text-foreground/70">Label:</span> {activeFilter.labelContains}
              </p>
            )}
            {(activeFilter.statuses?.length ?? 0) > 0 && (
              <p className="text-[10px] text-muted-foreground">
                <span className="font-medium text-foreground/70">Status:</span> {activeFilter.statuses?.join(', ')}
              </p>
            )}
            {activeFilter.needsMyReview === true && <p className="text-[10px] text-muted-foreground">Needs my review</p>}
            {!activeFilter.titleContains &&
              !activeFilter.authorContains &&
              !activeFilter.repo &&
              !activeFilter.labelContains &&
              !activeFilter.statuses?.length &&
              activeFilter.needsMyReview === undefined && (
                <p className="text-[10px] text-muted-foreground/40 italic">No criteria (matches all)</p>
              )}
          </div>
        )}
      </div>

      {/* Right content */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {activeFilter ? (
          <>
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-card/30 shrink-0">
              <span className="text-base">{activeFilter.emoji}</span>
              <span className="text-sm font-semibold text-foreground">{activeFilter.name}</span>
              <span className="text-[10px] text-muted-foreground/60 capitalize">
                — {activeFilter.type === 'both' ? 'PRs & Issues' : activeFilter.type === 'prs' ? 'Pull Requests' : 'Issues'}
              </span>
            </div>
            <CustomViewResults
              filter={activeFilter}
              allPRs={allPRs}
              allIssues={allIssues}
              pinnedIds={pinnedIds}
              onTogglePin={onTogglePin}
              loading={loading}
            />
          </>
        ) : (
          <div className="flex flex-col items-center justify-center flex-1 gap-4 text-muted-foreground/50">
            <Layers className="h-8 w-8 opacity-20" />
            <div className="text-center">
              <p className="text-sm font-medium">No filter selected</p>
              <p className="text-xs mt-1">Create a filter to get started</p>
            </div>
            <button
              onClick={() => {
                setEditingFilter(null)
                setShowEditor(true)
              }}
              className="flex items-center gap-2 h-8 px-4 rounded-lg border border-dashed border-border hover:border-primary/40 hover:bg-primary/5 text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> New filter
            </button>
          </div>
        )}
      </div>

      {showEditor && (
        <FilterEditorDialog
          initial={
            editingFilter
              ? {
                  name: editingFilter.name,
                  emoji: editingFilter.emoji,
                  type: editingFilter.type,
                  titleContains: editingFilter.titleContains,
                  authorContains: editingFilter.authorContains,
                  repo: editingFilter.repo,
                  labelContains: editingFilter.labelContains,
                  statuses: editingFilter.statuses,
                  needsMyReview: editingFilter.needsMyReview,
                }
              : undefined
          }
          onSave={(draft) => {
            if (editingFilter) handleUpdate(editingFilter.id, draft)
            else handleCreate(draft)
          }}
          onClose={() => {
            setShowEditor(false)
            setEditingFilter(null)
          }}
        />
      )}
    </div>
  )
}
