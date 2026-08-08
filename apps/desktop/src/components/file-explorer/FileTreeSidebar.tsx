import { useMemo, useState } from 'react'
import {
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
  SearchIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  PanelRightClose,
} from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import { Button, Input, Tooltip, cn } from '@git-manager/ui'
import { useFileExplorerStore } from '../../stores/fileExplorer.store'
import { useRepoFiles } from '../../hooks/useRepoFiles'
import { buildFileTree, filterFileTree, type FileNode } from './utils'
import { useRepoUIStore } from '../../stores/repoUI.store'

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
          'focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring',
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

export function FileTreeSidebar() {
  const { t } = useTranslation('git')
  const { activeRepo, activeWorkspacePath } = useRepoUIStore()
  const effectiveRepoPath = activeWorkspacePath ?? activeRepo
  const { data: files } = useRepoFiles(effectiveRepoPath)

  const toggleSidebar = useFileExplorerStore((s) => s.actions.toggleSidebar)
  const selectedFilePath = useFileExplorerStore((s) => s.selectedFilePath)
  const treeSearchQuery = useFileExplorerStore((s) => s.treeSearchQuery)
  const setSelectedFilePath = useFileExplorerStore((s) => s.actions.setSelectedFilePath)
  const setTreeSearchQuery = useFileExplorerStore((s) => s.actions.setTreeSearchQuery)

  const isSearching = treeSearchQuery.trim().length > 0
  const tree = useMemo(
    () => filterFileTree(buildFileTree(files ?? []), treeSearchQuery),
    [files, treeSearchQuery]
  )

  return (
    <div
      className="flex h-full w-64 shrink-0 flex-col border-l border-sidebar-border bg-sidebar"
      data-testid="file-tree-sidebar"
    >
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-sidebar-border px-3">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-sidebar-muted-foreground">
          {t('fileExplorer.filesTitle')}
        </span>
        <Tooltip content={t('fileExplorer.hideSidebar')}>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-sidebar-muted-foreground"
            onClick={toggleSidebar}
            aria-label={t('fileExplorer.hideSidebar')}
            data-testid="file-tree-hide-sidebar"
          >
            <PanelRightClose size={14} />
          </Button>
        </Tooltip>
      </div>

      <div className="shrink-0 p-2">
        <Input
          variant="chrome"
          inputSize="sm"
          type="search"
          placeholder={t('fileExplorer.searchPlaceholder')}
          aria-label={t('fileExplorer.searchPlaceholder')}
          value={treeSearchQuery}
          onChange={(e) => setTreeSearchQuery(e.target.value)}
          // No colour class: the icon takes the field's own graded pair (see `Input`'s ICON_CLASSES),
          // so it always matches the text and placeholder it sits next to.
          startIcon={<SearchIcon className="h-3.5 w-3.5" />}
          data-testid="file-tree-search-input"
        />
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden">
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
