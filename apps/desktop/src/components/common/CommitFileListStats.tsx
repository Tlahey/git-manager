import { useTranslation } from '@git-manager/i18n'
import { Tag } from '@git-manager/ui'
import { Plus, Minus, ArrowRight, Pencil } from 'lucide-react'

export interface CommitFileListFileStats {
  added: number
  modified: number
  deleted: number
  renamed: number
}

interface CommitFileListStatsProps {
  fileStats: CommitFileListFileStats
  filteredCount: number
  isEmpty: boolean
  emptyMessage: string
}

/** The "Stats Summary" badge row at the top of a {@link CommitFileList} — per-status counts plus
 * the total changed-file count, or the empty-state message when there are no files at all. */
export function CommitFileListStats({
  fileStats,
  filteredCount,
  isEmpty,
  emptyMessage,
}: CommitFileListStatsProps) {
  const { t } = useTranslation('git')

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="block text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
          {t('commitFileList.statsSummary')}
        </span>
        <span className="rounded border border-border/40 bg-muted/65 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground">
          {t('commitFileList.filesChanged', { count: filteredCount })}
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
        {isEmpty && (
          <span className="text-[10px] text-muted-foreground/60 italic">{emptyMessage}</span>
        )}
      </div>
    </div>
  )
}
