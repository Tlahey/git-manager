import { useTranslation } from '@git-manager/i18n'
import { Button, Input } from '@git-manager/ui'
import { Plus, Trash2 } from 'lucide-react'

interface DefaultFilesEditorProps {
  /** The current list of glob patterns. */
  patterns: string[]
  /** Called with the full next list on any add/edit/remove. */
  onChange: (next: string[]) => void
  /** Disables every control (e.g. while a worktree is being created). */
  disabled?: boolean
  /** How many repo files each pattern matches, keyed by the pattern string. A pattern absent from
   * the map has no known count yet (still resolving) and shows nothing. */
  matchCounts?: Record<string, number>
}

/**
 * A purely-presentational editor for a list of worktree default-file glob patterns: one input row
 * per pattern with a remove button, plus an "add pattern" button. No IPC, store, or app-specific
 * type — so it's reused by both the per-repo settings page and the worktree-creation panel, each
 * owning where the list is persisted.
 */
export function DefaultFilesEditor({
  patterns,
  onChange,
  disabled,
  matchCounts,
}: DefaultFilesEditorProps) {
  const { t } = useTranslation('git')
  // Adding another row while one is still blank just piles up unfilled patterns — block it so a new
  // row can only be added once the current ones are filled.
  const hasEmptyRow = patterns.some((p) => !p.trim())

  function updateAt(index: number, value: string) {
    onChange(patterns.map((p, i) => (i === index ? value : p)))
  }

  function removeAt(index: number) {
    onChange(patterns.filter((_, i) => i !== index))
  }

  function addRow() {
    onChange([...patterns, ''])
  }

  return (
    <div className="space-y-2" data-testid="default-files-editor">
      {patterns.length === 0 ? (
        <p className="text-xs text-muted-foreground" data-testid="default-files-empty">
          {t('worktree.defaultFiles.empty')}
        </p>
      ) : (
        patterns.map((pattern, i) => {
          const trimmed = pattern.trim()
          const count = trimmed ? matchCounts?.[trimmed] : undefined
          return (
          <div key={i} className="flex items-center gap-2" data-testid="default-files-row">
            <div className="relative flex-1">
              <Input
                value={pattern}
                disabled={disabled}
                onChange={(e) => updateAt(i, e.target.value)}
                placeholder={t('worktree.defaultFiles.placeholder')}
                className="h-8 w-full pr-16 font-mono text-xs"
                data-testid="default-files-input"
              />
              {count !== undefined && (
                <span
                  className={`pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] tabular-nums ${
                    count === 0 ? 'text-destructive' : 'text-muted-foreground'
                  }`}
                  data-testid="default-files-count"
                >
                  {t('worktree.defaultFiles.matchCount', { count })}
                </span>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={disabled}
              onClick={() => removeAt(i)}
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
              aria-label={t('worktree.defaultFiles.remove')}
              data-testid="default-files-remove"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          )
        })
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || hasEmptyRow}
        onClick={addRow}
        className="gap-1.5"
        data-testid="default-files-add"
      >
        <Plus className="h-3.5 w-3.5" />
        {t('worktree.defaultFiles.add')}
      </Button>
    </div>
  )
}
