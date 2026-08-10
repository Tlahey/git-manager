import { useState, useMemo } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { FILE_STATUS_LETTER, FILE_STATUS_COLOR } from '../../lib/fileStatusStyle'
import { FilePathLabel } from './FilePathLabel'
import { Input, Tag, ToggleGroup, cn } from '@git-manager/ui'
import {
  ChevronDown,
  ChevronRight,
  FileText,
  RotateCcw,
  FolderTree,
  List,
  Search,
  X,
  Plus,
  Minus,
  Pencil,
  ArrowRight,
  Check,
} from 'lucide-react'
import { apiStageFile, apiUnstageFile, apiDiscardFileChanges } from '../../api/git.api'
import {
  useFileTree,
  getSortedNodes,
  collectDescendantFiles,
  useConfirm,
  type TreeNode,
} from '@git-manager/components'
import { FileTreeNode } from './FileTreeNode'
import type { FileTreeRowContext } from './fileTreeRowContext'

export interface ProcessedFileItem {
  path: string
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked' | 'conflicted'
  additions?: number
  deletions?: number
  staged: boolean
  /** Generic per-file "reviewed" flag (e.g. GitHub's PR file-viewed state) — renders a small check
   * in front of the filename when true. Purely a passive indicator; toggling it is the caller's
   * responsibility (this list has no click handler for it). */
  viewed?: boolean
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
  /** Overrides the bulk-stage button's testid (defaults to `file-list-bulk-stage`) — needed when
   * more than one zone in the same view renders one (e.g. the staged zone's unstage-all button and
   * the unstaged zone's stage-all button), since they'd otherwise share the same testid. */
  bulkStageTestId?: string
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
  bulkStageTestId = 'file-list-bulk-stage',
}: CommitFileListProps) {
  const { t } = useTranslation('git')
  const { confirm, confirmDialog } = useConfirm()
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
    const ok = await confirm({
      title: t('commitDetails.discardTitle'),
      description: t('commitDetails.discardPrompt'),
      confirmLabel: t('commitDetails.discardConfirm'),
      cancelLabel: t('common:actions.cancel'),
      destructive: true,
      testId: 'discard-file-confirm-dialog',
    })
    if (ok) {
      await apiDiscardFileChanges(repoPath, file)
      onRefresh?.()
    }
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

  const rowContext: FileTreeRowContext = {
    isWip,
    commitOid,
    folderCheckboxes,
    hoverStage,
    expandedFolders,
    toggleFolder,
    onSelectFileDiff,
    onStage: handleStage,
    onUnstage: handleUnstage,
    onDiscard: handleDiscard,
    onToggleFolderStage: handleToggleFolder,
    onHoverStageFolder: handleHoverStageFolder,
  }

  return (
    <div
      className={cn(
        collapsible ? 'overflow-hidden rounded-lg border border-border/40' : 'space-y-4'
      )}
    >
      {/* Global Statistics Summary */}
      {!hideStats && bodyVisible && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="block text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
              Stats Summary
            </span>
            <span className="rounded border border-border/40 bg-muted/65 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground">
              {filteredFiles.length} {filteredFiles.length === 1 ? 'file' : 'files'} changed
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5 rounded-md border border-border/20 bg-muted/5 p-2">
            {fileStats.added > 0 && (
              <Tag
                tone="success"
                title={`${fileStats.added} ${t('commitDetails.stats.added') || 'added'}`}
              >
                <Plus className="h-3 w-3" />
                {fileStats.added}
              </Tag>
            )}
            {fileStats.modified > 0 && (
              <Tag
                tone="warning"
                title={`${fileStats.modified} ${t('commitDetails.stats.modified') || 'modified'}`}
              >
                <Pencil className="h-3 w-3" />
                {fileStats.modified}
              </Tag>
            )}
            {fileStats.deleted > 0 && (
              <Tag
                tone="danger"
                title={`${fileStats.deleted} ${t('commitDetails.stats.deleted') || 'deleted'}`}
              >
                <Minus className="h-3 w-3" />
                {fileStats.deleted}
              </Tag>
            )}
            {fileStats.renamed > 0 && (
              <Tag
                tone="info"
                title={`${fileStats.renamed} ${t('commitDetails.stats.renamed') || 'renamed'}`}
              >
                <ArrowRight className="h-3 w-3" />
                {fileStats.renamed}
              </Tag>
            )}
            {processedFiles.length === 0 && (
              <span className="text-[10px] text-muted-foreground/60 italic">{noChangesLabel}</span>
            )}
          </div>
        </div>
      )}

      {/* Search bar inside files */}
      {!hideSearch && bodyVisible && (
        <div className="relative">
          <Search className="absolute top-2.5 left-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            type="text"
            placeholder={t('commitDetails.searchFiles') || 'Filter files...'}
            value={fileSearchQuery}
            onChange={(e) => setFileSearchQuery(e.target.value)}
            className="h-8 pl-8 font-mono text-xs"
          />
          {fileSearchQuery && (
            <button
              onClick={() => setFileSearchQuery('')}
              className="absolute top-2.5 right-2.5 cursor-pointer text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {/* FILES TREE OR LIST VIEW */}
      <div className={collapsible ? '' : 'space-y-2'}>
        <div
          onClick={collapsible ? () => setCollapsed((c) => !c) : undefined}
          className={cn(
            'flex items-center justify-between transition-colors',
            collapsible
              ? 'cursor-pointer bg-muted/15 px-3 py-2 select-none hover:bg-muted/25'
              : 'rounded-lg border border-border/30 bg-muted/10 p-1.5'
          )}
          role={collapsible ? 'button' : undefined}
          tabIndex={collapsible ? 0 : undefined}
          onKeyDown={
            collapsible
              ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') setCollapsed((c) => !c)
                }
              : undefined
          }
          data-testid={collapsible ? 'file-list-zone-header' : undefined}
        >
          <div className="flex items-center gap-2 pl-1">
            {collapsible &&
              (collapsed ? (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              ))}
            <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase select-none">
              {title ?? t('commitFileList.modifications')}
            </span>
            {onBulkStage && hoverStage && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onBulkStage()
                }}
                className={cn(
                  'flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded border transition-colors',
                  hoverStage === 'add'
                    ? 'border-green-500/40 text-green-500 hover:bg-green-500/10'
                    : 'border-red-500/40 text-red-500 hover:bg-red-500/10'
                )}
                title={
                  hoverStage === 'add' ? t('workingTree.stageAll') : t('workingTree.unstageAll')
                }
                data-testid={bulkStageTestId}
              >
                {hoverStage === 'add' ? (
                  <Plus className="h-2.5 w-2.5" />
                ) : (
                  <Minus className="h-2.5 w-2.5" />
                )}
              </button>
            )}
            {bodyVisible && viewMode === 'tree' && allFolderPaths.size > 0 && (
              <>
                <span className="text-[10px] text-muted-foreground/30 select-none">•</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleToggleExpandAll()
                  }}
                  className="cursor-pointer text-[10px] font-semibold text-primary hover:underline"
                >
                  {buttonState === 'expand'
                    ? t('commitDetails.expandAll')
                    : t('commitDetails.collapseAll')}
                </button>
              </>
            )}
          </div>
          {/* Always rendered (even collapsed) so the header row's height stays constant —
              `invisible` hides it without collapsing its box, avoiding layout shift on toggle. */}
          <div className={cn(!bodyVisible && 'invisible')} onClick={(e) => e.stopPropagation()}>
            <ToggleGroup
              value={viewMode}
              onValueChange={setViewMode}
              options={[
                {
                  value: 'tree',
                  icon: <FolderTree className="h-3.5 w-3.5" />,
                  label: t('commitDetails.viewModeTree') || 'Tree structure',
                },
                {
                  value: 'list',
                  icon: <List className="h-3.5 w-3.5" />,
                  label: t('commitDetails.viewModeList') || 'Flat list',
                },
              ]}
            />
          </div>
        </div>

        {/* Tree rendering */}
        {bodyVisible && viewMode === 'tree' && (
          <div
            className={collapsible ? 'space-y-0.5 border-t border-border/30 p-2' : 'space-y-0.5'}
          >
            {filteredFiles.length === 0 ? (
              <p className="px-2 py-1 text-[11px] text-muted-foreground/70 italic">
                {noChangesLabel}
              </p>
            ) : (
              getSortedNodes(fileTreeRoot).map((node) => (
                <FileTreeNode key={node.path} node={node} ctx={rowContext} />
              ))
            )}
          </div>
        )}

        {/* List rendering */}
        {bodyVisible && viewMode === 'list' && (
          <div
            className={collapsible ? 'space-y-0.5 border-t border-border/30 p-2' : 'space-y-0.5'}
          >
            {filteredFiles.length === 0 ? (
              <p className="px-2 py-1 text-[11px] text-muted-foreground/70 italic">
                {noChangesLabel}
              </p>
            ) : (
              filteredFiles.map((file) => (
                <div
                  key={file.path}
                  className="group/file flex w-full min-w-0 cursor-pointer items-center justify-between rounded px-2 py-1 text-xs transition-colors hover:bg-accent"
                  onClick={() =>
                    onSelectFileDiff?.({
                      path: file.path,
                      staged: file.staged,
                      oid: isWip ? undefined : commitOid,
                    })
                  }
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      onSelectFileDiff?.({
                        path: file.path,
                        staged: file.staged,
                        oid: isWip ? undefined : commitOid,
                      })
                    }
                  }}
                >
                  {/* Left: Stage checkbox (WIP), File Icon and Consecutive Path Display */}
                  <div className="mr-4 flex min-w-0 flex-1 items-center">
                    {!hoverStage && isWip && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          if (file.staged) handleUnstage(file.path)
                          else handleStage(file.path)
                        }}
                        className={cn(
                          'mr-1.5 flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded border text-[10px] font-bold transition-colors',
                          file.staged
                            ? 'border-primary bg-primary text-white'
                            : 'border-border text-transparent hover:border-primary/60 hover:text-muted-foreground'
                        )}
                        title={
                          file.staged ? t('commitFileList.unstage') : t('commitFileList.stage')
                        }
                      >
                        ✓
                      </button>
                    )}
                    <FileText className="mr-1.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                    {file.viewed && (
                      <Check
                        className="mr-1.5 h-3 w-3 shrink-0 text-emerald-500"
                        data-testid={`file-list-viewed-${file.path}`}
                      />
                    )}
                    <div className="flex min-w-0 flex-1 items-center overflow-hidden font-mono text-[11px] leading-tight select-text">
                      <FilePathLabel path={file.path} />
                    </div>
                  </div>

                  {/* Right: Stats, Status Letter, WIP Actions */}
                  <div
                    className="flex shrink-0 items-center gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {file.additions !== undefined && file.deletions !== undefined && (
                      <span className="flex shrink-0 scale-90 items-center gap-0.5 text-[10px] text-muted-foreground/70 select-none">
                        <span className="text-green-500">+{file.additions}</span>
                        <span className="text-red-500">-{file.deletions}</span>
                      </span>
                    )}

                    <span
                      className={cn(
                        FILE_STATUS_COLOR[file.status],
                        'min-w-[12px] shrink-0 text-center text-xs font-bold select-none'
                      )}
                    >
                      {FILE_STATUS_LETTER[file.status]}
                    </span>

                    {isWip && (
                      <button
                        onClick={() => handleDiscard(file.path)}
                        data-testid={`file-discard-${file.path}`}
                        className={cn(
                          'shrink-0 cursor-pointer rounded border border-border p-0.5 text-destructive transition-colors hover:bg-destructive/10',
                          hoverStage && 'opacity-0 group-hover/file:opacity-100'
                        )}
                        title={t('actions.discardChanges')}
                      >
                        <RotateCcw className="h-2.5 w-2.5" />
                      </button>
                    )}

                    {hoverStage && isWip && (
                      <button
                        onClick={() =>
                          hoverStage === 'add' ? handleStage(file.path) : handleUnstage(file.path)
                        }
                        className={cn(
                          'shrink-0 cursor-pointer rounded border p-0.5 opacity-0 transition-colors group-hover/file:opacity-100',
                          hoverStage === 'add'
                            ? 'border-green-500/40 text-green-500 hover:bg-green-500/10'
                            : 'border-red-500/40 text-red-500 hover:bg-red-500/10'
                        )}
                        title={
                          hoverStage === 'add'
                            ? t('commitFileList.stage')
                            : t('commitFileList.unstage')
                        }
                      >
                        {hoverStage === 'add' ? (
                          <Plus className="h-2.5 w-2.5" />
                        ) : (
                          <Minus className="h-2.5 w-2.5" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
      {confirmDialog}
    </div>
  )
}
