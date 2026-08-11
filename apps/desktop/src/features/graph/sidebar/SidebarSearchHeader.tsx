import type { RefObject } from 'react'
import { Focus, X } from 'lucide-react'
import { SearchInput } from '@git-manager/components'
import { useTranslation } from '@git-manager/i18n'

interface SidebarSearchHeaderProps {
  /** The panel's filter text and its setter — owned by {@link RepositorySidebar}, which passes the
   *  query on to `useSidebarRows` and to every row for match highlighting. */
  query: string
  onQueryChange: (value: string) => void
  /** How many rows the filter matched, out of how many exist. Only shown while filtering. */
  filterStats: { matched: number; total: number }
  soloActive: boolean
  /** How many branches are currently soloed — the strip names the count, not the branches. */
  soloCount: number
  onToggleSolo: () => void
  onClearSolo: () => void
  /** Focused by the ⌥⌘F shortcut, which the panel resolves before this component renders. */
  inputRef: RefObject<HTMLInputElement | null>
}

/**
 * The sidebar's top chrome: the "Repository" title with its solo-mode toggle, the branch filter
 * box, and the strip that appears under it while solo mode is on.
 *
 * One component because the three are one control surface — solo mode is toggled in the title row,
 * signalled by the ring on the input below it, and unwound from the strip under that. Splitting
 * them further would spread one state across three files for no reader's benefit.
 */
export function SidebarSearchHeader({
  query,
  onQueryChange,
  filterStats,
  soloActive,
  soloCount,
  onToggleSolo,
  onClearSolo,
  inputRef,
}: SidebarSearchHeaderProps) {
  const { t } = useTranslation('git')
  const isFilterActive = query.trim().length > 0

  return (
    <>
      {/* Sidebar header */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-sidebar-border px-2">
        <span className="text-[10px] font-bold tracking-widest text-sidebar-muted-foreground/60 uppercase select-none">
          Repository
        </span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={onToggleSolo}
            title={soloActive ? t('sidebar.solo.exit') : t('sidebar.solo.enable')}
            aria-label={soloActive ? t('sidebar.solo.exit') : t('sidebar.solo.enable')}
            aria-pressed={soloActive}
            data-testid="sidebar-solo-toggle"
            className={`flex h-6 w-6 cursor-pointer items-center justify-center rounded transition-colors ${
              soloActive
                ? 'bg-primary/15 text-primary hover:bg-primary/25'
                : 'text-sidebar-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground'
            }`}
          >
            <Focus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Branch search box — the primary ring signals that solo mode is active */}
      <div className="shrink-0 border-b border-sidebar-border px-2 py-1.5">
        {isFilterActive && (
          <div
            className="mb-1 px-0.5 text-[10px] text-sidebar-muted-foreground"
            data-testid="sidebar-filter-stats"
          >
            <span className="font-semibold text-primary">{filterStats.matched}</span>
            {` / ${t('sidebar.filterResults', { count: filterStats.total })}`}
          </div>
        )}
        <SearchInput
          inputRef={inputRef}
          value={query}
          onChange={onQueryChange}
          placeholder={t('sidebar.filterBranchesPlaceholder')}
          ariaLabel={t('sidebar.filterBranches')}
          clearLabel={t('sidebar.clearFilter')}
          inputClassName={soloActive ? 'ring-1 ring-primary focus-visible:ring-primary' : ''}
          data-testid="sidebar-filter-input"
        />
        {soloActive && (
          <div
            className="mt-1.5 flex items-center gap-1.5 rounded bg-primary/10 px-1.5 py-1 text-[10px] text-primary"
            data-testid="sidebar-solo-strip"
          >
            <Focus className="h-3 w-3 shrink-0" />
            <span className="flex-1 truncate font-medium">
              {t('sidebar.solo.active', { count: soloCount })}
            </span>
            <button
              onClick={onClearSolo}
              className="flex cursor-pointer items-center gap-0.5 rounded px-1 py-0.5 font-medium transition-colors hover:bg-primary/20"
              data-testid="sidebar-solo-clear"
            >
              <X className="h-2.5 w-2.5" />
              {t('sidebar.solo.clear')}
            </button>
          </div>
        )}
      </div>
    </>
  )
}
