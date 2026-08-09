import { Badge, cn } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import type { DiffRow as DiffRowModel } from './diffRows'

const STATUS_LABEL_KEYS: Record<string, string> = {
  added: 'diffToolbar.status.added',
  modified: 'diffToolbar.status.modified',
  deleted: 'diffToolbar.status.deleted',
  renamed: 'diffToolbar.status.renamed',
  copied: 'diffToolbar.status.copied',
  typechange: 'diffToolbar.status.typechange',
}

const STATUS_VARIANTS: Record<string, 'success' | 'destructive' | 'secondary' | 'warning'> = {
  added: 'success',
  modified: 'secondary',
  deleted: 'destructive',
  renamed: 'warning',
  copied: 'success',
  typechange: 'secondary',
}

interface DiffRowProps {
  row: DiffRowModel
}

/**
 * One row of a flattened multi-file diff — a file header, a hunk header, a diff line, a binary
 * placeholder, or the gap between two files.
 *
 * The per-file bordered box is drawn by the rows themselves rather than by a wrapper element: only
 * the rows on screen exist at all, so a file whose box spans a thousand lines has no element that
 * could hold that border. Each row therefore carries the box's left/right edges, the header carries
 * the top, and whichever row `buildDiffRows` marked `isLastOfFile` carries the bottom.
 *
 * Heights are pinned with `h-*` classes matching `DIFF_ROW_HEIGHTS` exactly — that file explains
 * why they must not drift.
 */
export function DiffRow({ row }: DiffRowProps) {
  const { t } = useTranslation('git')

  if (row.kind === 'gap') return <div aria-hidden="true" className="h-3" />

  // `min-w-full` on every row is what keeps the file box rectangular once the list is scrolled
  // sideways: the rows sit in a `w-max` window (see DiffFileList), so this stretches each of them
  // to the width of the longest line rather than to the viewport.
  const boxEdges = cn(
    'min-w-full border-x border-border',
    row.isLastOfFile && 'rounded-b-md border-b'
  )

  if (row.kind === 'file') {
    const { file, displayPath } = row
    return (
      <div
        className={cn(
          'flex h-7 min-w-full items-center gap-2 rounded-t-md border-x border-t border-border bg-muted/50 px-3',
          row.isLastOfFile && 'rounded-b-md border-b'
        )}
        data-testid={`diff-viewer-file-${displayPath}`}
      >
        <span className="flex-1 truncate text-foreground">{displayPath}</span>
        <Badge variant={STATUS_VARIANTS[file.status] ?? 'secondary'}>
          {file.status in STATUS_LABEL_KEYS ? t(STATUS_LABEL_KEYS[file.status]) : file.status}
        </Badge>
        {!file.isBinary && (
          <span className="whitespace-nowrap text-muted-foreground">
            <span className="text-green-400">+{file.additions}</span>{' '}
            <span className="text-red-400">-{file.deletions}</span>
          </span>
        )}
      </div>
    )
  }

  if (row.kind === 'binary') {
    return (
      <div className={cn('flex h-8 items-center px-3 text-muted-foreground italic', boxEdges)}>
        {t('diffViewer.binaryFile')}
      </div>
    )
  }

  if (row.kind === 'hunk') {
    return (
      <div
        className={cn(
          'flex h-5 items-center bg-blue-500/10 px-2 text-[11px] text-blue-400/80',
          boxEdges
        )}
      >
        {row.header}
      </div>
    )
  }

  const { line } = row
  return (
    <div
      className={cn(
        'flex h-5 items-start leading-5',
        line.origin === '+' && 'bg-green-500/10',
        line.origin === '-' && 'bg-red-500/10',
        boxEdges
      )}
    >
      {/* Line numbers */}
      <span className="w-10 shrink-0 border-r border-border pr-2 text-right text-muted-foreground/50 select-none">
        {line.oldLineno ?? ''}
      </span>
      <span className="w-10 shrink-0 border-r border-border pr-2 text-right text-muted-foreground/50 select-none">
        {line.newLineno ?? ''}
      </span>
      {/* Origin (+/-/space) */}
      <span
        className={cn(
          'w-5 shrink-0 text-center select-none',
          line.origin === '+' && 'text-green-400',
          line.origin === '-' && 'text-red-400',
          line.origin === ' ' && 'text-muted-foreground/40'
        )}
      >
        {line.origin === ' ' ? '' : line.origin}
      </span>
      {/* Content */}
      <span
        className={cn(
          'flex-1 pl-1 whitespace-pre',
          line.origin === '+' && 'text-green-300',
          line.origin === '-' && 'text-red-300',
          line.origin === ' ' && 'text-foreground/70'
        )}
      >
        {line.content}
      </span>
    </div>
  )
}
