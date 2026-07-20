import { useState, useMemo } from 'react'
import { Search, X, GitPullRequest, AlertCircle, Plus, Layers, Pencil, Trash2 } from 'lucide-react'
import { Input } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import {
  useLaunchpadStore,
  type SavedFilter,
  type FilterStatus,
} from '../../../stores/launchpad.store'
import type { MockPR, MockIssue } from '../types'
import { TableHeader, LoadMore } from './ListHelpers'
import { PRRowSkeleton, IssueRowSkeleton } from './RowSkeletons'
import { PRRow } from './PRRow'
import { IssueRow } from './IssueRow'
import { FilterEditorDialog } from './FilterEditorDialog'

const PAGE_SIZE = 20

function matchesPR(pr: MockPR, f: SavedFilter): boolean {
  if (f.titleContains && !pr.title.toLowerCase().includes(f.titleContains.toLowerCase()))
    return false
  if (f.authorContains && !pr.author.toLowerCase().includes(f.authorContains.toLowerCase()))
    return false
  if (f.repo && pr.repo !== f.repo) return false
  if (
    f.labelContains &&
    !pr.labels.some((l) => l.toLowerCase().includes(f.labelContains!.toLowerCase()))
  )
    return false
  if (f.statuses && f.statuses.length > 0 && !f.statuses.includes(pr.status as FilterStatus))
    return false
  if (f.needsMyReview === true && !pr.needsMyReview) return false
  return true
}

