import { invoke } from './invoke'
import type { GitWorktree, WorktreeAddResult, WorktreeAgentActivity } from '@git-manager/git-types'

// ─── Worktree ─────────────────────────────────────────────────────────────────

export const listWorktrees = (path: string) => invoke<GitWorktree[]>('list_worktrees', { path })

export const addWorktree = (
  path: string,
  branch: string,
  worktreePath: string,
  defaultFiles?: string[]
) => invoke<WorktreeAddResult>('add_worktree', { path, branch, worktreePath, defaultFiles })

/** Per-pattern count (aligned by index) of repo files each default-file glob matches — a live
 * preview for the worktree-creation UI. */
export const countDefaultFileMatches = (path: string, patterns: string[]) =>
  invoke<number[]>('count_default_file_matches', { path, patterns })

export const removeWorktree = (path: string, worktreePath: string, force = false) =>
  invoke<void>('remove_worktree', { path, worktreePath, force })

export const pruneWorktrees = (path: string) => invoke<void>('prune_worktrees', { path })

/** Local branch names whose upstream remote branch is gone (merged & pruned) — bulk-removal signal. */
export const goneUpstreamBranches = (path: string) =>
  invoke<string[]>('gone_upstream_branches', { path })

/** For each given worktree path, whether an AI coding agent (Claude Code) is currently working in
 * it — derived from the agent's on-disk session logs. Only worktrees with a recent session are
 * returned. */
export const getWorktreeAgentActivity = (paths: string[]) =>
  invoke<WorktreeAgentActivity[]>('get_worktree_agent_activity', { paths })
