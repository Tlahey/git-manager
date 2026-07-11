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
  Plus,
  Minus,
} from 'lucide-react'
import { apiStageFile, apiUnstageFile, apiDiscardFileChanges } from '../../../api/git.api'
import { useFileTree, getSortedNodes, type TreeNode } from '@git-manager/components'

export interface ProcessedFileItem {
  path: string
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked' | 'conflicted'
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
  /** Shows a checkbox in front of each folder (staging/unstaging every file below it), starts
   * every folder expanded, and adds a "N file(s)" caption under each folder name — the JetBrains
   * "Commit Changes" tree style. Off by default; only meaningful together with `isWip`. */
  folderCheckboxes?: boolean
  /** Replaces the persistent stage checkbox with a +/- button that only appears on hover, at the
   * end of the file/folder row. `'add'` stages (used for an all-unstaged file list), `'remove'`
   * unstages (used for an all-staged file list) — every file in `processedFiles` is assumed to
   * share that same direction. Only meaningful together with `isWip`; takes precedence over the
   * default checkbox and over `folderCheckboxes`. */
  hoverStage?: 'add' | 'remove'
  /** Wraps the whole list in a bordered card and makes its header row collapsible (click to
   * fold away the stats/search/file-tree body, leaving just the title + count) — used to give
   * each working-tree zone (Unmerged/Staged/Unstaged) a distinct, foldable group. Off by default. */
  collapsible?: boolean
  /** Adds a persistent +/- button in the header (next to the title, always visible regardless of
   * collapse state) that bulk stages/unstages every file in this list in one action — the "Stage
   * All"/"Unstage All" equivalent for a single zone. Direction/icon follows `hoverStage`; only
   * meaningful together with it. */
  onBulkStage?: () => void
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
  folderCheckboxes,
  hoverStage,
  collapsible,
  onBulkStage,
}: CommitFileListProps) {
  const { t } = useTranslation('git')
  const [viewMode, setViewMode] = useState<'tree' | 'list'>('tree')
  const [collapsed, setCollapsed] = useState(false)
  const bodyVisible = !collapsible || !collapsed
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
  } = useFileTree(processedFiles, cacheKey ?? `${repoPath}:${commitOid}:${isWip}`, {
    defaultExpanded: folderCheckboxes,
  })

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
    untracked: 'text-muted-foreground font-bold text-xs',
    conflicted: 'text-orange-500 font-bold text-xs'
  }

  const statusLetters: Record<string, string> = {
    added: 'A',
    modified: 'M',
    deleted: 'D',
    renamed: 'R',
    untracked: '?',
    conflicted: 'U'
  }

  function collectDescendantFiles(node: TreeNode): TreeNode[] {
    if (!node.isFolder) return [node]
    if (!node.children) return []
    return Object.values(node.children).flatMap(collectDescendantFiles)
  }

  async function handleToggleFolder(node: TreeNode, allStaged: boolean) {
    const paths = collectDescendantFiles(node).map((f) => f.path)
    if (allStaged) {
      await Promise.all(paths.map((path) => apiUnstageFile(repoPath, path)))
    } else {
      await Promise.all(paths.map((path) => apiStageFile(repoPath, path)))
    }
    onRefresh?.()
  }

  async function handleHoverStageFolder(node: TreeNode) {
    const paths = collectDescendantFiles(node).map((f) => f.path)
    if (hoverStage === 'add') {
      await Promise.all(paths.map((path) => apiStageFile(repoPath, path)))
    } else {
      await Promise.all(paths.map((path) => apiUnstageFile(repoPath, path)))
    }
    onRefresh?.()
  }

  function renderTreeNode(node: TreeNode, depth = 0) {
    const isExpanded = expandedFolders.has(node.path)

    if (node.isFolder) {
      const totalFiles = node.stats
        ? node.stats.added + node.stats.modified + node.stats.deleted + node.stats.renamed
        : 0
      const showFolderCheckbox = folderCheckboxes && isWip
      const descendantFiles = showFolderCheckbox ? collectDescendantFiles(node) : []
      const stagedCount = descendantFiles.filter((f) => f.staged).length
      const allStaged = descendantFiles.length > 0 && stagedCount === descendantFiles.length
      const someStaged = stagedCount > 0 && !allStaged

      return (
        <div key={node.path} className="flex flex-col">
          <div
            onClick={() => toggleFolder(node.path)}
            className="group/folder flex items-center gap-1.5 py-1 px-2 text-xs hover:bg-accent/40 rounded transition-colors text-left font-medium cursor-pointer w-full min-w-0"
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
            {showFolderCheckbox && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleToggleFolder(node, allStaged)
                }}
                className={cn(
                  "h-4 w-4 flex items-center justify-center text-[10px] font-bold border rounded transition-colors shrink-0",
                  allStaged || someStaged
                    ? "bg-primary border-primary text-white"
                    : "border-border hover:border-primary/60 text-transparent hover:text-muted-foreground"
                )}
                title={allStaged ? 'Unstage folder' : 'Stage folder'}
                data-testid={`file-tree-folder-checkbox-${node.path}`}
              >
                {someStaged ? '-' : '✓'}
              </button>
            )}
            {isExpanded ? (
              <FolderOpen className="h-3.5 w-3.5 text-blue-400 shrink-0" />
            ) : (
              <Folder className="h-3.5 w-3.5 text-blue-400 shrink-0" />
            )}
            <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
              <span className="truncate text-foreground/90">{node.name}</span>
              {folderCheckboxes && (
                <span className="shrink-0 text-[10px] font-normal text-muted-foreground/60">
                  {t('commitDetails.fileCount', { count: totalFiles })}
                </span>
              )}
            </div>
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
            {hoverStage && isWip && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleHoverStageFolder(node)
                }}
                className={cn(
                  "p-0.5 border rounded transition-colors shrink-0 ml-2 opacity-0 group-hover/folder:opacity-100",
                  hoverStage === 'add'
                    ? "border-green-500/40 text-green-500 hover:bg-green-500/10"
                    : "border-red-500/40 text-red-500 hover:bg-red-500/10"
                )}
                title={hoverStage === 'add' ? 'Stage folder' : 'Unstage folder'}
                data-testid={`file-tree-folder-hover-stage-${node.path}`}
              >
                {hoverStage === 'add' ? <Plus className="h-2.5 w-2.5" /> : <Minus className="h-2.5 w-2.5" />}
              </button>
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
    // Folder rows gain a checkbox (+ its leading gap) when `folderCheckboxes` is on, pushing
    // their name further right — files need the same extra indent per level to stay aligned
    // under their parent folder's name instead of under its checkbox.
    const indentStep = folderCheckboxes ? 36 : 12
    return (
      <div
        key={node.path}
        className="group/file flex items-center justify-between py-1 px-2 text-xs hover:bg-accent rounded transition-colors cursor-pointer w-full min-w-0"
        style={{ paddingLeft: `${depth * indentStep + 8}px` }}
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
        {/* Left: Stage checkbox (WIP), File Icon and Filename */}
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {!hoverStage && isWip ? (
            <button
              onClick={(e) => {
                e.stopPropagation()
                if (node.staged) handleUnstage(node.path)
                else handleStage(node.path)
              }}
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
          ) : !hoverStage ? (
            <div className="w-3 shrink-0" />
          ) : null}
          <FileText className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
          <span className="font-mono text-[11px] leading-tight text-foreground font-semibold truncate min-w-0 flex-1">{node.name}</span>
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
            <button
              onClick={() => handleDiscard(node.path)}
              className={cn(
                "p-0.5 border rounded border-border text-destructive hover:bg-destructive/10 transition-colors shrink-0",
                hoverStage && "opacity-0 group-hover/file:opacity-100"
              )}
              title="Discard Changes"
            >
              <RotateCcw className="h-2.5 w-2.5" />
            </button>
          )}

          {hoverStage && isWip && (
            <button
              onClick={() => (hoverStage === 'add' ? handleStage(node.path) : handleUnstage(node.path))}
              className={cn(
                "p-0.5 border rounded transition-colors shrink-0 opacity-0 group-hover/file:opacity-100",
                hoverStage === 'add'
                  ? "border-green-500/40 text-green-500 hover:bg-green-500/10"
                  : "border-red-500/40 text-red-500 hover:bg-red-500/10"
              )}
              title={hoverStage === 'add' ? 'Stage' : 'Unstage'}
            >
              {hoverStage === 'add' ? <Plus className="h-2.5 w-2.5" /> : <Minus className="h-2.5 w-2.5" />}
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={cn(collapsible ? "border border-border/40 rounded-lg overflow-hidden" : "space-y-4")}>
      {/* Global Statistics Summary */}
      {!hideStats && bodyVisible && (
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
      {!hideSearch && bodyVisible && (
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
      <div className={collapsible ? "" : "space-y-2"}>
        <div
          onClick={collapsible ? () => setCollapsed((c) => !c) : undefined}
          className={cn(
            "flex items-center justify-between transition-colors",
            collapsible
              ? "bg-muted/15 hover:bg-muted/25 px-3 py-2 cursor-pointer select-none"
              : "bg-muted/10 p-1.5 rounded-lg border border-border/30"
          )}
          role={collapsible ? "button" : undefined}
          tabIndex={collapsible ? 0 : undefined}
          onKeyDown={
            collapsible
              ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') setCollapsed((c) => !c)
                }
              : undefined
          }
          data-testid={collapsible ? "file-list-zone-header" : undefined}
        >
          <div className="flex items-center gap-2 pl-1">
            {collapsible &&
              (collapsed ? (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              ))}
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider select-none">
              {title ?? 'Modifications'}
            </span>
            {onBulkStage && hoverStage && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onBulkStage()
                }}
                className={cn(
                  "h-4 w-4 flex items-center justify-center rounded border transition-colors shrink-0",
                  hoverStage === 'add'
                    ? "border-green-500/40 text-green-500 hover:bg-green-500/10"
                    : "border-red-500/40 text-red-500 hover:bg-red-500/10"
                )}
                title={hoverStage === 'add' ? t('workingTree.stageAll') : t('workingTree.unstageAll')}
                data-testid="file-list-bulk-stage"
              >
                {hoverStage === 'add' ? <Plus className="h-2.5 w-2.5" /> : <Minus className="h-2.5 w-2.5" />}
              </button>
            )}
            {bodyVisible && viewMode === 'tree' && allFolderPaths.size > 0 && (
              <>
                <span className="text-muted-foreground/30 text-[10px] select-none">•</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleToggleExpandAll()
                  }}
                  className="text-[10px] text-primary hover:underline font-semibold"
                >
                  {buttonState === 'expand' ? t('commitDetails.expandAll') : t('commitDetails.collapseAll')}
                </button>
              </>
            )}
          </div>
          {/* Always rendered (even collapsed) so the header row's height stays constant —
              `invisible` hides it without collapsing its box, avoiding layout shift on toggle. */}
          <div
            className={cn(
              "flex items-center border border-border/55 rounded overflow-hidden bg-card",
              !bodyVisible && "invisible"
            )}
            onClick={(e) => e.stopPropagation()}
          >
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
        {bodyVisible && viewMode === 'tree' && (
          <div className={collapsible ? "space-y-0.5 border-t border-border/30 p-2" : "space-y-0.5"}>
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
        {bodyVisible && viewMode === 'list' && (
          <div className={collapsible ? "space-y-0.5 border-t border-border/30 p-2" : "space-y-0.5"}>
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
                  {/* Left: Stage checkbox (WIP), File Icon and Consecutive Path Display */}
                  <div className="flex items-center min-w-0 flex-1 mr-4">
                    {!hoverStage && isWip && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          if (file.staged) handleUnstage(file.path)
                          else handleStage(file.path)
                        }}
                        className={cn(
                          "h-4 w-4 flex items-center justify-center text-[10px] font-bold border rounded transition-colors shrink-0 mr-1.5",
                          file.staged
                            ? "bg-primary border-primary text-white"
                            : "border-border hover:border-primary/60 text-transparent hover:text-muted-foreground"
                        )}
                        title={file.staged ? 'Unstage' : 'Stage'}
                      >
                        ✓
                      </button>
                    )}
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
                      <button
                        onClick={() => handleDiscard(file.path)}
                        className={cn(
                          "p-0.5 border rounded border-border text-destructive hover:bg-destructive/10 transition-colors shrink-0",
                          hoverStage && "opacity-0 group-hover/file:opacity-100"
                        )}
                        title="Discard Changes"
                      >
                        <RotateCcw className="h-2.5 w-2.5" />
                      </button>
                    )}

                    {hoverStage && isWip && (
                      <button
                        onClick={() => (hoverStage === 'add' ? handleStage(file.path) : handleUnstage(file.path))}
                        className={cn(
                          "p-0.5 border rounded transition-colors shrink-0 opacity-0 group-hover/file:opacity-100",
                          hoverStage === 'add'
                            ? "border-green-500/40 text-green-500 hover:bg-green-500/10"
                            : "border-red-500/40 text-red-500 hover:bg-red-500/10"
                        )}
                        title={hoverStage === 'add' ? 'Stage' : 'Unstage'}
                      >
                        {hoverStage === 'add' ? <Plus className="h-2.5 w-2.5" /> : <Minus className="h-2.5 w-2.5" />}
                      </button>
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
