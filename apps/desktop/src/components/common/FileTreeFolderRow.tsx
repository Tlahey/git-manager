import type { ReactNode } from 'react'
import { ChevronDown, ChevronRight, Folder, FolderOpen, Plus, Minus } from 'lucide-react'
import { cn, Tag } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import { collectDescendantFiles, type TreeNode } from '@git-manager/components'
import type { FileTreeRowContext } from './fileTreeRowContext'

interface FileTreeFolderRowProps {
  node: TreeNode
  depth: number
  ctx: FileTreeRowContext
  /** The expanded subtree, already rendered by the caller — this row does not recurse itself. */
  children?: ReactNode
}

/**
 * One folder in a {@link CommitFileList} tree: its disclosure arrow, its aggregated change counts,
 * and — when the list is staging — the two ways of acting on everything below it at once.
 *
 * The two staging affordances are exclusive and both come from the list's configuration, not from
 * this folder: `folderCheckboxes` gives a persistent tri-state checkbox (the JetBrains "Commit
 * Changes" style), `hoverStage` gives a +/- that only appears on hover and always applies the same
 * direction. A list picks one; a folder never shows both.
 */
export function FileTreeFolderRow({ node, depth, ctx, children }: FileTreeFolderRowProps) {
  const { t } = useTranslation('git')
  const isExpanded = ctx.expandedFolders.has(node.path)

  const totalFiles = node.stats
    ? node.stats.added + node.stats.modified + node.stats.deleted + node.stats.renamed
    : 0

  const showCheckbox = ctx.folderCheckboxes && ctx.isWip
  // Only computed when the checkbox is shown — walking the subtree of every folder on every render
  // would cost the whole tree for a control that is not there.
  const descendantFiles = showCheckbox ? collectDescendantFiles(node) : []
  const stagedCount = descendantFiles.filter((f) => f.staged).length
  const allStaged = descendantFiles.length > 0 && stagedCount === descendantFiles.length
  const someStaged = stagedCount > 0 && !allStaged

  return (
    <div key={node.path} className="flex flex-col">
      <div
        onClick={() => ctx.toggleFolder(node.path)}
        className="group/folder flex w-full min-w-0 cursor-pointer items-center gap-1.5 rounded px-2 py-1 text-left text-xs font-medium transition-colors hover:bg-accent/40"
        role="button"
        tabIndex={0}
        data-testid={`file-tree-folder-${node.path}`}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            ctx.toggleFolder(node.path)
          }
        }}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {isExpanded ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
        )}
        {showCheckbox && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              ctx.onToggleFolderStage(node, allStaged)
            }}
            className={cn(
              'flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded border text-[10px] font-bold transition-colors',
              allStaged || someStaged
                ? 'border-primary bg-primary text-white'
                : 'border-border text-transparent hover:border-primary/60 hover:text-muted-foreground'
            )}
            title={allStaged ? t('commitFileList.unstageFolder') : t('commitFileList.stageFolder')}
            data-testid={`file-tree-folder-checkbox-${node.path}`}
          >
            {someStaged ? '-' : '✓'}
          </button>
        )}
        {isExpanded ? (
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-blue-400" />
        ) : (
          <Folder className="h-3.5 w-3.5 shrink-0 text-blue-400" />
        )}
        <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
          <span className="truncate text-foreground/90">{node.name}</span>
          {ctx.folderCheckboxes && (
            <span className="shrink-0 text-[10px] font-normal text-muted-foreground/60">
              {t('commitDetails.fileCount', { count: totalFiles })}
            </span>
          )}
        </div>
        {node.stats && (
          <div className="ml-2 flex shrink-0 items-center gap-1 text-[9px] font-bold select-none">
            {node.stats.added > 0 && (
              <Tag tone="success" className="px-1 py-0 text-[9px]">
                +{node.stats.added}
              </Tag>
            )}
            {node.stats.modified > 0 && (
              <Tag tone="warning" className="px-1 py-0 text-[9px]">
                ~{node.stats.modified}
              </Tag>
            )}
            {node.stats.deleted > 0 && (
              <Tag tone="danger" className="px-1 py-0 text-[9px]">
                -{node.stats.deleted}
              </Tag>
            )}
            {node.stats.renamed > 0 && (
              <Tag tone="info" className="px-1 py-0 text-[9px]">
                →{node.stats.renamed}
              </Tag>
            )}
          </div>
        )}
        {ctx.hoverStage && ctx.isWip && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              ctx.onHoverStageFolder(node)
            }}
            className={cn(
              'ml-2 shrink-0 cursor-pointer rounded border p-0.5 opacity-0 transition-colors group-hover/folder:opacity-100',
              ctx.hoverStage === 'add'
                ? 'border-green-500/40 text-green-500 hover:bg-green-500/10'
                : 'border-red-500/40 text-red-500 hover:bg-red-500/10'
            )}
            title={
              ctx.hoverStage === 'add'
                ? t('commitFileList.stageFolder')
                : t('commitFileList.unstageFolder')
            }
            data-testid={`file-tree-folder-hover-stage-${node.path}`}
          >
            {ctx.hoverStage === 'add' ? (
              <Plus className="h-2.5 w-2.5" />
            ) : (
              <Minus className="h-2.5 w-2.5" />
            )}
          </button>
        )}
      </div>
      {isExpanded && children && <div className="flex flex-col">{children}</div>}
    </div>
  )
}
