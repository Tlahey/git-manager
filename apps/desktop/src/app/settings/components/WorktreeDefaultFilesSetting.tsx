import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Button, Input } from '@git-manager/ui'
import { Check, Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffectiveRepoSettings } from '../../../hooks/useEffectiveRepoSettings'
import { useDefaultFileMatchCounts } from '../../../hooks/useDefaultFileMatchCounts'
import { useSettingsStore } from '../../../stores/settings.store'

interface WorktreeDefaultFilesSettingProps {
  /** The owning repo (main worktree) path to scope the setting to. Also used as the remount `key`
   * by the parent so switching repos re-seeds the row state. */
  repoPath: string
}

/** One editable line. `committed` is the last-saved value that feeds the persisted list; `value` is
 * the in-progress edit. A line contributes to settings only through its `committed` value, so
 * editing one line never drops another that's mid-edit. */
interface Row {
  id: number
  committed: string
  value: string
  editing: boolean
}

let rowSeq = 0
const nextRowId = () => (rowSeq += 1)

/**
 * Per-repo "default files" editor with a per-line lifecycle: each committed line shows readonly
 * with edit/delete icons; editing a line turns it into an input whose save (check) icon only
 * appears once the pattern is non-empty AND matches at least one file in the repo — so an empty or
 * dead pattern can never be saved. Persists the committed lines to the repo's settings.
 */
export function WorktreeDefaultFilesSetting({ repoPath }: WorktreeDefaultFilesSettingProps) {
  const { t } = useTranslation('settings')
  const saved = useEffectiveRepoSettings(repoPath).worktreeDefaultFiles
  const setRepoSetting = useSettingsStore((s) => s.setRepoSetting)
  const resetRepoSetting = useSettingsStore((s) => s.resetRepoSetting)

  const [rows, setRows] = useState<Row[]>(() =>
    saved.map((p) => ({ id: nextRowId(), committed: p, value: p, editing: false }))
  )
  // Live "N files" counts for every line's current text (debounced backend lookup).
  const matchCounts = useDefaultFileMatchCounts(
    repoPath,
    rows.map((r) => r.value)
  )
  // Only one line is edited/added at a time — finish it before starting another.
  const anyEditing = rows.some((r) => r.editing)

  function persist(nextRows: Row[]) {
    const unique = [...new Set(nextRows.map((r) => r.committed.trim()).filter(Boolean))]
    if (unique.length === 0) {
      resetRepoSetting(repoPath, 'worktreeDefaultFiles')
    } else {
      setRepoSetting(repoPath, 'worktreeDefaultFiles', unique)
    }
  }

  function addRow() {
    setRows([...rows, { id: nextRowId(), committed: '', value: '', editing: true }])
  }

  function editRow(id: number) {
    setRows(rows.map((r) => (r.id === id ? { ...r, editing: true } : r)))
  }

  function changeRow(id: number, value: string) {
    setRows(rows.map((r) => (r.id === id ? { ...r, value } : r)))
  }

  function saveRow(id: number) {
    const next = rows.map((r) =>
      r.id === id ? { ...r, committed: r.value.trim(), value: r.value.trim(), editing: false } : r
    )
    setRows(next)
    persist(next)
  }

  function deleteRow(id: number) {
    const next = rows.filter((r) => r.id !== id)
    setRows(next)
    persist(next)
  }

  /** A line is saveable only when it's non-empty and matches at least one file in the repo. */
  function canSave(value: string): boolean {
    const trimmed = value.trim()
    return trimmed !== '' && (matchCounts[trimmed] ?? 0) > 0
  }

  function countBadge(pattern: string) {
    const count = pattern.trim() ? matchCounts[pattern.trim()] : undefined
    if (count === undefined) return null
    return (
      <span
        className={`text-[10px] tabular-nums ${count === 0 ? 'text-destructive' : 'text-muted-foreground'}`}
        data-testid="worktree-df-count"
      >
        {t('settings.repository.worktree.matchCount', { count })}
      </span>
    )
  }

  return (
    <div className="space-y-2" data-testid="repo-worktree-default-files">
      <label className="text-xs font-medium text-foreground">
        {t('settings.repository.worktree.defaultFilesLabel')}
      </label>
      <p className="text-[11px] text-muted-foreground">
        {t('settings.repository.worktree.defaultFilesHelper')}
      </p>

      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground" data-testid="worktree-df-empty">
          {t('settings.repository.worktree.empty')}
        </p>
      ) : (
        <ul className="space-y-1" data-testid="worktree-df-list">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex items-center gap-2 rounded-md border border-input bg-muted/30 px-2 py-1"
              data-testid="worktree-df-row"
            >
              {row.editing ? (
                <>
                  <div className="relative flex-1">
                    <Input
                      autoFocus
                      value={row.value}
                      onChange={(e) => changeRow(row.id, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && canSave(row.value)) saveRow(row.id)
                      }}
                      placeholder={t('settings.repository.worktree.defaultFilesLabel')}
                      className="h-7 w-full pr-16 font-mono text-xs"
                      data-testid="worktree-df-input"
                    />
                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">
                      {countBadge(row.value)}
                    </span>
                  </div>
                  {canSave(row.value) && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => saveRow(row.id)}
                      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                      aria-label={t('settings.repository.worktree.save')}
                      data-testid="worktree-df-save"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <span className="flex-1 font-mono text-xs text-foreground" data-testid="worktree-df-value">
                    {row.committed}
                  </span>
                  {countBadge(row.committed)}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => editRow(row.id)}
                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                    aria-label={t('settings.repository.worktree.edit')}
                    data-testid="worktree-df-edit"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => deleteRow(row.id)}
                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                aria-label={t('settings.repository.worktree.remove')}
                data-testid="worktree-df-delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={anyEditing}
        onClick={addRow}
        className="gap-1.5"
        data-testid="worktree-df-add"
      >
        <Plus className="h-3.5 w-3.5" />
        {t('settings.repository.worktree.add')}
      </Button>
    </div>
  )
}
