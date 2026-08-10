import { invoke } from './invoke'
import type { GitBranch, MergeTargetStatus, GitRef } from '@git-manager/git-types'

// ─── Branches ─────────────────────────────────────────────────────────────────

export const getBranches = (path: string, includeRemote = true) =>
  invoke<GitBranch[]>('get_branches', { path, includeRemote })

export const getTags = (path: string) => invoke<GitRef[]>('get_tags', { path })

export const createBranch = (path: string, name: string, fromRef: string) =>
  invoke<void>('create_branch', { path, name, fromRef })

export const checkoutBranch = (path: string, refName: string, force = false) =>
  invoke<void>('checkout_branch', { path, refName, force })

export const deleteBranch = (path: string, name: string, force = false, deleteRemote = false) =>
  invoke<void>('delete_branch', { path, name, force, deleteRemote })

/** Deletes branch `branchName` on `remote` (default "origin") — `git push origin :refs/heads/<name>`. */
export const deleteRemoteBranch = (path: string, branchName: string, remote?: string) =>
  invoke<void>('delete_remote_branch', { path, branchName, remote })

export const mergeBranch = (path: string, source: string, target: string) =>
  invoke<void>('merge_branch', { path, source, target })

export const fastForwardBranch = (path: string, source: string, target: string) =>
  invoke<void>('fast_forward_branch', { path, source, target })

/** Sets local branch `name`'s upstream to `upstream` (a remote-tracking branch's short name, e.g.
 * `origin/main`) — `git branch --set-upstream-to`. */
export const setBranchUpstream = (path: string, name: string, upstream: string) =>
  invoke<void>('set_branch_upstream', { path, name, upstream })

/** Relation between HEAD and the first of `candidates` that exists in the repo (merge simulated
 * in memory — nothing is written to the repository). */
export const getMergeTargetStatus = (path: string, candidates: string[]) =>
  invoke<MergeTargetStatus>('get_merge_target_status', { path, candidates })

export const renameBranch = (path: string, oldName: string, newName: string) =>
  invoke<void>('rename_branch', { path, oldName, newName })

export const recreateBranchRef = (path: string, name: string, oid: string, upstream?: string) =>
  invoke<void>('recreate_branch_ref', { path, name, oid, upstream })

export const createTag = (path: string, name: string, fromRef: string, message?: string) =>
  invoke<void>('create_tag', { path, name, fromRef, message })

export const deleteTag = (path: string, name: string) => invoke<void>('delete_tag', { path, name })

/** Deletes tag `tagName` on `remote` (default "origin") — `git push origin :refs/tags/<name>`. */
export const deleteRemoteTag = (path: string, tagName: string, remote?: string) =>
  invoke<void>('delete_remote_tag', { path, tagName, remote })

/** Publishes a tag to `remote` (default "origin") — `git push origin <name>`. */
export const pushTag = (path: string, tagName: string, remote?: string) =>
  invoke<void>('push_tag', { path, tagName, remote })

/** Tag's GitHub release page URL on `remote` (default "origin"), or null if not a GitHub remote. */
export const getTagWebUrl = (path: string, tagName: string, remote?: string) =>
  invoke<string | null>('get_tag_web_url', { path, tagName, remote })

/** Branch's GitHub tree page URL on `remote` (default "origin"), or null if not a GitHub remote. */
export const getBranchWebUrl = (path: string, branchName: string, remote?: string) =>
  invoke<string | null>('get_branch_web_url', { path, branchName, remote })
