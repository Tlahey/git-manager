import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Button, Input } from '@git-manager/ui'
import { Check, Pencil, Play, Plus, Star, Trash2 } from 'lucide-react'
import type { RunTask } from '@git-manager/git-types'
import { CommandAutocomplete } from './CommandAutocomplete'
import { useEffectiveRepoSettings } from '../../../hooks/useEffectiveRepoSettings'
import { useProjectCommands } from '../../../hooks/useProjectCommands'
import { useSettingsStore } from '../../../stores/settings.store'

interface RunTasksSettingProps {
  /** The owning repo (main worktree) path to scope the tasks to. Also used as the parent's remount
   * `key`, so switching repos re-seeds the row state. */
  repoPath: string
}

/** Preset names offered as one-click starters — command left blank for the user to fill in. */
const PRESET_KEYS = ['launch', 'build', 'unit', 'e2e'] as const

/** One editable task line. `committed*` is the last-saved value feeding the persisted list; `name`/
 * `command` are the in-progress edits. A line contributes to settings only through its committed
 * values, so editing one line never drops another that's mid-edit. `id` is the `RunTask.id`, kept
 * stable across edits so `defaultRunTaskId` stays valid. */
interface Row {
  id: string
  committedName: string
  committedCommand: string
  name: string
  command: string
  editing: boolean
}

function seedRow(task: RunTask): Row {
  return {
    id: task.id,
    committedName: task.name,
    committedCommand: task.command,
    name: task.name,
    command: task.command,
    editing: false,
  }
}

/**
 * Per-repo editor for the toolbar's runnable tasks, mirroring `WorktreeDefaultFilesSetting`'s
 * per-line lifecycle: each saved task shows read-only (with star/edit/delete), editing a task turns
 * its name + command into inputs whose save (check) icon only appears once both are non-empty. One
 * task can be flagged as the default (launched by the primary "Lancer" button). Repo-only — no
 * inherit/override toggle. Persists the committed rows to the repo's settings.
 */
