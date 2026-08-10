import { invoke } from './invoke'
// `create_fixup_commit` returns the same shape as an ordinary commit — see `workingTree.ts`,
// which owns the type because that is where the command it mirrors lives.
import type { CommitResult } from './workingTree'
import type {
  RebaseState,
  RebaseTodoStep,
  BisectState,
  BisectTerm,
  GitCommit,
  ThreeWayMergeView,
} from '@git-manager/git-types'

// ─── Rebase ───────────────────────────────────────────────────────────────────

export const getRebaseState = (path: string) => invoke<RebaseState>('get_rebase_state', { path })

/** Commits from `baseOid` (inclusive) up to HEAD, oldest first. */
export const listRebaseCommits = (path: string, baseOid: string) =>
  invoke<GitCommit[]>('list_rebase_commits', { path, baseOid })

/** Runs `git rebase -i` with the UI-built todo list. A conflict pause is not an error. */
export const runInteractiveRebase = (path: string, baseOid: string, steps: RebaseTodoStep[]) =>
  invoke<void>('run_interactive_rebase', { path, baseOid, steps })

export const continueRebase = (path: string, message?: string) =>
  invoke<void>('continue_rebase', { path, message })

export const abortRebase = (path: string) => invoke<void>('abort_rebase', { path })

export const skipRebase = (path: string) => invoke<void>('skip_rebase', { path })

export const rebaseOntoCommit = (path: string, targetOid: string) =>
  invoke<void>('rebase_onto_commit', { path, targetOid })

// ─── Bisect ─────────────────────────────────────────────────────────────────

export const getBisectState = (path: string) => invoke<BisectState>('get_bisect_state', { path })

/** Whether `goodRev` is an ancestor of `badRev` — the only valid bisect orientation. */
export const bisectCheckRange = (path: string, badRev: string, goodRev: string) =>
  invoke<boolean>('bisect_check_range', { path, badRev, goodRev })

/** Starts a bisect session, marking `badRev` bad and `goodRev` good in one shot. */
export const bisectStart = (path: string, badRev: string, goodRev: string) =>
  invoke<BisectState>('bisect_start', { path, badRev, goodRev })

/** Marks the commit currently under test as good/bad/skip and advances. */
export const bisectMark = (path: string, term: BisectTerm) =>
  invoke<BisectState>('bisect_mark', { path, term })

/** Ends the bisect session, restoring the original branch/HEAD. */
export const bisectReset = (path: string) => invoke<BisectState>('bisect_reset', { path })

// ─── Conflict Resolution ──────────────────────────────────────────────────────

export const listConflictedFiles = (path: string) =>
  invoke<string[]>('list_conflicted_files', { path })

export const getMergeView = (path: string, filePath: string) =>
  invoke<ThreeWayMergeView>('get_merge_view', { path, filePath })

export const autoMergeConflictView = (path: string, filePath: string) =>
  invoke<string>('auto_merge_conflict_view', { path, filePath })

export const resolveConflict = (path: string, filePath: string, resolvedContent: string) =>
  invoke<void>('resolve_conflict', { path, filePath, resolvedContent })

export const resolveConflictBinary = (path: string, filePath: string, side: 'ours' | 'theirs') =>
  invoke<void>('resolve_conflict_binary', { path, filePath, side })

// ─── Fixup ────────────────────────────────────────────────────────────────────

export interface FixupInfo {
  fixupOid: string
  fixupShortOid: string
  targetOid: string
  targetSubject: string
}

export interface AutosquashGroup {
  baseOid: string
  baseSubject: string
  fixups: string[]
}

export const createFixupCommit = (path: string, targetOid: string, message?: string) =>
  invoke<CommitResult>('create_fixup_commit', { path, targetOid, message })

export interface FixupRiskCommit {
  oid: string
  shortOid: string
  subject: string
}

export interface FixupFileRisk {
  path: string
  commits: FixupRiskCommit[]
}

export interface FixupTargetWarnings {
  missingInTarget: string[]
  touchedAfterTarget: FixupFileRisk[]
}

export const checkFixupTarget = (path: string, targetOid: string) =>
  invoke<FixupTargetWarnings>('check_fixup_target', { path, targetOid })

export const getPendingFixups = (path: string) =>
  invoke<FixupInfo[]>('get_pending_fixups', { path })

export const autosquashPreview = (path: string) =>
  invoke<AutosquashGroup[]>('autosquash_preview', { path })

export const runAutosquash = (path: string) => invoke<void>('run_autosquash', { path })

// ─── Cherry-pick ──────────────────────────────────────────────────────────────

export const cherryPickCommit = (path: string, oid: string) =>
  invoke<string>('cherry_pick_commit', { path, oid })
