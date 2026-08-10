import { invoke } from './invoke'
import type {
  GitRepo,
  GitStatus,
  GitSubmodule,
  GitRepoSummary,
  ProjectCommand,
  TerminalHistorySource,
} from '@git-manager/git-types'

// ─── Repository ───────────────────────────────────────────────────────────────

export const openRepo = (path: string) => invoke<GitRepo>('open_repo', { path })

export const getRepoStatus = (path: string) => invoke<GitStatus>('get_repo_status', { path })

/** The multi-step git operation in progress (`merge`, `rebase`, `cherry_pick`, `revert`, `bisect`,
 * `apply_mailbox`), or `null` when there is none. */
export const getPendingOperation = (path: string) =>
  invoke<string | null>('get_pending_operation', { path })

export const scanRepos = (rootPath: string, maxDepth: number) =>
  invoke<string[]>('scan_repos', { rootPath, maxDepth })

/** Tracked file paths of the repo (`git ls-files`), sorted and de-duplicated. */
export const listTrackedFiles = (path: string) => invoke<string[]>('list_tracked_files', { path })

/** All repository files (tracked and untracked, excluding gitignored). */
export const getRepoFiles = (path: string) => invoke<string[]>('get_repo_files', { path })

export const cloneRepo = (url: string, destPath: string, shallow?: boolean, sparse?: boolean) =>
  invoke<GitRepo>('clone_repo', { url, destPath, shallow, sparse })

export const initRepo = (path: string) => invoke<GitRepo>('init_repo', { path })

// ─── Extended Repo Stats & Tools ─────────────────────────────────────────────

export const getRepoSummary = (path: string) => invoke<GitRepoSummary>('get_repo_summary', { path })

export const openInEditor = (path: string, command: string) =>
  invoke<void>('open_in_editor', { path, command })

/** Reveals an arbitrary filesystem path in the Finder — e.g. a linked worktree's directory. */
export const revealPathInFinder = (path: string) => invoke<void>('reveal_path_in_finder', { path })

export const getRepoReadme = (path: string) => invoke<string>('get_repo_readme', { path })

export const getTerminalCommands = () => invoke<TerminalHistorySource[]>('get_terminal_commands')

/** Runs a project task's `command` in the configured external terminal (`terminalCommand`, empty →
 * system default), with `path` (the repo) as the working directory. */
export const runTaskInTerminal = (path: string, command: string, terminalCommand: string) =>
  invoke<void>('run_task_in_terminal', { path, command, terminalCommand })

/** Lists runnable commands declared by the project at `path` (today: package.json scripts). */
export const getProjectCommands = (path: string) =>
  invoke<ProjectCommand[]>('get_project_commands', { path })

// ─── Submodules ───────────────────────────────────────────────────────────────

export const listSubmodules = (path: string) => invoke<GitSubmodule[]>('list_submodules', { path })
