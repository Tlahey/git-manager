import { useState, useMemo, type ReactNode } from 'react'
import { Search, X, GitPullRequest, AlertCircle } from 'lucide-react'
import { Input } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import { NoResults } from '@git-manager/components'
import type { SavedFilter } from '../stores/launchpad.store'
import { useLaunchpadControlsStore } from '../stores/launchpadControls.store'
import { prMatchesSavedFilter, issueMatchesSavedFilter } from '../lib/savedFilterMatch'
import { TableHeader, IssueTableHeader, LoadMore } from './ListHelpers'
import { PRRowSkeleton, IssueRowSkeleton } from './RowSkeletons'
import { PRRow } from './PRRow'
import { IssueRow } from './IssueRow'
import type { MockPR, MockIssue } from '../../../lib/github/types'

const PAGE_SIZE = 20

/** The `both`-type divider that says which half of the results follows. Only rendered for a view
 * that mixes PRs and issues — with one type there is nothing to tell apart. */
function TypeSectionHeader({
  icon,
  label,
  count,
  className = '',
}: {
  icon: ReactNode
  label: string
  count?: number
  className?: string
}) {
  return (
    <div
      className={`flex shrink-0 items-center gap-2 border-b border-border/50 bg-muted/15 px-4 py-2 ${className}`}
    >
      {icon}
      <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
        {label}
      </span>
      {count !== undefined && (
        <span className="rounded-full bg-muted px-1.5 py-px text-[9px] leading-none font-bold text-muted-foreground">
          {count}
        </span>
      )}
    </div>
  )
}

interface CustomViewResultsProps {
  filter: SavedFilter
  allPRs: MockPR[]
  allIssues: MockIssue[]
  pinnedIds: Set<string>
  onTogglePin: (id: string) => void
  loading: boolean
}

/** What one saved custom view matches: its own search box, then the PRs and/or issues that pass
 * the view's criteria, each half paginated on its own. */
export function CustomViewResults({
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
  const globalSearch = useLaunchpadControlsStore((s) => s.search)

  /** Both search boxes narrow by title: the view's own, and the Launchpad-wide one above it. */
  const titleMatches = useMemo(() => {
    const local = search.trim().toLowerCase()
    const global = globalSearch.trim().toLowerCase()
    return (title: string) => {
      const lower = title.toLowerCase()
      return (!local || lower.includes(local)) && (!global || lower.includes(global))
    }
  }, [search, globalSearch])

  const matchedPRs = useMemo(
    () =>
      filter.type === 'issues'
        ? []
        : allPRs.filter((pr) => titleMatches(pr.title) && prMatchesSavedFilter(pr, filter)),
    [allPRs, filter, titleMatches]
  )

  const matchedIssues = useMemo(
    () =>
      filter.type === 'prs'
        ? []
        : allIssues.filter(
            (issue) => titleMatches(issue.title) && issueMatchesSavedFilter(issue, filter)
          ),
    [allIssues, filter, titleMatches]
  )

  const total = matchedPRs.length + matchedIssues.length
  const isMixed = filter.type === 'both'
  const prSectionIcon = <GitPullRequest className="h-3 w-3 text-green-400" />
  const issueSectionIcon = <AlertCircle className="h-3 w-3 text-blue-400" />

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/5 px-4 py-2">
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('views.searchPlaceholder')}
            className="h-7 w-full border-border bg-card pr-6 pl-7 text-xs shadow-none focus:ring-1 focus:ring-primary/40"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground"
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
                {isMixed && (
                  <TypeSectionHeader icon={prSectionIcon} label={t('filterEditor.typePrs')} />
                )}
                <TableHeader />
                <PRRowSkeleton />
                <PRRowSkeleton />
              </>
            )}
            {filter.type !== 'prs' && (
              <>
                {isMixed && (
                  <TypeSectionHeader
                    icon={issueSectionIcon}
                    label={t('filterEditor.typeIssues')}
                    className="mt-4"
                  />
                )}
                <IssueTableHeader />
                <IssueRowSkeleton />
                <IssueRowSkeleton />
              </>
            )}
          </>
        ) : total === 0 ? (
          <NoResults
            icon={<span className="text-3xl">{filter.emoji}</span>}
            message={t('views.noResults')}
          />
        ) : (
          <>
            {matchedPRs.length > 0 && (
              <>
                {isMixed && (
                  <TypeSectionHeader
                    icon={prSectionIcon}
                    label={t('filterEditor.typePrs')}
                    count={matchedPRs.length}
                  />
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
                {isMixed && (
                  <TypeSectionHeader
                    icon={issueSectionIcon}
                    label={t('filterEditor.typeIssues')}
                    count={matchedIssues.length}
                  />
                )}
                <IssueTableHeader />
                {matchedIssues.slice(0, shownIssues).map((issue) => (
                  <IssueRow
                    key={issue.id}
                    issue={issue}
                    pinned={pinnedIds.has(issue.id)}
                    onTogglePin={onTogglePin}
                  />
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
