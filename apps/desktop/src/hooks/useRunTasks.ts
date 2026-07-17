import { useCallback } from 'react'
import type { RunTask } from '@git-manager/git-types'
import { apiRunTask } from '../api/shell.api'
import { useRepoUIStore } from '../stores/repoUI.store'
import { useSettingsStore } from '../stores/settings.store'
import { useEffectiveRepoSettings } from './useEffectiveRepoSettings'

export interface UseRunTasks {
  /** The active repo's tasks (empty when none configured or no repo open). */
  tasks: RunTask[]
  /** The task launched by the primary "Lancer" button: the one flagged as default, else the first. */
  defaultTask: RunTask | undefined
  /** Whether at least one task is configured. */
  hasTasks: boolean
  /** Launches `task` in the configured external terminal, at the active repo/worktree path. */
  runTask: (task: RunTask) => Promise<void>
}

/**
 * Resolves the active repo's runnable tasks and launches them in the configured external terminal.
 * Tasks are defined per-repo (shared across its worktrees) but run in the *active tab's* path, so a
 * dev server starts where the user is working — mirroring `handleOpenTerminal` in `useActionToolbar`.
 */
export function useRunTasks(): UseRunTasks {
  const activeRepo = useRepoUIStore((s) => s.activeRepo)
  const terminalCommand = useSettingsStore((s) => s.settings.externalTools?.externalTerminalCommand)
  const { runTasks, defaultRunTaskId } = useEffectiveRepoSettings(activeRepo)

  const defaultTask = runTasks.find((t) => t.id === defaultRunTaskId) ?? runTasks[0]

  const runTask = useCallback(
    async (task: RunTask) => {
      if (!activeRepo) return
      try {
        await apiRunTask(activeRepo, task.command, terminalCommand ?? '')
      } catch (err) {
        console.error('Failed to launch task:', err)
      }
    },
    [activeRepo, terminalCommand]
  )

  return { tasks: runTasks, defaultTask, hasTasks: runTasks.length > 0, runTask }
}
