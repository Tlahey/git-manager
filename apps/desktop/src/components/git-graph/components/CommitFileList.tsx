import { useState, useMemo } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Input, cn } from '@git-manager/ui'
import {
  ChevronDown,
  ChevronRight,
  FolderOpen,
  Folder,
  FileText,
  RotateCcw,
  FolderTree,
  List,
  Search,
  X,
} from 'lucide-react'
import { apiStageFile, apiUnstageFile, apiDiscardFileChanges } from '../../../api/git.api'
import { useFileTree, getSortedNodes, type TreeNode } from '../../../hooks/useFileTree'

export interface ProcessedFileItem {
  path: string
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked'
  additions?: number
  deletions?: number
  staged: boolean
}

interface CommitFileListProps {
  repoPath: string
  isWip: boolean
  commitOid: string
  processedFiles: ProcessedFileItem[]
  onSelectFileDiff?: (file: { path: string; staged: boolean; oid?: string }) => void
  onRefresh?: () => void
  /** Overrides the "Modifications" section label (e.g. "Conflicted files"). */
  title?: string
  /** Overrides the empty-state text shown when `processedFiles` is empty. */
  emptyMessage?: string
  /** Hides the "Global Statistics Summary" block — not meaningful for file lists without diff stats. */
  hideStats?: boolean
  /** Hides the filter/search input — not useful for short, fixed lists (e.g. conflict resolution). */
  hideSearch?: boolean
  /** Overrides the `useFileTree` cache key (defaults to `repoPath:commitOid:isWip`) — needed when
   * rendering more than one `CommitFileList` for the same repo/commit (e.g. conflicted + resolved). */
  cacheKey?: string
}