function matchesIssue(issue: MockIssue, f: SavedFilter): boolean {
  if (f.titleContains && !issue.title.toLowerCase().includes(f.titleContains.toLowerCase()))
    return false
  if (f.authorContains && !issue.author.toLowerCase().includes(f.authorContains.toLowerCase()))
    return false
  if (f.repo && issue.repo !== f.repo) return false
  if (
    f.labelContains &&
    !issue.labels.some((l) => l.toLowerCase().includes(f.labelContains!.toLowerCase()))
  )
    return false
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
  const { t } = useTranslation('launchpad')
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
    <div className="flex h-full flex-col overflow-hidden">
      {/* Search */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/5 px-4 py-2">
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('views.searchPlaceholder')}
            className="h-7 w-full border-border bg-card pl-7 pr-6 text-xs shadow-none focus:ring-1 focus:ring-primary/40"
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
          {t('views.results', { count: total })}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <>
            {filter.type !== 'issues' && (
              <>
                {filter.type === 'both' && (
                  <div className="flex shrink-0 items-center gap-2 border-b border-border/50 bg-muted/15 px-4 py-2">
                    <GitPullRequest className="h-3 w-3 text-green-400" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {t('filterEditor.typePrs')}
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
                  <div className="mt-4 flex shrink-0 items-center gap-2 border-b border-border/50 bg-muted/15 px-4 py-2">
                    <AlertCircle className="h-3 w-3 text-blue-400" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {t('filterEditor.typeIssues')}
                    </span>
                  </div>
                )}
                <div className="flex shrink-0 items-center gap-3 border-b border-border bg-muted/10 px-4 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  <div className="w-4 shrink-0" />
                  <div className="min-w-0 flex-1">{t('table.item')}</div>
                  <div className="w-[52px] shrink-0 text-right">{t('table.updated')}</div>
                  <div className="w-[70px] shrink-0 text-center">{t('table.status')}</div>
                  <div className="w-[90px] shrink-0">{t('table.author')}</div>
                  <div className="w-[60px] shrink-0 text-center">{t('table.assigned')}</div>
                  <div className="w-[110px] shrink-0">{t('table.repo')}</div>
                  <div className="w-6 shrink-0" />
                </div>
                <IssueRowSkeleton />
                <IssueRowSkeleton />
              </>
            )}
          </>
        ) : total === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground/50">
            <span className="text-3xl">{filter.emoji}</span>
            <p className="text-xs">{t('views.noResults')}</p>
          </div>
        ) : (
          <>
            {matchedPRs.length > 0 && (
              <>
                {filter.type === 'both' && (
                  <div className="flex shrink-0 items-center gap-2 border-b border-border/50 bg-muted/15 px-4 py-2">
                    <GitPullRequest className="h-3 w-3 text-green-400" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {t('filterEditor.typePrs')}
                    </span>
                    <span className="rounded-full bg-muted px-1.5 py-px text-[9px] font-bold leading-none text-muted-foreground">
                      {matchedPRs.length}
                    </span>
                  </div>
                )}
                <TableHeader />
                {matchedPRs.slice(0, shownPRs).map((pr) => (
                  <PRRow
                    key={pr.id}
                    pr={pr}
                    pinned={pinnedIds.has(pr.id)}
                    onTogglePin={onTogglePin}
                  />
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
                  <div className="flex shrink-0 items-center gap-2 border-b border-border/50 bg-muted/15 px-4 py-2">
                    <AlertCircle className="h-3 w-3 text-blue-400" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {t('filterEditor.typeIssues')}
                    </span>
                    <span className="rounded-full bg-muted px-1.5 py-px text-[9px] font-bold leading-none text-muted-foreground">
                      {matchedIssues.length}
                    </span>
                  </div>
                )}
                <div className="flex shrink-0 items-center gap-3 border-b border-border bg-muted/10 px-4 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  <div className="w-4 shrink-0" />
                  <div className="min-w-0 flex-1">{t('table.item')}</div>
                  <div className="w-[52px] shrink-0 text-right">{t('table.updated')}</div>
                  <div className="w-[70px] shrink-0 text-center">{t('table.status')}</div>
                  <div className="w-[90px] shrink-0">{t('table.author')}</div>
                  <div className="w-[60px] shrink-0 text-center">{t('table.assigned')}</div>
                  <div className="w-[110px] shrink-0">{t('table.repo')}</div>
                  <div className="w-6 shrink-0" />
                </div>
                {matchedIssues.slice(0, shownIssues).map((issue) => (
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

export function CustomViewsTab({
  allPRs,
  allIssues,
  pinnedIds,
  onTogglePin,
  loading,
}: CustomViewsTabProps) {
  const { t } = useTranslation('launchpad')
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
    const issueCount =
      f.type === 'prs' ? 0 : allIssues.filter((issue) => matchesIssue(issue, f)).length
    return prCount + issueCount
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left sidebar — filter list */}
      <div className="flex w-52 shrink-0 flex-col border-r border-border bg-muted/5">
        <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t('views.savedFilters')}
          </span>
          <button
            onClick={() => {
              setEditingFilter(null)
              setShowEditor(true)
            }}
            className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-primary"
            title={t('views.newFilter')}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {savedFilters.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 px-3 py-8 text-muted-foreground/50">
              <Layers className="h-5 w-5 opacity-30" />
              <p className="text-center text-[10px]">
                {t('views.noFiltersTitle')}
                <br />
                {t('views.noFiltersHint')}
              </p>
            </div>
          )}
          {savedFilters.map((f) => {
            const count = countForFilter(f)
            const isActive = f.id === activeFilterId
            return (
              <div
                key={f.id}
                className={`group/filter relative flex cursor-pointer items-center gap-2 px-3 py-2 transition-colors ${
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
                }`}
                onClick={() => setActiveFilterId(f.id)}
              >
                <span className="shrink-0 text-sm">{f.emoji}</span>
                <span className="flex-1 truncate text-xs font-medium">{f.name}</span>
                <span
                  className={`shrink-0 rounded-full px-1.5 py-px text-[9px] font-bold leading-none ${
                    isActive ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {count}
                </span>
                <div className="absolute right-1 hidden items-center gap-0.5 group-hover/filter:flex">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setEditingFilter(f)
                      setShowEditor(true)
                    }}
                    className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                    title={t('views.edit')}
                  >
                    <Pencil className="h-2.5 w-2.5" />
                  </button>
                  {confirmDeleteId === f.id ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(f.id)
                      }}
                      className="flex h-5 items-center justify-center rounded bg-destructive/10 px-1 text-[9px] font-medium text-destructive"
                    >
                      {t('views.confirm')}
                    </button>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setConfirmDeleteId(f.id)
                      }}
                      className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      title={t('views.delete')}
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
          <div className="space-y-1.5 border-t border-border px-3 py-3">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              {t('views.criteria')}
            </p>
            {activeFilter.titleContains && (
              <p className="text-[10px] text-muted-foreground">
                <span className="font-medium text-foreground/70">{t('views.criteriaTitle')}</span>{' '}
                &quot;
                {activeFilter.titleContains}&quot;
              </p>
            )}
            {activeFilter.authorContains && (
              <p className="text-[10px] text-muted-foreground">
                <span className="font-medium text-foreground/70">{t('views.criteriaAuthor')}</span>{' '}
                {activeFilter.authorContains}
              </p>
            )}
            {activeFilter.repo && (
              <p className="text-[10px] text-muted-foreground">
                <span className="font-medium text-foreground/70">{t('views.criteriaRepo')}</span>{' '}
                {activeFilter.repo}
              </p>
            )}
            {activeFilter.labelContains && (
              <p className="text-[10px] text-muted-foreground">
                <span className="font-medium text-foreground/70">{t('views.criteriaLabel')}</span>{' '}
                {activeFilter.labelContains}
              </p>
            )}
            {(activeFilter.statuses?.length ?? 0) > 0 && (
              <p className="text-[10px] text-muted-foreground">
                <span className="font-medium text-foreground/70">{t('views.criteriaStatus')}</span>{' '}
                {activeFilter.statuses?.join(', ')}
              </p>
            )}
            {activeFilter.needsMyReview === true && (
              <p className="text-[10px] text-muted-foreground">{t('filterEditor.needsMyReview')}</p>
            )}
            {!activeFilter.titleContains &&
              !activeFilter.authorContains &&
              !activeFilter.repo &&
              !activeFilter.labelContains &&
              !activeFilter.statuses?.length &&
              activeFilter.needsMyReview === undefined && (
                <p className="text-[10px] italic text-muted-foreground/40">
                  {t('views.noCriteria')}
                </p>
              )}
          </div>
        )}
      </div>

      {/* Right content */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {activeFilter ? (
          <>
            <div className="flex shrink-0 items-center gap-2 border-b border-border bg-card/30 px-4 py-2.5">
              <span className="text-base">{activeFilter.emoji}</span>
              <span className="text-sm font-semibold text-foreground">{activeFilter.name}</span>
              <span className="text-[10px] capitalize text-muted-foreground/60">
                —{' '}
                {activeFilter.type === 'both'
                  ? t('views.typeBoth')
                  : activeFilter.type === 'prs'
                    ? t('filterEditor.typePrs')
                    : t('filterEditor.typeIssues')}
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
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-muted-foreground/50">
            <Layers className="h-8 w-8 opacity-20" />
            <div className="text-center">
              <p className="text-sm font-medium">{t('views.noFilterSelected')}</p>
              <p className="mt-1 text-xs">{t('views.createToStart')}</p>
            </div>
            <button
              onClick={() => {
                setEditingFilter(null)
                setShowEditor(true)
              }}
              className="flex h-8 items-center gap-2 rounded-lg border border-dashed border-border px-4 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
            >
              <Plus className="h-3.5 w-3.5" /> {t('views.newFilter')}
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
