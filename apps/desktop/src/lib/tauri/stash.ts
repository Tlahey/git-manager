import { invoke } from './invoke'
import type { GitStash } from '@git-manager/git-types'

// ─── Stash ────────────────────────────────────────────────────────────────────

export const stashList = (path: string) => invoke<GitStash[]>('stash_list', { path })

export const stashPush = (path: string, message?: string, includeUntracked = false) =>
  invoke<void>('stash_push', { path, message, includeUntracked })

export const stashPop = (path: string, index?: number) => invoke<void>('stash_pop', { path, index })

export const stashApply = (path: string, index?: number) =>
  invoke<void>('stash_apply', { path, index })

export const stashDrop = (path: string, index: number) =>
  invoke<void>('stash_drop', { path, index })

export const stashStore = (path: string, commitOid: string, message: string) =>
  invoke<void>('stash_store', { path, commitOid, message })

export const editStashMessage = (path: string, index: number, message: string) =>
  invoke<void>('edit_stash_message', { path, index, message })
