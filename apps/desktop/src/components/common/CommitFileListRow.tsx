import { Check, FileText, Plus, Minus, RotateCcw } from 'lucide-react'
import { Tooltip, cn } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import { FILE_STATUS_LETTER, FILE_STATUS_COLOR } from '../../lib/fileStatusStyle'
import { FilePathLabel } from './FilePathLabel'
import type { FileTreeRowContext } from './fileTreeRowContext'
import type { ProcessedFileItem } from './CommitFileList'

interface CommitFileListRowProps {
  file: ProcessedFileItem
  ctx: FileTreeRowContext
}

/** One file in a {@link CommitFileList}'s flat list view: its staging control, its full path, its
 * +/− counts, its status letter, and — on the working tree — the actions that change it. The
 * tree view's equivalent row is {@link FileTreeFileRow}; this one shows the whole path (there is
 * no parent folder to imply it) instead of just the filename. */
export function CommitFileListRow({ file, ctx }: CommitFileListRowProps) {
  const { t } = useTranslation('git')

  const openDiff = () =>
    ctx.onSelectFileDiff?.({
      path: file.path,
      staged: file.staged,
      oid: ctx.isWip ? undefined : ctx.commitOid,
    })

  return (
    <div
      className="group/file flex w-full min-w-0 cursor-pointer items-center justify-between rounded px-2 py-1 text-xs transition-colors hover:bg-accent"
      onClick={openDiff}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') openDiff()
      }}
    >
      {/* Left: Stage checkbox (WIP), File Icon and Consecutive Path Display */}
      <div className="mr-4 flex min-w-0 flex-1 items-center">
        {!ctx.hoverStage && ctx.isWip && (
          <Tooltip content={file.staged ? t('commitFileList.unstage') : t('commitFileList.stage')}>
            <button
              onClick={(e) => {
                e.stopPropagation()
                if (file.staged) ctx.onUnstage(file.path)
                else ctx.onStage(file.path)
              }}
              className={cn(
                'mr-1.5 flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded border text-[10px] font-bold transition-colors',
                file.staged
                  ? 'border-primary bg-primary text-white'
                  : 'border-border text-transparent hover:border-primary/60 hover:text-muted-foreground'
              )}
              aria-label={file.staged ? t('commitFileList.unstage') : t('commitFileList.stage')}
            >
              ✓
            </button>
          </Tooltip>
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
      <div className="flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
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

        {ctx.isWip && (
          <Tooltip content={t('actions.discardChanges')}>
            <button
              onClick={() => ctx.onDiscard(file.path)}
              data-testid={`file-discard-${file.path}`}
              className={cn(
                'shrink-0 cursor-pointer rounded border border-border p-0.5 text-destructive transition-colors hover:bg-destructive/10',
                ctx.hoverStage && 'opacity-0 group-hover/file:opacity-100'
              )}
              aria-label={t('actions.discardChanges')}
            >
              <RotateCcw className="h-2.5 w-2.5" />
            </button>
          </Tooltip>
        )}

        {ctx.hoverStage && ctx.isWip && (
          <Tooltip
            content={
              ctx.hoverStage === 'add' ? t('commitFileList.stage') : t('commitFileList.unstage')
            }
          >
            <button
              onClick={() =>
                ctx.hoverStage === 'add' ? ctx.onStage(file.path) : ctx.onUnstage(file.path)
              }
              className={cn(
                'shrink-0 cursor-pointer rounded border p-0.5 opacity-0 transition-colors group-hover/file:opacity-100',
                ctx.hoverStage === 'add'
                  ? 'border-green-500/40 text-green-500 hover:bg-green-500/10'
                  : 'border-red-500/40 text-red-500 hover:bg-red-500/10'
              )}
              aria-label={
                ctx.hoverStage === 'add' ? t('commitFileList.stage') : t('commitFileList.unstage')
              }
            >
              {ctx.hoverStage === 'add' ? (
                <Plus className="h-2.5 w-2.5" />
              ) : (
                <Minus className="h-2.5 w-2.5" />
              )}
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  )
}
