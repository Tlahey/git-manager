import { useTranslation } from '@git-manager/i18n'
import { FloatingSearchPanel } from '@git-manager/components'
import { useBoardControlsStore } from '../stores/boardControls.store'

/**
 * Card search (⌘F, or the toolbar's button), anchored top-right of the board.
 *
 * Filters the columns in place — every card whose title misses the query leaves the board — so it
 * passes no `onNext`/`onPrevious`: there is no "next match" to step to when the non-matches are
 * already gone.
 */
export function BoardSearchPanel() {
  const { t } = useTranslation('board')
  const isSearchOpen = useBoardControlsStore((s) => s.isSearchOpen)
  const search = useBoardControlsStore((s) => s.search)
  const setSearch = useBoardControlsStore((s) => s.setSearch)
  const closeSearch = useBoardControlsStore((s) => s.closeSearch)

  return (
    <FloatingSearchPanel
      open={isSearchOpen}
      value={search}
      onValueChange={setSearch}
      onClose={closeSearch}
      placeholder={t('page.searchPlaceholder')}
      closeLabel={t('git:toolbar.cancel')}
      testId="board-search-panel"
    />
  )
}
