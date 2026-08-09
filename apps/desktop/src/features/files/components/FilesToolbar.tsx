import { useTranslation } from '@git-manager/i18n'
import { Input } from '@git-manager/ui'
import { ToolbarButton } from '@git-manager/components'
import { PanelLeft, SearchIcon, X } from 'lucide-react'
import { useFileExplorerStore } from '../stores/fileExplorer.store'

/**
 * The files view's section of the app toolbar: find a file, and show or hide the tree beside it.
 *
 * The search box used to live inside the tree panel, which meant it disappeared with the panel it
 * filtered. Here it is on screen whether the tree is or not — and it is the only search on this
 * view, so nothing competes with it for the word.
 */
export function FilesToolbar() {
  const { t } = useTranslation('git')
  const treeSearchQuery = useFileExplorerStore((s) => s.treeSearchQuery)
  const setTreeSearchQuery = useFileExplorerStore((s) => s.actions.setTreeSearchQuery)
  const isSidebarOpen = useFileExplorerStore((s) => s.isSidebarOpen)
  const toggleSidebar = useFileExplorerStore((s) => s.actions.toggleSidebar)
  const selectedFilePath = useFileExplorerStore((s) => s.selectedFilePath)
  const setSelectedFilePath = useFileExplorerStore((s) => s.actions.setSelectedFilePath)

  return (
    <>
      <Input
        variant="chrome"
        inputSize="sm"
        type="search"
        value={treeSearchQuery}
        onChange={(e) => setTreeSearchQuery(e.target.value)}
        placeholder={t('fileExplorer.searchPlaceholder')}
        aria-label={t('fileExplorer.searchPlaceholder')}
        className="h-7 w-56 shrink-0 text-xs"
        // No colour class: the icon takes the field's own graded pair (see `Input`'s ICON_CLASSES),
        // so it always matches the text and placeholder it sits next to.
        startIcon={<SearchIcon className="h-3.5 w-3.5" />}
        data-testid="file-tree-search-input"
      />

      <div className="mx-1 h-6 w-px shrink-0 bg-border" />

      <ToolbarButton
        icon={
          <PanelLeft
            className={`h-4 w-4 ${isSidebarOpen ? 'text-primary' : 'text-muted-foreground'}`}
          />
        }
        label={isSidebarOpen ? t('fileExplorer.hideSidebar') : t('fileExplorer.showSidebar')}
        onClick={toggleSidebar}
        data-testid="file-explorer-toggle-sidebar"
      />
      {/* Closing the file goes back to the directory listing — the view itself is left by switching
          tab, so this is the only "close" the files view still needs. */}
      {selectedFilePath && (
        <ToolbarButton
          icon={<X className="h-4 w-4 text-muted-foreground" />}
          label={t('fileExplorer.closeFile')}
          onClick={() => setSelectedFilePath(null)}
          data-testid="file-explorer-close-file"
        />
      )}
    </>
  )
}
