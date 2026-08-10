import { Check, FileText, Plus, Minus, RotateCcw } from 'lucide-react'
import { cn } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import type { TreeNode } from '@git-manager/components'
import { FILE_STATUS_LETTER, FILE_STATUS_COLOR } from '../../lib/fileStatusStyle'
import type { FileTreeRowContext } from './fileTreeRowContext'

interface FileTreeFileRowProps {
  node: TreeNode
  depth: number
  ctx: FileTreeRowContext
}

/**
 * One file in a {@link CommitFileList} tree: its staging control, its name, its +/− counts, its
 * status letter, and — on the working tree — the actions that change it.
 *
 * The row itself opens the file's diff; every control inside it stops propagation, so acting on a
 * file never also navigates away from what the user is looking at.
 */
export function FileTreeFileRow({ node, depth, ctx }: FileTreeFileRowProps) {
  const { t } = useTranslation('git')
  const fileStatus = node.status ?? 'modified'

  // Folder rows gain a checkbox (+ its leading gap) when `folderCheckboxes` is on, pushing their
  // name further right — files need the same extra indent per level to stay aligned under their
  // parent folder's name instead of under its checkbox.
  const indentStep = ctx.folderCheckboxes ? 36 : 12

  const openDiff = () =>
    ctx.onSelectFileDiff?.({
      path: node.path,
      staged: node.staged ?? false,
      oid: ctx.isWip ? undefined : ctx.commitOid,
    })

  return (
    <div
      key={node.path}
      className="group/file flex w-full min-w-0 cursor-pointer items-center justify-between rounded px-2 py-1 text-xs transition-colors hover:bg-accent"
      style={{ paddingLeft: `${depth * indentStep + 8}px` }}
      onClick={openDiff}
      role="button"
      tabIndex={0}
      data-testid={`file-tree-file-${node.path}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') openDiff()
      }}
    >
      {/* Left: Stage checkbox (WIP), File Icon and Filename */}
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        {!ctx.hoverStage && ctx.isWip ? (
          <button
            onClick={(e) => {
              e.stopPropagation()
              if (node.staged) ctx.onUnstage(node.path)
              else ctx.onStage(node.path)
            }}
            className={cn(
              'flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded border text-[10px] font-bold transition-colors',
              node.staged
                ? 'border-primary bg-primary text-white'
                : 'border-border text-transparent hover:border-primary/60 hover:text-muted-foreground'
            )}
            title={node.staged ? t('commitFileList.unstage') : t('commitFileList.stage')}
          >
            ✓
          </button>
        ) : !ctx.hoverStage ? (
          // Keeps a file's name aligned with the ones that do carry a checkbox.
          <div className="w-3 shrink-0" />
        ) : null}
        <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
        {node.viewed && (
          <Check
            className="h-3 w-3 shrink-0 text-emerald-500"
            data-testid={`file-tree-viewed-${node.path}`}
          />
        )}
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] leading-tight font-semibold text-foreground">
          {node.name}
        </span>
      </div>

      {/* Right: Stats, Status, WIP Actions */}
      <div className="ml-2 flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
        {node.additions !== undefined && node.deletions !== undefined && (
          <span className="flex shrink-0 scale-90 items-center gap-0.5 text-[10px] text-muted-foreground/70 select-none">
            <span className="text-green-500">+{node.additions}</span>
            <span className="text-red-500">-{node.deletions}</span>
          </span>
        )}

        <span
          className={cn(
            FILE_STATUS_COLOR[fileStatus],
            'min-w-[12px] shrink-0 text-center text-xs font-bold select-none'
          )}
        >
          {FILE_STATUS_LETTER[fileStatus]}
        </span>

        {ctx.isWip && (
          <button
            onClick={() => ctx.onDiscard(node.path)}
            data-testid={`file-discard-${node.path}`}
            className={cn(
              'shrink-0 cursor-pointer rounded border border-border p-0.5 text-destructive transition-colors hover:bg-destructive/10',
              ctx.hoverStage && 'opacity-0 group-hover/file:opacity-100'
            )}
            title={t('actions.discardChanges')}
          >
            <RotateCcw className="h-2.5 w-2.5" />
          </button>
        )}

        {ctx.hoverStage && ctx.isWip && (
          <button
            onClick={() =>
              ctx.hoverStage === 'add' ? ctx.onStage(node.path) : ctx.onUnstage(node.path)
            }
            className={cn(
              'shrink-0 cursor-pointer rounded border p-0.5 opacity-0 transition-colors group-hover/file:opacity-100',
              ctx.hoverStage === 'add'
                ? 'border-green-500/40 text-green-500 hover:bg-green-500/10'
                : 'border-red-500/40 text-red-500 hover:bg-red-500/10'
            )}
            title={
              ctx.hoverStage === 'add' ? t('commitFileList.stage') : t('commitFileList.unstage')
            }
          >
            {ctx.hoverStage === 'add' ? (
              <Plus className="h-2.5 w-2.5" />
            ) : (
              <Minus className="h-2.5 w-2.5" />
            )}
          </button>
        )}
      </div>
    </div>
  )
}
