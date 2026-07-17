import { invoke } from '@tauri-apps/api/core'
import type { ProjectCommand } from '@git-manager/git-types'
import { getProjectCommands, getTerminalCommands, runTaskInTerminal } from '../lib/tauri'

export async function apiOpenUrl(url: string): Promise<void> {
  try {
    const { open } = await import('@tauri-apps/plugin-shell')
    await open(url)
  } catch (err) {
    console.error('Failed to open URL via Tauri shell, falling back to window.open:', err)
    window.open(url, '_blank')
  }
}

export async function apiOpenTerminal(path: string, command: string): Promise<void> {
  try {
    await invoke('open_in_terminal', { path, command })
  } catch (err) {
    console.error('Failed to open terminal:', err)
  }
}

export async function apiGetTerminalCommands(): Promise<string[]> {
  return getTerminalCommands()
}

/** Runs a project task's command in the configured external terminal at the repo path. Errors are
 * propagated so callers can surface them (unlike `apiOpenTerminal`, which is fire-and-forget). */
export async function apiRunTask(
  path: string,
  command: string,
  terminalCommand: string
): Promise<void> {
  await runTaskInTerminal(path, command, terminalCommand)
}

/** Lists the project's declared runnable commands (package.json scripts) for task autocomplete. */
export async function apiGetProjectCommands(path: string): Promise<ProjectCommand[]> {
  return getProjectCommands(path)
}
