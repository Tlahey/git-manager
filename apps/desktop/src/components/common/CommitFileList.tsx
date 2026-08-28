import { useState, useMemo } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { cn } from '@git-manager/ui'
import { apiStageFile, apiUnstageFile, apiDiscardFileChanges } from '../../api/git.api'
import {
  useFileTree,
  getSortedNodes,
  collectDescendantFiles,
  useConfirm,
  type TreeNode,
} from '@git-manager/components'
import { FileTreeNode } from './FileTreeNode'
import { CommitFileListStats } from './CommitFileListStats'
import { CommitFileListSearchBar } from './CommitFileListSearchBar'
import { CommitFileListHeader } from './CommitFileListHeader'
import { CommitFileListRow } from './CommitFileListRow'
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
      {!hideStats && bodyVisible && (
        <CommitFileListStats
          fileStats={fileStats}
          filteredCount={filteredFiles.length}
          isEmpty={processedFiles.length === 0}
          emptyMessage={noChangesLabel}
        />
      )}

      {!hideSearch && bodyVisible && (
        <CommitFileListSearchBar value={fileSearchQuery} onChange={setFileSearchQuery} />
      )}

      {/* FILES TREE OR LIST VIEW */}
      <div className={collapsible ? '' : 'space-y-2'}>
        <CommitFileListHeader
          title={title ?? t('commitFileList.modifications')}
          collapsible={collapsible}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((c) => !c)}
          bodyVisible={bodyVisible}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          showExpandCollapseAll={allFolderPaths.size > 0}
          expandCollapseButtonState={buttonState}
          onToggleExpandAll={handleToggleExpandAll}
          hoverStage={hoverStage}
          onBulkStage={onBulkStage}
          bulkStageTestId={bulkStageTestId}
        />

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
                <CommitFileListRow key={file.path} file={file} ctx={rowContext} />
              ))
            )}
          </div>
        )}
      </div>
      {confirmDialog}
    </div>
  )
}
