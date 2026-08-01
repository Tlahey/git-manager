import { useMemo } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Checkbox, Tooltip } from '@git-manager/ui'
import { Star } from 'lucide-react'
import { useRepoDataStore } from '../../../stores/repoData.store'
import { useRepoUIStore } from '../../../stores/repoUI.store'
import { useDailySummaryStore } from '../../../stores/dailySummary.store'
import { useRepoSummary } from '../../../hooks/useRepoSummary'
import { useRepoOwner } from '../../../hooks/useRepoOwner'
import { useOpenRepoTab } from '../../../hooks/useOpenRepoTab'
import { isSummaryStale } from '../../../lib/dailySummaryWindow'
import { RepoRowStatus } from './RepoRowStatus'
import { RepoRowActions } from './RepoRowActions'

interface RepoRowProps {
  path: string
  name: string
  /** Only a saved repo can be favourited — a merely discovered one gets a spacer instead. */
  isSaved: boolean
  isPinned: boolean
  isSelected: boolean
  onToggleSelected: () => void
  onToggleReadme: () => void
  isReadmeActive: boolean
  onToggleSummary: () => void
  isSummaryActive: boolean
  summaryEnabled: boolean
}

/**
 * One repository line of the dashboard, laid out in fixed columns so the four sections align:
 * selection checkbox, favourite star, name, owner, branch + working-tree counters, then actions.
 *
 * The star only shows up on hover (or keyboard focus) unless the repo is already a favourite, which
 * keeps a long "All repositories" list quiet while still marking the pinned ones at a glance.
 */
export function RepoRow({
  path,
  name,
  isSaved,
  isPinned,
  isSelected,
  onToggleSelected,
  onToggleReadme,
  isReadmeActive,
  onToggleSummary,
  isSummaryActive,
  summaryEnabled,
}: RepoRowProps) {
  const { t } = useTranslation('dashboard')
  const togglePin = useRepoDataStore((s) => s.togglePin)
  const openTabs = useRepoUIStore((s) => s.openTabs)
  const closeTab = useRepoUIStore((s) => s.closeTab)
  const openRepoTab = useOpenRepoTab()

  const { data: summary, isLoading, error } = useRepoSummary(path)
  const loading = isLoading || (!summary && !error)
  const { remote, url: remoteUrl } = useRepoOwner(error ? null : path)

  // "Fresh" now means the previous working day is archived — the day a briefing is *about* — rather
  // than "something was generated today". Subscribing to the repo's own slice keeps the reference
  // stable; deriving the day list inside the selector would hand zustand a new array every call and
  // loop the component forever.
  const byDate = useDailySummaryStore((s) => s.entries[path])
  const hasFreshSummary = useMemo(() => !isSummaryStale(Object.keys(byDate ?? {})), [byDate])

  const isOpenInTab = openTabs.includes(path)

  function handleActivate() {
    openRepoTab(path)
  }

  return (
    // The row is deliberately not `role="button"`: it nests real buttons, which that role forbids
    // and which screen readers would flatten. Clicking anywhere is a mouse-only convenience — the
    // name below is the focusable control that opens the repo for keyboard and assistive tech.
    <div
      data-testid="dashboard-repo-row"
      data-repo-path={path}
      onClick={handleActivate}
      className="group/row flex cursor-pointer select-none items-center gap-3 border-b border-border/10 bg-transparent px-4 py-2.5 transition-colors duration-150 first:rounded-t-lg last:rounded-b-lg last:border-0 hover:bg-accent/40"
    >
      {/* Selection */}
      <span onClick={(e) => e.stopPropagation()}>
        <Checkbox
          data-testid="repo-row-checkbox"
          checked={isSelected}
          onChange={onToggleSelected}
          aria-label={t('dashboard.row.select', { name })}
        />
      </span>

      {/* Favourite */}
      {isSaved ? (
        <Tooltip
          content={
            isPinned ? t('dashboard.row.removeFromFavorites') : t('dashboard.row.addToFavorites')
          }
        >
          <button
            type="button"
            data-testid="repo-row-star"
            aria-label={
              isPinned ? t('dashboard.row.removeFromFavorites') : t('dashboard.row.addToFavorites')
            }
            aria-pressed={isPinned}
            onClick={(e) => {
              e.stopPropagation()
              togglePin(path)
            }}
            className={`shrink-0 cursor-pointer rounded transition-opacity duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              isPinned
                ? 'text-amber-500'
                : 'text-muted-foreground/40 opacity-0 hover:text-amber-500 focus-visible:opacity-100 group-hover/row:opacity-100'
            }`}
          >
            <Star className={`h-4 w-4 ${isPinned ? 'fill-amber-500' : ''}`} />
          </button>
        </Tooltip>
      ) : (
        <div className="h-4 w-4 shrink-0" />
      )}

      {/* Name — the full path lives in the tooltip so the row stays one line high */}
      <div className="min-w-0 flex-1">
        <Tooltip content={path}>
          <button
            type="button"
            data-testid="repo-row-name"
            onClick={(e) => {
              e.stopPropagation()
              handleActivate()
            }}
            className="block max-w-full cursor-pointer truncate rounded text-left text-xs font-medium text-foreground transition-colors group-hover/row:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {name}
          </button>
        </Tooltip>
      </div>

      {/* Owner / organisation */}
      <div className="w-[140px] shrink-0">
        {remote ? (
          <Tooltip content={remoteUrl ?? remote.host}>
            <span
              data-testid="repo-row-owner"
              className="block truncate text-xs text-muted-foreground"
            >
              {remote.owner}
            </span>
          </Tooltip>
        ) : (
          <span
            data-testid="repo-row-owner-empty"
            className="block truncate text-xs italic text-muted-foreground/40"
          >
            {t('dashboard.row.noRemote')}
          </span>
        )}
      </div>

      {/* Branch + working-tree counters */}
      <div className="flex w-[280px] shrink-0 items-center font-sans text-xs">
        <RepoRowStatus summary={summary} isLoading={loading} hasError={Boolean(error)} />
      </div>

      <RepoRowActions
        path={path}
        hasError={Boolean(error)}
        isOpenInTab={isOpenInTab}
        onOpenTab={() => openRepoTab(path)}
        onCloseTab={() => closeTab(path)}
        onToggleReadme={onToggleReadme}
        isReadmeActive={isReadmeActive}
        onToggleSummary={onToggleSummary}
        isSummaryActive={isSummaryActive}
        summaryEnabled={summaryEnabled}
        hasFreshSummary={hasFreshSummary}
      />
    </div>
  )
}
