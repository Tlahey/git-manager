import { useMemo, useState } from 'react'
import {
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  PanelLeftClose,
} from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import { Button, Tooltip, cn } from '@git-manager/ui'
import { useFileExplorerStore } from '../stores/fileExplorer.store'
import { useRepoFiles } from '../hooks/useRepoFiles'
import { buildFileTree, filterFileTree, type FileNode } from '../lib/fileTree'
import { useRepoUIStore } from '../../../stores/repoUI.store'

function TreeNode({
  node,
  selectedPath,
  onSelect,
  /** Directories render expanded while a search is running, so matches aren't hidden behind folds. */
  forceOpen,
  level = 0,
}: {
  node: FileNode
  selectedPath: string | null
  onSelect: (path: string) => void
  forceOpen: boolean
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
          'focus-visible:ring-ring focus-visible:ring-1 focus-visible:outline-hidden',
          isSelected
            ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
            : 'text-sidebar-foreground hover:bg-sidebar-accent/50'
        )}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={handleClick}
        data-testid={`file-tree-node-${node.path}`}
      >
        <span className="text-sidebar-muted-foreground mr-1 flex h-4 w-4 shrink-0 items-center justify-center">
          {node.isDir ? (
            expanded ? (
              <ChevronDownIcon size={14} />
            ) : (
              <ChevronRightIcon size={14} />
            )
          ) : null}
        </span>
        <span className="text-sidebar-muted-foreground mr-1.5 flex shrink-0 items-center">
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
        <span className="truncate whitespace-nowrap">{node.name}</span>
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
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * The files view's left panel: the repository's working tree, filtered by whatever the toolbar's
 * search box holds.
 *
 * It sits on the **left**, where the graph view's branch sidebar sits — a repo tab has one panel
 * slot and each view fills it with its own navigation, rather than the files view adding a second
 * panel on the right and leaving the branch list on the left for a view that has no use for it.
 */
export function FileTreeSidebar() {
  const { t } = useTranslation('git')
  const { activeRepo, activeWorkspacePath } = useRepoUIStore()
  const effectiveRepoPath = activeWorkspacePath ?? activeRepo
  const { data: files } = useRepoFiles(effectiveRepoPath)

  const toggleSidebar = useFileExplorerStore((s) => s.actions.toggleSidebar)
  const selectedFilePath = useFileExplorerStore((s) => s.selectedFilePath)
  const treeSearchQuery = useFileExplorerStore((s) => s.treeSearchQuery)
  const setSelectedFilePath = useFileExplorerStore((s) => s.actions.setSelectedFilePath)

  const isSearching = treeSearchQuery.trim().length > 0
  const tree = useMemo(
    () => filterFileTree(buildFileTree(files ?? []), treeSearchQuery),
    [files, treeSearchQuery]
  )

  return (
    <div
      className="border-sidebar-border bg-sidebar flex h-full w-64 shrink-0 flex-col border-r"
      data-testid="file-tree-sidebar"
    >
      <div className="border-sidebar-border flex h-9 shrink-0 items-center justify-between border-b px-2">
        <span className="text-sidebar-muted-foreground/60 text-[10px] font-bold tracking-widest uppercase select-none">
          {t('fileExplorer.filesTitle')}
        </span>
        <Tooltip content={t('fileExplorer.hideSidebar')}>
          <Button
            variant="ghost"
            size="icon"
            className="text-sidebar-muted-foreground h-6 w-6"
            onClick={toggleSidebar}
            aria-label={t('fileExplorer.hideSidebar')}
            data-testid="file-tree-hide-sidebar"
          >
            <PanelLeftClose size={14} />
          </Button>
        </Tooltip>
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
            />
          ))}
          {tree.length === 0 && (
            <div
              className="text-sidebar-muted-foreground p-4 text-center text-xs"
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