export function RunTasksSetting({ repoPath }: RunTasksSettingProps) {
  const { t } = useTranslation('settings')
  const { runTasks: saved, defaultRunTaskId } = useEffectiveRepoSettings(repoPath)
  const projectCommands = useProjectCommands(repoPath)
  const setRepoSetting = useSettingsStore((s) => s.setRepoSetting)
  const resetRepoSetting = useSettingsStore((s) => s.resetRepoSetting)

  const [rows, setRows] = useState<Row[]>(() => saved.map(seedRow))
  // Only one line is edited/added at a time — finish it before starting another.
  const anyEditing = rows.some((r) => r.editing)

  // The task the primary button would launch: the flagged default among saved rows, else the first
  // saved row — so the UI marks the effective default even before one is explicitly chosen.
  const savedIds = rows.filter((r) => r.committedName && r.committedCommand).map((r) => r.id)
  const effectiveDefaultId = savedIds.find((id) => id === defaultRunTaskId) ?? savedIds[0]

  function persist(nextRows: Row[]) {
    const tasks: RunTask[] = nextRows
      .filter((r) => r.committedName.trim() && r.committedCommand.trim())
      .map((r) => ({ id: r.id, name: r.committedName.trim(), command: r.committedCommand.trim() }))
    if (tasks.length === 0) {
      resetRepoSetting(repoPath, 'runTasks')
      resetRepoSetting(repoPath, 'defaultRunTaskId')
    } else {
      setRepoSetting(repoPath, 'runTasks', tasks)
    }
  }

  function addRow(name = '') {
    setRows([
      ...rows,
      { id: crypto.randomUUID(), committedName: '', committedCommand: '', name, command: '', editing: true },
    ])
  }

  function editRow(id: string) {
    setRows(rows.map((r) => (r.id === id ? { ...r, editing: true } : r)))
  }

  function changeRow(id: string, patch: Partial<Pick<Row, 'name' | 'command'>>) {
    setRows(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  function saveRow(id: string) {
    const next = rows.map((r) =>
      r.id === id
        ? { ...r, committedName: r.name.trim(), committedCommand: r.command.trim(), editing: false }
        : r
    )
    setRows(next)
    persist(next)
  }

  function deleteRow(id: string) {
    const next = rows.filter((r) => r.id !== id)
    setRows(next)
    persist(next)
    if (defaultRunTaskId === id) resetRepoSetting(repoPath, 'defaultRunTaskId')
  }

  function setDefault(id: string) {
    setRepoSetting(repoPath, 'defaultRunTaskId', id)
  }

  function canSave(row: Row): boolean {
    return row.name.trim() !== '' && row.command.trim() !== ''
  }

  return (
    <div className="space-y-3" data-testid="repo-run-tasks">
      <div className="space-y-1">
        <label className="text-xs font-medium text-foreground">
          {t('settings.repository.run.tasksLabel')}
        </label>
        <p className="text-[11px] text-muted-foreground">{t('settings.repository.run.helper')}</p>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground" data-testid="run-tasks-empty">
          {t('settings.repository.run.empty')}
        </p>
      ) : (
        <ul className="space-y-1.5" data-testid="run-tasks-list">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex items-center gap-2 rounded-md border border-input bg-muted/30 px-2 py-1.5"
              data-testid="run-tasks-row"
            >
              {row.editing ? (
                <>
                  <Input
                    autoFocus
                    value={row.name}
                    onChange={(e) => changeRow(row.id, { name: e.target.value })}
                    placeholder={t('settings.repository.run.namePlaceholder')}
                    className="h-7 w-40 shrink-0 text-xs"
                    data-testid="run-tasks-name"
                  />
                  <CommandAutocomplete
                    value={row.command}
                    onChange={(v) => changeRow(row.id, { command: v })}
                    onEnter={() => {
                      if (canSave(row)) saveRow(row.id)
                    }}
                    suggestions={projectCommands}
                    placeholder={t('settings.repository.run.commandPlaceholder')}
                    className="h-7 font-mono text-xs"
                    testId="run-tasks-command"
                  />
                  {canSave(row) && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => saveRow(row.id)}
                      aria-label={t('settings.repository.run.save')}
                      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                      data-testid="run-tasks-save"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setDefault(row.id)}
                    aria-pressed={row.id === effectiveDefaultId}
                    title={t('settings.repository.run.setDefault')}
                    className="h-7 w-7 shrink-0"
                    data-testid="run-tasks-default"
                  >
                    <Star
                      className={`h-3.5 w-3.5 ${row.id === effectiveDefaultId ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground'}`}
                    />
                  </Button>
                  <span
                    className="w-40 shrink-0 truncate text-xs font-medium text-foreground"
                    data-testid="run-tasks-name-value"
                  >
                    {row.committedName}
                  </span>
                  <span
                    className="flex min-w-0 flex-1 items-center gap-1 font-mono text-xs text-muted-foreground"
                    data-testid="run-tasks-command-value"
                  >
                    <Play className="h-3 w-3 shrink-0 text-orange-400/70" />
                    <span className="truncate">{row.committedCommand}</span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => editRow(row.id)}
                    aria-label={t('settings.repository.run.edit')}
                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                    data-testid="run-tasks-edit"
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
                aria-label={t('settings.repository.run.remove')}
                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                data-testid="run-tasks-delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={anyEditing}
          onClick={() => addRow()}
          className="gap-1.5"
          data-testid="run-tasks-add"
        >
          <Plus className="h-3.5 w-3.5" />
          {t('settings.repository.run.add')}
        </Button>
        {PRESET_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            disabled={anyEditing}
            onClick={() => addRow(t(`settings.repository.run.presets.${key}`))}
            className="rounded border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            data-testid={`run-tasks-preset-${key}`}
          >
            {t(`settings.repository.run.presets.${key}`)}
          </button>
        ))}
      </div>
    </div>
  )
}
