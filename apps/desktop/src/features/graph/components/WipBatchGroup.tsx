import { Button, Textarea, Badge, Spinner, cn, LlmIcon } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import { Check } from 'lucide-react'
import type { ProcessedFileItem } from '../../../components/common/CommitFileList'

/** The one-letter status marker, and its colour. Keyed by `ProcessedFileItem['status']`. */
const STATUS_STYLES: Record<string, { letter: string; className: string }> = {
  added: { letter: 'A', className: 'text-green-500 font-bold text-[10px]' },
  modified: { letter: 'M', className: 'text-yellow-500 font-bold text-[10px]' },
  deleted: { letter: 'D', className: 'text-red-500 font-bold text-[10px]' },
  renamed: { letter: 'R', className: 'text-blue-500 font-bold text-[10px]' },
  untracked: { letter: '?', className: 'text-muted-foreground font-bold text-[10px]' },
}

/** Splits a path into its directory (trailing slash kept) and its file name. */
function splitPath(path: string): { dir: string | null; name: string } {
  const lastSlash = path.lastIndexOf('/')
  if (lastSlash === -1) return { dir: null, name: path }
  return { dir: path.substring(0, lastSlash + 1), name: path.substring(lastSlash + 1) }
}

interface WipBatchGroupProps {
  /** Directory the group is named after — shown as `/<name>`. */
  groupName: string
  files: ProcessedFileItem[]
  message: string
  onMessageChange: (message: string) => void
  /**
   * This group's own turn. It drives the spinner and the textarea, so it must stay false for the
   * groups an "all" run has not reached yet.
   */
  isGenerating: boolean
  /**
   * The whole sequence is running. It only disables the actions, because a per-group action started
   * mid-run would stage against the other's index.
   */
  isSequenceBusy: boolean
  aiEnabled: boolean
  onGenerate: () => void
  onCommit: () => void
}

/** One group of the batch plan: its files, its message, and its two actions. */
export function WipBatchGroup({
  groupName,
  files,
  message,
  onMessageChange,
  isGenerating,
  isSequenceBusy,
  aiEnabled,
  onGenerate,
  onCommit,
}: WipBatchGroupProps) {
  const { t } = useTranslation('git')

  return (
    <div
      data-testid={`batch-group-${groupName}`}
      className="space-y-2.5 rounded-lg border border-border/40 bg-muted/10 p-3"
    >
      {/* Group Header */}
      <div className="flex items-center justify-between">
        <span className="truncate font-mono text-xs font-bold text-primary">/{groupName}</span>
        <Badge variant="secondary" className="text-[9px] font-bold">
          {t('commitDetails.batchCommit.fileCount', { count: files.length })}
        </Badge>
      </div>

      {/* Files in Group */}
      <div className="max-h-24 space-y-0.5 overflow-y-auto rounded border border-border/30 bg-card p-1.5">
        {files.map((file) => {
          const { dir, name } = splitPath(file.path)
          const status = STATUS_STYLES[file.status]
          return (
            <div
              key={file.path}
              className="flex w-full min-w-0 items-center justify-between py-0.5 font-mono text-[10px]"
            >
              <div className="mr-4 flex min-w-0 flex-1 items-center gap-1.5">
                <span
                  className={cn(status?.className, 'min-w-[12px] shrink-0 text-center select-none')}
                >
                  {status?.letter}
                </span>
                {dir && (
                  <span className="min-w-0 shrink truncate pr-0.5 text-[9px] leading-tight text-muted-foreground/45 select-text">
                    {dir}
                  </span>
                )}
              </div>
              <span className="min-w-0 shrink-0 truncate text-[9px] leading-tight font-semibold text-foreground select-all">
                {name}
              </span>
            </div>
          )
        })}
      </div>

      {/* Message Box */}
      <div className="space-y-1.5">
        <Textarea
          data-testid={`batch-message-${groupName}`}
          value={message}
          onChange={(e) => onMessageChange(e.target.value)}
          placeholder={t('commitDetails.batchCommit.placeholder')}
          rows={2}
          className="resize-none font-mono text-[11px]"
          disabled={isGenerating}
        />

        <div className="flex items-center gap-2">
          {aiEnabled && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 flex-1 gap-1 text-[10px] font-semibold"
              onClick={onGenerate}
              disabled={isGenerating || isSequenceBusy}
            >
              {isGenerating ? (
                <Spinner className="h-2.5 w-2.5" />
              ) : (
                <LlmIcon className="h-3 w-3 text-primary" />
              )}
              <span>
                {isGenerating ? t('commitDetails.batchCommit.generating') : t('commit.generate')}
              </span>
            </Button>
          )}

          <Button
            size="sm"
            data-testid={`batch-commit-${groupName}`}
            className="h-7 flex-1 gap-1 text-[10px] font-semibold"
            onClick={onCommit}
            disabled={isGenerating || isSequenceBusy || !message.trim()}
          >
            <Check className="h-3 w-3 text-white" />
            <span>{t('commitDetails.batchCommit.commitBatch')}</span>
          </Button>
        </div>
      </div>
    </div>
  )
}
