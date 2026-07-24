import React, { useMemo, useState } from 'react'
import { FileIcon, FolderIcon, FolderOpenIcon, SearchIcon, ChevronRightIcon, ChevronDownIcon, PanelRightClose } from 'lucide-react'
import { useFileExplorerStore } from '../../stores/fileExplorer.store'
import { useRepoFiles } from '../../hooks/useRepoFiles'
import { buildFileTree, FileNode } from './utils'
import { useRepoUIStore } from '../../stores/repoUI.store'

function TreeNode({
  node,
  selectedPath,
  onSelect,
  level = 0,
}: {
  node: FileNode
  selectedPath: string | null
  onSelect: (path: string) => void
  level?: number
}) {
  const [isOpen, setIsOpen] = useState(false)
  const isSelected = selectedPath === node.path

  const toggleOpen = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsOpen(!isOpen)
  }

  const handleClick = () => {
    if (node.isDir) {
      setIsOpen(!isOpen)
    } else {
      onSelect(node.path)
    }
  }

  return (
    <div>
      <div
        className={`group flex cursor-pointer items-center py-1 pr-2 text-sm transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
          isSelected ? 'bg-primary-50 text-primary-900 dark:bg-primary-900/30 dark:text-primary-100' : 'text-neutral-700 dark:text-neutral-300'
        }`}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={handleClick}
        data-testid={`file-tree-node-${node.path}`}
      >
        <div className="flex h-4 w-4 shrink-0 items-center justify-center mr-1 text-neutral-400">
          {node.isDir ? (
            <div onClick={toggleOpen} className="p-0.5 hover:text-neutral-700 dark:hover:text-neutral-200">
              {isOpen ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
            </div>
          ) : null}
        </div>
        <div className="mr-1.5 flex shrink-0 items-center text-neutral-500 dark:text-neutral-400">
          {node.isDir ? (
            isOpen ? <FolderOpenIcon size={14} className="text-blue-400" /> : <FolderIcon size={14} className="text-blue-400" />
          ) : (
            <FileIcon size={14} />
          )}
        </div>
        <span className="truncate whitespace-nowrap">{node.name}</span>
      </div>

      {node.isDir && isOpen && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              selectedPath={selectedPath}
              onSelect={onSelect}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function FileTreeSidebar() {
  const { activeRepo, activeWorkspacePath } = useRepoUIStore()
  const effectiveRepoPath = activeWorkspacePath ?? activeRepo
  const { data: files } = useRepoFiles(effectiveRepoPath)
  
  const toggleSidebar = useFileExplorerStore((s: any) => s.actions.toggleSidebar)
  const selectedFilePath = useFileExplorerStore((s: any) => s.selectedFilePath)
  const treeSearchQuery = useFileExplorerStore((s: any) => s.treeSearchQuery)
  const setSelectedFilePath = useFileExplorerStore((s: any) => s.actions.setSelectedFilePath)
  const setTreeSearchQuery = useFileExplorerStore((s: any) => s.actions.setTreeSearchQuery)

  const filteredTree = useMemo(() => {
    if (!files) return []
    let filteredFiles = files
    if (treeSearchQuery) {
      const q = treeSearchQuery.toLowerCase()
      filteredFiles = files.filter((f: string) => f.toLowerCase().includes(q))
    }
    return buildFileTree(filteredFiles)
  }, [files, treeSearchQuery])

  return (
    <div 
      className="flex h-full w-64 shrink-0 flex-col border-l border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900"
      data-testid="file-tree-sidebar"
    >
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-neutral-200 px-3 dark:border-neutral-800">
        <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Files</span>
        <button 
          onClick={toggleSidebar}
          className="rounded p-1 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
          title="Masquer le panneau latéral"
        >
          <PanelRightClose size={14} />
        </button>
      </div>
      
      <div className="shrink-0 p-2">
        <div className="relative">
          <SearchIcon className="absolute left-2 top-1.5 h-4 w-4 text-neutral-400" />
          <input
            type="text"
            placeholder="Search files..."
            value={treeSearchQuery}
            onChange={(e) => setTreeSearchQuery(e.target.value)}
            className="w-full rounded-md border border-neutral-200 bg-white py-1 pl-8 pr-2 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
            data-testid="file-tree-search-input"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="py-2">
          {filteredTree.map((node) => (
            <TreeNode
              key={node.path}
              node={node}
              selectedPath={selectedFilePath}
              onSelect={setSelectedFilePath}
            />
          ))}
          {filteredTree.length === 0 && (
            <div className="p-4 text-center text-sm text-neutral-500">
              No files found
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
