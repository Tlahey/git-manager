import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { mutate } from 'swr'
import { toast } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import type { BisectTerm } from '@git-manager/git-types'
import {
  apiBisectMark,
  apiBisectReset,
  apiBisectStart,
  apiStashPush,
  apiStashPop,
} from '../api/git.api'
import { bisectStateKey } from './useBisectState'
import { useBisectUIStore } from '../stores/bisectUI.store'

/** Message tagged on the stash git-manager creates for a bisect, so it's identifiable in the list. */
const BISECT_STASH_MESSAGE = 'git-manager: bisect autostash'

/**
 * Shared bisect action handlers (start, mark good/bad/skip, reset/abort, and the auto-stash
 * lifecycle). Marking moves HEAD to the next commit to test, so both the bisect-state SWR cache and
 * the graph's log/status react-query caches are refreshed. Used by the top banner, the right-hand
 * panel and the setup/stash dialogs so their buttons behave identically.
 */
export function useBisectActions(repoPath: string) {
  const { t } = useTranslation('git')
  const queryClient = useQueryClient()
  const [pending, setPending] = useState(false)

  function refreshGraph() {
    queryClient.invalidateQueries({ queryKey: ['git-log', repoPath] })
    queryClient.invalidateQueries({ queryKey: ['git-status', repoPath] })
    mutate(['git-stashes', repoPath])
  }

  /** Returns `true` when the bisect started, `false` when it failed (e.g. a dirty worktree). */
  async function start(badRev: string, goodRev: string): Promise<boolean> {
    if (pending) return false
    setPending(true)
    try {
      const state = await apiBisectStart(repoPath, badRev, goodRev)
      mutate(bisectStateKey(repoPath), state, { revalidate: false })
      refreshGraph()
      toast.success(t('bisect.start.started'))
      return true
    } catch (err) {
      toast.error(String(err))
      return false
    } finally {
      setPending(false)
    }
  }

  /**
   * Stashes all working changes up front, before the commit selection, so bisect's successive
   * checkouts run against a clean tree. Flags the session as auto-stashed so the stash is popped
   * back automatically when the bisect ends (or the setup is cancelled) — see {@link restoreStash}.
   */
  async function stashForBisect(): Promise<boolean> {
    if (pending) return false
    setPending(true)
    try {
      await apiStashPush(repoPath, BISECT_STASH_MESSAGE, true)
      useBisectUIStore.getState().setAutoStashed(true)
      refreshGraph()
      return true
    } catch (err) {
      toast.error(String(err))
      return false
    } finally {
      setPending(false)
    }
  }

  async function mark(term: BisectTerm) {
    if (pending) return
    setPending(true)
    try {
      const state = await apiBisectMark(repoPath, term)
      mutate(bisectStateKey(repoPath), state, { revalidate: false })
      refreshGraph()
      if (state.firstBadOid) toast.success(t('bisect.result.found'))
    } catch (err) {
      toast.error(String(err))
    } finally {
      setPending(false)
    }
  }

  /**
   * Ends the session (abort or finish). When the session auto-stashed at start, the stash is popped
   * back automatically afterwards to restore the pre-bisect working tree — no prompt. The pop runs
   * after the reset's pending window so {@link restoreStash}'s own guard doesn't bail on it.
   */
  async function reset() {
    if (pending) return
    setPending(true)
    let didReset = false
    try {
      const state = await apiBisectReset(repoPath)
      mutate(bisectStateKey(repoPath), state, { revalidate: false })
      refreshGraph()
      didReset = true
    } catch (err) {
      toast.error(String(err))
    } finally {
      setPending(false)
    }
    if (didReset && useBisectUIStore.getState().autoStashed) {
      await restoreStash()
    }
  }

  /** Pops the bisect auto-stash back into the working tree, restoring the pre-bisect state. */
  async function restoreStash(): Promise<boolean> {
    if (pending) return false
    setPending(true)
    try {
      await apiStashPop(repoPath)
      refreshGraph()
      toast.success(t('bisect.restore.done'))
      return true
    } catch (err) {
      toast.error(String(err))
      return false
    } finally {
      useBisectUIStore.getState().setAutoStashed(false)
      setPending(false)
    }
  }

  return { start, stashForBisect, mark, reset, restoreStash, pending }
}
