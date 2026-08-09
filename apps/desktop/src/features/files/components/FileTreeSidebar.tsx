import { useEffect, useMemo, useRef, useState } from 'react'
import {
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  PanelLeftClose,
  Search,
  X,
} from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import { Button, Input, Tooltip, cn } from '@git-manager/ui'
import { highlightMatch } from '@git-manager/components'
import { useFileExplorerStore } from '../stores/fileExplorer.store'
import { useRepoFiles } from '../hooks/useRepoFiles'
import { buildFileTree, filterFileTree, type FileNode } from '../lib/fileTree'
import { useRepoUIStore } from '../../../stores/repoUI.store'
import { useRepoViewStore } from '../../../stores/repoView.store'
import { useSidebarSearchStore } from '../../../stores/sidebarSearch.store'

function TreeNode({
  node,
  selectedPath,
  onSelect,
  /** Directories render expanded while a search is running, so matches aren't hidden behind folds. */
  forceOpen,
  /**
   * The live search, highlighted inside each name so a row says why it survived the filter.
   *
   * It won't always land on the row you clicked from: the filter matches the **full path**, so
   * `src/Button.tsx` survives a query of `src` with nothing to mark in `Button.tsx`. That is not a
   * gap — the folder above it is the match, it is on screen (the tree renders expanded while
   * searching), and it carries the mark. A query spanning a separator (`components/But`) marks
   * nothing anywhere, which is the honest answer: no single name contains it.
   */
  query,
  level = 0,
}: {
  node: FileNode
  selectedPath: string | null
  onSelect: (path: string) => void
  forceOpen: boolean
  query: string
  level?: number
}) {
  const [isOpen, setIsOpen] = useState(false)
  const expanded = forceOpen || isOpen
  const isSelected = selectedPath === node.path

  const handleClick = () => {
    if (node.isDir) {
      setIsOpen(!expanded)
    } else {
      onSelect(node.path)
    }
  }

  return (
    <div>
      <button
        type="button"
        aria-expanded={node.isDir ? expanded : undefined}
        className={cn(
          'flex w-full cursor-pointer items-center py-1 pr-2 text-left text-xs transition-colors',
          'focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-hidden',
          isSelected
            ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
            : 'text-sidebar-foreground hover:bg-sidebar-accent/50'
        )}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={handleClick}
        data-testid={`file-tree-node-${node.path}`}
      >
        <span className="mr-1 flex h-4 w-4 shrink-0 items-center justify-center text-sidebar-muted-foreground">
          {node.isDir ? (
            expanded ? (
              <ChevronDownIcon size={14} />
            ) : (
              <ChevronRightIcon size={14} />
            )
          ) : null}
        </span>
        <span className="mr-1.5 flex shrink-0 items-center text-sidebar-muted-foreground">
          {node.isDir ? (
            expanded ? (
              <FolderOpenIcon size={14} className="text-primary" />
            ) : (
              <FolderIcon size={14} className="text-primary" />
            )
          ) : (
            <FileIcon size={14} />
          )}
        </span>
        <span className="truncate whitespace-nowrap">{highlightMatch(node.name, query)}</span>
      </button>

      {node.isDir && expanded && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              selectedPath={selectedPath}
              onSelect={onSelect}
              forceOpen={forceOpen}
              query={query}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * The files view's left panel: the repository's working tree, and the field that filters it.
 *
 * It sits on the **left**, where the graph view's branch sidebar sits — a repo tab has one panel
 * slot and each view fills it with its own navigation, rather than the files view adding a second
 * panel on the right and leaving the branch list on the left for a view that has no use for it.
 *
 * **The filter is in the panel, not on the toolbar and not in a floating panel over the listing.**
 * It filters *this* tree and nothing else, so it belongs to it — the same shape the branch sidebar
 * has one view over. The old objection to keeping it here was that folding the panel away took the
 * search with it; ⌘F answers that by restoring the panel and focusing this field, through the same
 * `sidebarSearch.store` request ⌥⌘F already used for the branch filter.
 */
export function FileTreeSidebar() {
  const { t } = useTranslation('git')
  const { activeRepo, activeWorkspacePath } = useRepoUIStore()
  const effectiveRepoPath = activeWorkspacePath ?? activeRepo
  const { data: files } = useRepoFiles(effectiveRepoPath)

  // The panel slot belongs to the shell, not to this view — same flag ⌘S and the toolbar flip.
  const togglePanel = useRepoViewStore((s) => s.togglePanel)
  const selectedFilePath = useFileExplorerStore((s) => s.selectedFilePath)
  const treeSearchQuery = useFileExplorerStore((s) => s.treeSearchQuery)
  const setTreeSearchQuery = useFileExplorerStore((s) => s.actions.setTreeSearchQuery)
  const setSelectedFilePath = useFileExplorerStore((s) => s.actions.setSelectedFilePath)

  // ⌘F on this view, and ⌥⌘F everywhere: both raise the *left panel's* filter, which on the graph
  // is the branch list's and here is this one. One request, whichever panel is in the slot.
  const focusToken = useSidebarSearchStore((s) => s.focusToken)
  const searchInputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (focusToken === 0) return
    searchInputRef.current?.focus()
    searchInputRef.current?.select()
  }, [focusToken])

  const isSearching = treeSearchQuery.trim().length > 0
  const tree = useMemo(
    () => filterFileTree(buildFileTree(files ?? []), treeSearchQuery),
    [files, treeSearchQuery]
  )

  return (
    <div
      className="flex h-full w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar"
      data-testid="file-tree-sidebar"
    >
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-sidebar-border px-2">
        <span className="text-[10px] font-bold tracking-widest text-sidebar-muted-foreground/60 uppercase select-none">
          {t('fileExplorer.filesTitle')}
        </span>
        <Tooltip content={t('fileExplorer.hideSidebar')}>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-sidebar-muted-foreground"
            onClick={togglePanel}
            aria-label={t('fileExplorer.hideSidebar')}
            data-testid="file-tree-hide-sidebar"
          >
            <PanelLeftClose size={14} />
          </Button>
        </Tooltip>
      </div>

      <div className="shrink-0 border-b border-sidebar-border px-2 py-1.5">
        <Input
          ref={searchInputRef}
          variant="chrome"
          type="text"
          value={treeSearchQuery}
          onChange={(e) => setTreeSearchQuery(e.target.value)}
          placeholder={t('fileExplorer.searchPlaceholder')}
          aria-label={t('fileExplorer.searchPlaceholder')}
          className="h-7 text-xs shadow-none"
          // No colour class: the icon takes the field's own graded pair (see `Input`'s
          // ICON_CLASSES), so it always matches the text and placeholder beside it.
          startIcon={<Search className="h-3.5 w-3.5" />}
          endIcon={
            treeSearchQuery ? (
              <button
                onClick={() => setTreeSearchQuery('')}
                aria-label={t('sidebar.clearFilter')}
                className="flex h-4 w-4 cursor-pointer items-center justify-center rounded text-sidebar-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            ) : undefined
          }
          data-testid="file-tree-search-input"
        />
      </div>

      <div className="flex-1 overflow-x-hidden overflow-y-auto">
        <div className="py-2">
          {tree.map((node) => (
            <TreeNode
              key={node.path}
              node={node}
              selectedPath={selectedFilePath}
              onSelect={setSelectedFilePath}
              forceOpen={isSearching}
              query={treeSearchQuery}
            />
          ))}
          {tree.length === 0 && (
            <div
              className="p-4 text-center text-xs text-sidebar-muted-foreground"
              data-testid="file-tree-empty"
            >
              {t('fileExplorer.noFilesFound')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
