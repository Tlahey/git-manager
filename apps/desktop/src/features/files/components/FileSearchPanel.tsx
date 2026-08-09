import { useTranslation } from '@git-manager/i18n'
import { FloatingSearchPanel } from '@git-manager/components'
import { useFileExplorerStore } from '../stores/fileExplorer.store'

/**
 * File search (⌘F, or the toolbar's button), anchored top-right of the files view.
 *
 * It filters the tree in place rather than stepping through matches, so it passes no
 * `onNext`/`onPrevious` — the whole listing narrows as you type, and there is nothing to walk. That
 * is the one behavioural difference from the graph's search; the shape is the shared panel's.
 */
export function FileSearchPanel() {
  const { t } = useTranslation('git')
  const isSearchOpen = useFileExplorerStore((s) => s.isSearchOpen)
  const treeSearchQuery = useFileExplorerStore((s) => s.treeSearchQuery)
  const setTreeSearchQuery = useFileExplorerStore((s) => s.actions.setTreeSearchQuery)
  const closeSearch = useFileExplorerStore((s) => s.actions.closeSearch)

  return (
    <FloatingSearchPanel
      open={isSearchOpen}
      value={treeSearchQuery}
      onValueChange={setTreeSearchQuery}
      onClose={closeSearch}
      placeholder={t('fileExplorer.searchPlaceholder')}
      closeLabel={t('toolbar.cancel')}
      testId="file-search-panel"
    />
  )
}
