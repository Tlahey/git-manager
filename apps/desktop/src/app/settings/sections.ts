/**
 * The settings side panel's page ids.
 *
 * In their own module because the tab table, the search matcher and the page itself all name them,
 * and the first two are imported *by* the page — putting the ids there would make every one of them
 * depend on the whole page's import graph.
 */

export type Section =
  | 'general'
  | 'ssh'
  | 'integrations'
  | 'local_ai'
  | 'ai_features'
  | 'external_tools'
  | 'notifications'
  | 'board'
  | 'ui_customization'
  | 'rewards'
  | 'changelog'
  | 'support'

/** Top-level split: global settings (all repos) vs. settings local to the current workspace/repo. */
export type Scope = 'general' | 'local'

/** The Repository scope's own side-menu pages. `gitflow`, `worktree` and `run` are repo-only (no
 * global counterpart); `appearance` and `ai_commit` mirror the matching global sections. */
export type LocalSection = 'gitflow' | 'appearance' | 'ai_commit' | 'worktree' | 'run'
