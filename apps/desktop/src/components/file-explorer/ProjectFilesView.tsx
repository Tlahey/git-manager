import React, { useMemo } from 'react'
import { FileIcon, FolderIcon, ChevronRightIcon, PanelRightOpen, X } from 'lucide-react'
import { useFileExplorerStore } from '../../stores/fileExplorer.store'
import { useRepoUIStore } from '../../stores/repoUI.store'
import { useRepoFiles } from '../../hooks/useRepoFiles'
import { useGitStatus } from '../../hooks/useGitStatus'
import { buildFileTree } from './utils'
import { DiffViewCenter } from '../git-graph/DiffViewCenter'

const isImageFile = (path: string | null) => 
  Boolean(path && /\.(png|jpe?g|gif|webp|svg|ico)$/i.test(path))

export function ProjectFilesView() {
  const { activeRepo, activeWorkspacePath } = useRepoUIStore()
  const effectiveRepoPath = activeWorkspacePath ?? activeRepo
  
  const { data: files } = useRepoFiles(effectiveRepoPath)
  const { data: gitStatus } = useGitStatus(effectiveRepoPath!)
  
  const selectedFilePath = useFileExplorerStore((s: any) => s.selectedFilePath)
  const currentDirPath = useFileExplorerStore((s: any) => s.currentDirPath)
  const setCurrentDirPath = useFileExplorerStore((s: any) => s.actions.setCurrentDirPath)
  const setSelectedFilePath = useFileExplorerStore((s: any) => s.actions.setSelectedFilePath)
  const toggleOpen = useFileExplorerStore((s: any) => s.actions.toggleOpen)
  const isSidebarOpen = useFileExplorerStore((s: any) => s.isSidebarOpen)
  const toggleSidebar = useFileExplorerStore((s: any) => s.actions.toggleSidebar)
  const setActiveDiffFile = useRepoUIStore((s: any) => s.setActiveDiffFile)

  React.useEffect(() => {
    // If no file is selected in the explorer, ensure global state is cleared
    if (!selectedFilePath) {
      setActiveDiffFile(null)
    }
    
    // Clear the active file globally when closing the file explorer
    // so it doesn't leak into the GitGraph view.
    return () => {
      setActiveDiffFile(null)
    }
  }, [selectedFilePath, setActiveDiffFile])

  const isStagedOnly = useMemo(() => {
    if (!selectedFilePath || !gitStatus) return false
    const isStaged = gitStatus.staged.some((f) => f.path === selectedFilePath)
    const isUnstaged = gitStatus.unstaged.some((f) => f.path === selectedFilePath)
    return isStaged && !isUnstaged
  }, [selectedFilePath, gitStatus])

  const isUnmodified = useMemo(() => {
    if (!selectedFilePath || !gitStatus) return false
    const isStaged = gitStatus.staged.some((f) => f.path === selectedFilePath)
    const isUnstaged = gitStatus.unstaged.some((f) => f.path === selectedFilePath)
    return !isStaged && !isUnstaged
  }, [selectedFilePath, gitStatus])

  const tree = useMemo(() => buildFileTree(files || []), [files])

  // Get nodes in current directory
  const currentNodes = useMemo(() => {
    if (!currentDirPath) return tree
    
    const parts = currentDirPath.split('/')
    let current = tree
    
    for (const part of parts) {
      const node = current.find(n => n.name === part && n.isDir)
      if (node && node.children) {
        current = node.children
      } else {
        return []
      }
    }
    return current
  }, [tree, currentDirPath])

  const handleBreadcrumbClick = (index: number) => {
    if (index === -1) {
      setCurrentDirPath('')
    } else {
      const parts = currentDirPath.split('/')
      setCurrentDirPath(parts.slice(0, index + 1).join('/'))
    }
  }

  const breadcrumbs = currentDirPath ? currentDirPath.split('/') : []

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden bg-white dark:bg-neutral-900" data-testid="project-files-view">
      {/* Breadcrumb Header */}
      <div className="flex h-12 shrink-0 items-center border-b border-neutral-200 px-4 text-sm dark:border-neutral-800">
        <span 
          className="cursor-pointer font-medium text-blue-600 hover:underline dark:text-blue-400"
          onClick={() => handleBreadcrumbClick(-1)}
        >
          {effectiveRepoPath?.split('/').pop()}
        </span>
        
        {breadcrumbs.map((part: string, i: number) => (
          <React.Fragment key={i}>
            <ChevronRightIcon size={16} className="mx-1 text-neutral-400" />
            <span 
              className={`cursor-pointer hover:underline ${i === breadcrumbs.length - 1 && !selectedFilePath ? 'font-semibold text-neutral-900 dark:text-neutral-100' : 'text-blue-600 dark:text-blue-400'}`}
              onClick={() => handleBreadcrumbClick(i)}
            >
              {part}
            </span>
          </React.Fragment>
        ))}

        {selectedFilePath && (
          <>
            <ChevronRightIcon size={16} className="mx-1 text-neutral-400" />
            <span className="font-semibold text-neutral-900 dark:text-neutral-100">
              {selectedFilePath.split('/').pop()}
            </span>
          </>
        )}
        
        <div className="ml-auto flex items-center gap-2">
          <button 
            onClick={toggleOpen}
            className="rounded p-1 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
            title="Fermer l'explorateur"
          >
            <X size={16} />
          </button>
          {!isSidebarOpen && (
            <button 
              onClick={toggleSidebar}
              className="rounded p-1 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
              title="Afficher le panneau latéral"
            >
              <PanelRightOpen size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {selectedFilePath ? (
          <DiffViewCenter
            repoPath={effectiveRepoPath!}
            file={{ 
              path: selectedFilePath, 
              staged: isStagedOnly, 
              initialTab: isImageFile(selectedFilePath) ? 'preview' : 'file',
              unmodified: isUnmodified
            }}
            onClose={() => setSelectedFilePath(null)}
          />
        ) : (
          <div className="h-full overflow-y-auto">
            <table className="w-full text-left text-sm text-neutral-700 dark:text-neutral-300">
              <thead className="sticky top-0 bg-neutral-50 dark:bg-neutral-800/50">
                <tr>
                  <th className="px-4 py-2 font-medium">Name</th>
                </tr>
              </thead>
              <tbody>
                {currentNodes.map((node) => (
                  <tr 
                    key={node.path}
                    className="cursor-pointer border-b border-neutral-100 hover:bg-neutral-50 dark:border-neutral-800/50 dark:hover:bg-neutral-800/50"
                    onClick={() => {
                      if (node.isDir) {
                        setCurrentDirPath(node.path)
                      } else {
                        setSelectedFilePath(node.path)
                      }
                    }}
                  >
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        {node.isDir ? (
                          <FolderIcon size={16} className="text-blue-400" />
                        ) : (
                          <FileIcon size={16} className="text-neutral-400" />
                        )}
                        <span className={node.isDir ? 'font-medium text-blue-600 dark:text-blue-400' : ''}>
                          {node.name}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
                {currentNodes.length === 0 && (
                  <tr>
                    <td className="px-4 py-8 text-center text-neutral-500">This directory is empty.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
