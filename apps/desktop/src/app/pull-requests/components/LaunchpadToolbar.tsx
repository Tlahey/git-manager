import { Search, X, ChevronsDownUp, ChevronsUpDown } from 'lucide-react'
import { Input } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import { useLaunchpadControlsStore } from '../../../stores/launchpadControls.store'

/**
 * Global controls for the Launchpad page, rendered once above the inner tab bar so the search box
 * and collapse/expand-all buttons apply to whichever tab is active (state lives in
 * {@link useLaunchpadControlsStore}). The search filters every list tab; collapse/expand-all folds
 * or unfolds the groups of any tab that has them.
 */
export function LaunchpadToolbar() {
  const { t } = useTranslation('launchpad')
  const search = useLaunchpadControlsStore((s) => s.search)
  const setSearch = useLaunchpadControlsStore((s) => s.setSearch)
  const collapseAll = useLaunchpadControlsStore((s) => s.collapseAll)
  const expandAll = useLaunchpadControlsStore((s) => s.expandAll)

  return (
    <div
      className="flex shrink-0 items-center gap-2 border-b border-border bg-card/40 px-4 py-2"
      data-testid="launchpad-toolbar"
    >
      <div className="relative max-w-sm flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('toolbar.globalSearchPlaceholder')}
          className="h-7 w-full border-border bg-card pl-7 pr-6 text-xs shadow-none focus:ring-1 focus:ring-primary/40"
          data-testid="launchpad-global-search"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            title={t('toolbar.searchPlaceholder')}
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      <div className="ml-auto flex items-center gap-1">
        <button
          onClick={expandAll}
          className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-[11px] text-muted-foreground transition-colors hover:border-border/80 hover:bg-accent/40 hover:text-foreground"
          data-testid="launchpad-expand-all"
        >
          <ChevronsUpDown className="h-3 w-3" /> {t('toolbar.expandAll')}
        </button>
        <button
          onClick={collapseAll}
          className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-[11px] text-muted-foreground transition-colors hover:border-border/80 hover:bg-accent/40 hover:text-foreground"
          data-testid="launchpad-collapse-all"
        >
          <ChevronsDownUp className="h-3 w-3" /> {t('toolbar.collapseAll')}
        </button>
      </div>
    </div>
  )
}
