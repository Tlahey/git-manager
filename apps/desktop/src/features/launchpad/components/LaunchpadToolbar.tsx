import { ChevronsDownUp, ChevronsUpDown } from 'lucide-react'
import { SearchInput } from '@git-manager/components'
import { useTranslation } from '@git-manager/i18n'
import { useLaunchpadControlsStore } from '../stores/launchpadControls.store'

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
      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder={t('toolbar.globalSearchPlaceholder')}
        clearLabel={t('toolbar.clearSearch')}
        className="max-w-sm flex-1"
        data-testid="launchpad-global-search"
      />

      <div className="ml-auto flex items-center gap-1">
        <button
          onClick={expandAll}
          className="flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-border px-2.5 text-[11px] text-muted-foreground transition-colors hover:border-border/80 hover:bg-accent/40 hover:text-foreground"
          data-testid="launchpad-expand-all"
        >
          <ChevronsUpDown className="h-3 w-3" /> {t('toolbar.expandAll')}
        </button>
        <button
          onClick={collapseAll}
          className="flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-border px-2.5 text-[11px] text-muted-foreground transition-colors hover:border-border/80 hover:bg-accent/40 hover:text-foreground"
          data-testid="launchpad-collapse-all"
        >
          <ChevronsDownUp className="h-3 w-3" /> {t('toolbar.collapseAll')}
        </button>
      </div>
    </div>
  )
}
