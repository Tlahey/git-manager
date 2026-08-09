import { useTranslation } from '@git-manager/i18n'
import { ToolbarButton } from '@git-manager/components'
import { SearchIcon, X } from 'lucide-react'
import { useFileExplorerStore } from '../stores/fileExplorer.store'

/**
 * The files view's section of the app toolbar: find a file, and close the one that is open.
 *
 * The search used to be a field sitting open on this bar (and before that, one inside the tree
 * panel, which meant it vanished with the panel it filtered). It is a button now, like the graph's:
 * a permanent field spends toolbar width on a control that is idle most of the time, and it made
 * "search" look like a different feature on each view — a box here, a button there. The field it
 * opens is `FileSearchPanel`, over the listing it filters.
 *
 * **Showing and hiding the tree is not here** — that button moved to the toolbar shell, because the
 * panel slot belongs to all three views and ⌘S is one gesture. It was this view's own only while
 * this view was the only one that could fold its panel away.
 */
export function FilesToolbar() {
  const { t } = useTranslation('git')
  const toggleSearch = useFileExplorerStore((s) => s.actions.toggleSearch)
  const selectedFilePath = useFileExplorerStore((s) => s.selectedFilePath)
  const setSelectedFilePath = useFileExplorerStore((s) => s.actions.setSelectedFilePath)

  return (
    <>
      {/* Closing the file goes back to the directory listing — the view itself is left by switching
          tab, so this is the only "close" the files view still needs. */}
      {selectedFilePath && (
        <ToolbarButton
          icon={<X className="text-muted-foreground h-4 w-4" />}
          label={t('fileExplorer.closeFile')}
          onClick={() => setSelectedFilePath(null)}
          data-testid="file-explorer-close-file"
        />
      )}

      {/* Last, as on every view: search is the one action all three share, so it sits in the same
          place on each — and a control whose position depends on the view is one you have to look
          for every time you switch. */}
      <ToolbarButton
        icon={<SearchIcon className="text-muted-foreground h-4 w-4" />}
        label={t('toolbar.searchLabel')}
        title={`${t('fileExplorer.searchPlaceholder')} (⌘F)`}
        onClick={toggleSearch}
        data-testid="file-search-button"
      />
    </>
  )
}