export function CommitFileList({
  repoPath,
  isWip,
  commitOid,
  processedFiles,
  onSelectFileDiff,
  onRefresh,
  title,
  emptyMessage,
  hideStats,
  hideSearch,
  cacheKey,
}: CommitFileListProps) {
  const { t } = useTranslation('git')
  const [viewMode, setViewMode] = useState<'tree' | 'list'>('tree')
  const noChangesLabel = emptyMessage ?? t('workingTree.noChanges')

  // File stats (summary badges, independent of search filtering)
  const fileStats = useMemo(() => {
    let added = 0
    let modified = 0
    let deleted = 0
    let renamed = 0

    processedFiles.forEach((file) => {
      if (file.status === 'added' || file.status === 'untracked') added++
      else if (file.status === 'modified') modified++
      else if (file.status === 'deleted') deleted++
      else if (file.status === 'renamed') renamed++
    })

    return { added, modified, deleted, renamed }
  }, [processedFiles])

  const {
    searchQuery: fileSearchQuery,
    setSearchQuery: setFileSearchQuery,
    filteredFiles,
    treeRoot: fileTreeRoot,
    allFolderPaths,
    expandedFolders,
    buttonState,
    toggleFolder,
    toggleExpandAll: handleToggleExpandAll,
  } = useFileTree(processedFiles, cacheKey ?? `${repoPath}:${commitOid}:${isWip}`)

  // Staging actions
  async function handleStage(file: string) {
    await apiStageFile(repoPath, file)
    onRefresh?.()
  }

  async function handleUnstage(file: string) {
    await apiUnstageFile(repoPath, file)
    onRefresh?.()
  }

  async function handleDiscard(file: string) {
    const ok = window.confirm(t('commitDetails.discardPrompt'))
    if (ok) {
      await apiDiscardFileChanges(repoPath, file)
      onRefresh?.()
    }
  }

  const statusIcons: Record<string, string> = {
    added: 'text-green-500 font-bold text-xs',
    modified: 'text-yellow-500 font-bold text-xs',
    deleted: 'text-red-500 font-bold text-xs',
    renamed: 'text-blue-500 font-bold text-xs',
    untracked: 'text-muted-foreground font-bold text-xs'
  }

  const statusLetters: Record<string, string> = {
    added: 'A',
    modified: 'M',
    deleted: 'D',
    renamed: 'R',
    untracked: '?'
  }

  function renderTreeNode(node: TreeNode, depth = 0) {
    const isExpanded = expandedFolders.has(node.path)

    if (node.isFolder) {
      return (
        <div key={node.path} className="flex flex-col">
          <div
            onClick={() => toggleFolder(node.path)}
            className="flex items-center gap-1.5 py-1 px-2 text-xs hover:bg-accent/40 rounded transition-colors text-left font-medium cursor-pointer w-full min-w-0"
            role="button"
            tabIndex={0}
            data-testid={`file-tree-folder-${node.path}`}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                toggleFolder(node.path)
              }
            }}
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
          >
            {isExpanded ? (
              <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
            )}
            {isExpanded ? (
              <FolderOpen className="h-3.5 w-3.5 text-blue-400 shrink-0" />
            ) : (
              <Folder className="h-3.5 w-3.5 text-blue-400 shrink-0" />
            )}
            <span className="truncate text-foreground/90 flex-1 min-w-0">{node.name}</span>
            {node.stats && (
              <div className="flex items-center gap-1 shrink-0 ml-2 select-none text-[9px] font-bold">
                {node.stats.added > 0 && (
                  <span className="text-green-500 bg-green-500/10 px-1 rounded">
                    +{node.stats.added}
                  </span>
                )}
                {node.stats.modified > 0 && (
                  <span className="text-yellow-500 bg-yellow-500/10 px-1 rounded">
                    ~{node.stats.modified}
                  </span>
                )}
                {node.stats.deleted > 0 && (
                  <span className="text-red-500 bg-red-500/10 px-1 rounded">
                    -{node.stats.deleted}
                  </span>
                )}
                {node.stats.renamed > 0 && (
                  <span className="text-blue-500 bg-blue-500/10 px-1 rounded">
                    →{node.stats.renamed}
                  </span>
                )}
              </div>
            )}
          </div>
          {isExpanded && node.children && (
            <div className="flex flex-col">
              {getSortedNodes(node.children).map((child) =>
                renderTreeNode(child, depth + 1)
              )}
            </div>
          )}
        </div>
      )
    }

    const fileStatus = node.status ?? 'modified'
    return (
      <div
        key={node.path}
        className="group/file flex items-center justify-between py-1 px-2 text-xs hover:bg-accent rounded transition-colors cursor-pointer w-full min-w-0"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() =>
          onSelectFileDiff?.({
            path: node.path,
            staged: node.staged ?? false,
            oid: isWip ? undefined : commitOid
          })
        }
        role="button"
        tabIndex={0}
        data-testid={`file-tree-file-${node.path}`}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            onSelectFileDiff?.({
              path: node.path,
              staged: node.staged ?? false,
              oid: isWip ? undefined : commitOid
            })
          }
        }}
      >
        {/* Left: File Icon and Filename */}
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <div className="w-3 shrink-0" />
          <FileText className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
          <span className="font-mono text-foreground truncate min-w-0 flex-1">{node.name}</span>
        </div>

        {/* Right: Stats, Status, WIP Actions */}
        <div className="flex items-center gap-2 shrink-0 ml-2" onClick={(e) => e.stopPropagation()}>
          {node.additions !== undefined && node.deletions !== undefined && (
            <span className="text-[10px] text-muted-foreground/70 scale-90 select-none shrink-0 flex items-center gap-0.5">
              <span className="text-green-500">+{node.additions}</span>
              <span className="text-red-500">-{node.deletions}</span>
            </span>
          )}

          <span className={cn(statusIcons[fileStatus], "shrink-0 min-w-[12px] text-center select-none")}>
            {statusLetters[fileStatus]}
          </span>

          {isWip && (
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => (node.staged ? handleUnstage(node.path) : handleStage(node.path))}
                className={cn(
                  "h-4 w-4 flex items-center justify-center text-[10px] font-bold border rounded transition-colors shrink-0",
                  node.staged
                    ? "bg-primary border-primary text-white"
                    : "border-border hover:border-primary/60 text-transparent hover:text-muted-foreground"
                )}
                title={node.staged ? 'Unstage' : 'Stage'}
              >
                ✓
              </button>
              <button
                onClick={() => handleDiscard(node.path)}
                className="p-0.5 border rounded border-border text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                title="Discard Changes"
              >
                <RotateCcw className="h-2.5 w-2.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Global Statistics Summary */}
      {!hideStats && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
              Stats Summary
            </span>
            <span className="text-[10px] font-semibold text-muted-foreground bg-muted/65 px-1.5 py-0.5 rounded border border-border/40 font-mono">
              {filteredFiles.length} {filteredFiles.length === 1 ? 'file' : 'files'} changed
            </span>
          </div>
          <div className="flex flex-wrap gap-2 text-[10px] font-medium text-muted-foreground bg-muted/5 p-2 rounded-md border border-border/20">
            {fileStats.added > 0 && (
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                <span>{fileStats.added} {t('commitDetails.stats.added') || 'added'}</span>
              </span>
            )}
            {fileStats.modified > 0 && (
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-yellow-500" />
                <span>{fileStats.modified} {t('commitDetails.stats.modified') || 'modified'}</span>
              </span>
            )}
            {fileStats.deleted > 0 && (
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                <span>{fileStats.deleted} {t('commitDetails.stats.deleted') || 'deleted'}</span>
              </span>
            )}
            {fileStats.renamed > 0 && (
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-blue-500" />
                <span>{fileStats.renamed} {t('commitDetails.stats.renamed') || 'renamed'}</span>
              </span>
            )}
            {processedFiles.length === 0 && (
              <span className="italic text-muted-foreground/60">{noChangesLabel}</span>
            )}
          </div>
        </div>
      )}

      {/* Search bar inside files */}
      {!hideSearch && (
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            type="text"
            placeholder={t('commitDetails.searchFiles') || "Filter files..."}
            value={fileSearchQuery}
            onChange={(e) => setFileSearchQuery(e.target.value)}
            className="pl-8 h-8 text-xs font-mono"
          />
          {fileSearchQuery && (
            <button
              onClick={() => setFileSearchQuery('')}
              className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {/* FILES TREE OR LIST VIEW */}
      <div className="space-y-2">
        <div className="flex items-center justify-between bg-muted/10 p-1.5 rounded-lg border border-border/30">
          <div className="flex items-center gap-2 pl-1">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider select-none">
              {title ?? 'Modifications'}
            </span>
            {viewMode === 'tree' && allFolderPaths.size > 0 && (
              <>
                <span className="text-muted-foreground/30 text-[10px] select-none">•</span>
                <button
                  onClick={handleToggleExpandAll}
                  className="text-[10px] text-primary hover:underline font-semibold"
                >
                  {buttonState === 'expand' ? t('commitDetails.expandAll') : t('commitDetails.collapseAll')}
                </button>
              </>
            )}
          </div>
          <div className="flex items-center border border-border/55 rounded overflow-hidden bg-card">
            <button
              onClick={() => setViewMode('tree')}
              className={`p-1.5 transition-all ${
                viewMode === 'tree' ? 'bg-primary text-white' : 'hover:bg-accent text-muted-foreground'
              }`}
              title={t('commitDetails.viewModeTree') || "Tree structure"}
            >
              <FolderTree className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 transition-all ${
                viewMode === 'list' ? 'bg-primary text-white' : 'hover:bg-accent text-muted-foreground'
              }`}
              title={t('commitDetails.viewModeList') || "Flat list"}
            >
              <List className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Tree rendering */}
        {viewMode === 'tree' && (
          <div className="space-y-0.5">
            {filteredFiles.length === 0 ? (
              <p className="text-[11px] text-muted-foreground/70 italic px-2 py-1">
                {noChangesLabel}
              </p>
            ) : (
              getSortedNodes(fileTreeRoot).map((node) => renderTreeNode(node))
            )}
          </div>
        )}

        {/* List rendering */}
        {viewMode === 'list' && (
          <div className="space-y-0.5">
            {filteredFiles.length === 0 ? (
              <p className="text-[11px] text-muted-foreground/70 italic px-2 py-1">
                {noChangesLabel}
              </p>
            ) : (
              filteredFiles.map((file) => (
                <div
                  key={file.path}
                  className="group/file flex items-center justify-between py-1 px-2 text-xs hover:bg-accent rounded transition-colors cursor-pointer w-full min-w-0"
                  onClick={() =>
                    onSelectFileDiff?.({
                      path: file.path,
                      staged: file.staged,
                      oid: isWip ? undefined : commitOid
                    })
                  }
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      onSelectFileDiff?.({
                        path: file.path,
                        staged: file.staged,
                        oid: isWip ? undefined : commitOid
                      })
                    }
                  }}
                >
                  {/* Left: File Icon and Consecutive Path Display */}
                  <div className="flex items-center min-w-0 flex-1 mr-4">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0 mr-1.5" />
                    <div className="min-w-0 flex-1 flex items-center font-mono text-[11px] leading-tight select-text overflow-hidden">
                      {(() => {
                        const lastSlash = file.path.lastIndexOf('/')
                        if (lastSlash === -1) {
                          return <span className="text-foreground font-semibold truncate min-w-0 flex-1">{file.path}</span>
                        }
                        const dir = file.path.substring(0, lastSlash + 1)
                        const name = file.path.substring(lastSlash + 1)
                        return (
                          <>
                            <span className="text-muted-foreground/45 truncate min-w-0 shrink pr-0.5">{dir}</span>
                            <span className="text-foreground font-semibold shrink-0">{name}</span>
                          </>
                        )
                      })()}
                    </div>
                  </div>

                  {/* Right: Stats, Status Letter, WIP Actions */}
                  <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {file.additions !== undefined && file.deletions !== undefined && (
                      <span className="text-[10px] text-muted-foreground/70 scale-90 select-none shrink-0 flex items-center gap-0.5">
                        <span className="text-green-500">+{file.additions}</span>
                        <span className="text-red-500">-{file.deletions}</span>
                      </span>
                    )}

                    <span className={cn(statusIcons[file.status], "shrink-0 min-w-[12px] text-center select-none")}>
                      {statusLetters[file.status]}
                    </span>

                    {isWip && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() =>
                            file.staged ? handleUnstage(file.path) : handleStage(file.path)
                          }
                          className={cn(
                            "h-4 w-4 flex items-center justify-center text-[10px] font-bold border rounded transition-colors shrink-0",
                            file.staged
                              ? "bg-primary border-primary text-white"
                              : "border-border hover:border-primary/60 text-transparent hover:text-muted-foreground"
                          )}
                          title={file.staged ? 'Unstage' : 'Stage'}
                        >
                          ✓
                        </button>
                        <button
                          onClick={() => handleDiscard(file.path)}
                          className="p-0.5 border rounded border-border text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                          title="Discard Changes"
                        >
                          <RotateCcw className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
