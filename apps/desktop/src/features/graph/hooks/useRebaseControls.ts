import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { mutate } from 'swr'
import { apiRebaseAbort, apiRebaseContinue, apiRebaseSkip } from '../../../api/git.api'

/** Which control is in flight, so callers can spin only the button that was pressed. */
export type RebaseControl = 'continue' | 'abort' | 'skip'

interface UseRebaseControlsOptions {
  /**
   * Ran after a control finishes the rebase step it was given — i.e. after continue/abort, which
   * either end the rebase or move it on. Lets the caller drop whatever view it had open on the
   * step that no longer exists. Skip doesn't call it: it stays on the same paused rebase.
   */
  onStepFinished?: () => void
}

/**
 * The three ways out of a paused rebase — continue, skip, abort — with their in-flight state,
 * their error, and the cache invalidation each one needs.
 *
 * Shared by every view that offers them (the conflict panel on the right, the rebase progress
 * view in the center) so a new entry point can't forget to refresh half the app: a rebase step
 * moves HEAD, so the rebase state, the working tree and the commit log all go stale at once.
 */
export function useRebaseControls(repoPath: string, options: UseRebaseControlsOptions = {}) {
  const { onStepFinished } = options
  const queryClient = useQueryClient()
  const [pending, setPending] = useState<RebaseControl | null>(null)
  const [error, setError] = useState<string | null>(null)

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['rebase-state', repoPath] })
    queryClient.invalidateQueries({ queryKey: ['git-status', repoPath] })
    queryClient.invalidateQueries({ queryKey: ['git-log', repoPath] })
    mutate(['conflicted-files', repoPath])
    mutate(['rebase-state', repoPath])
  }

  async function run(control: RebaseControl, action: () => Promise<unknown>, finishes: boolean) {
    setPending(control)
    setError(null)
    try {
      await action()
      if (finishes) onStepFinished?.()
      refresh()
    } catch (err) {
      setError(String(err))
    } finally {
      setPending(null)
    }
  }

  return {
    pending,
    error,
    /** `message` reuses the step's own commit message unless the caller amends it. */
    continueRebase: (message?: string) =>
      run('continue', () => apiRebaseContinue(repoPath, message), true),
    skipStep: () => run('skip', () => apiRebaseSkip(repoPath), false),
    abortRebase: () => run('abort', () => apiRebaseAbort(repoPath), true),
  }
}
