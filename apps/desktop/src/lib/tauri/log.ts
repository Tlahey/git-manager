import { invoke } from './invoke'
import type {
  GitGraphNode,
  GitLogHeadOverride,
  GitDiff,
  BlameHunk,
  FileHistoryEntry,
} from '@git-manager/git-types'

// ─── Log / Graph ──────────────────────────────────────────────────────────────

export const getLog = (
  path: string,
  opts?: {
    limit?: number
    skip?: number
    branch?: string
    /** Solo mode: branch shortNames to isolate — the graph loads only commits reachable from these
     * (Tauri camelCase → `solo_branches`). Takes precedence over the single-branch `branch` filter. */
    soloBranches?: string[]
    author?: string
    showStashes?: boolean
    hiddenStashes?: string[]
    /** Whether a synthetic WIP / paused-rebase row will be rendered above the graph — an input
     * of the Rust column layout (seeds HEAD's lane at column 0 only when that row exists). */
    headHasWip?: boolean
    /** Build the graph as if a branch pointed elsewhere — the timeline preview. Read-only. */
    headOverride?: GitLogHeadOverride
  }
) => invoke<GitGraphNode[]>('get_log', { path, ...opts })

/** A commit vs. one of its parents. `parentIndex` is 0-based and defaults to the first parent —
 *  only a merge commit has another (see the Rust `git_diff::commit_diff`). */
export const getCommitDiff = (path: string, oid: string, parentIndex?: number) =>
  invoke<GitDiff>('get_commit_diff', { path, oid, parentIndex })

/** Merged diff across a multi-commit selection: `baseOid^..headOid` (see the Rust command). */
export const getCommitsMergedDiff = (path: string, baseOid: string, headOid: string) =>
  invoke<GitDiff>('get_commits_merged_diff', { path, baseOid, headOid })

export const compareCommitToWorkdir = (path: string, oid: string) =>
  invoke<GitDiff>('compare_commit_to_workdir', { path, oid })

/** Direct (two-dot) diff between two refs — `git diff <baseRef> <headRef>`. Either side can be a
 *  branch, a remote branch, a tag or a SHA (see the Rust `compare_refs` command). */
export const compareRefs = (path: string, baseRef: string, headRef: string) =>
  invoke<GitDiff>('compare_refs', { path, baseRef, headRef })

export const getCommitFile = (path: string, oid: string, filePath: string) =>
  invoke<string>('get_commit_file', { path, oid, filePath })

// ─── Blame / File history ───────────────────────────────────────────────────────

export const gitBlameFile = (path: string, filePath: string, oid?: string) =>
  invoke<BlameHunk[]>('git_blame_file', { path, filePath, oid })

export const getFileHistory = (path: string, filePath: string, limit?: number) =>
  invoke<FileHistoryEntry[]>('get_file_history', { path, filePath, limit })

/** Short name of the earliest tag whose history contains `oid`, or null. */
export const getTagContainingCommit = (path: string, oid: string) =>
  invoke<string | null>('get_tag_containing_commit', { path, oid })
