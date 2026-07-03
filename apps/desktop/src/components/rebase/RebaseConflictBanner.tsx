import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from '@git-manager/i18n'
import { Button, Spinner } from '@git-manager/ui'
import { apiGetRebaseState, apiRebaseContinue, apiRebaseAbort } from '../../api/git.api'

interface RebaseConflictBannerProps {
  repoPath: string
}

/**
 * Surfaces a paused rebase (conflict or reword/edit stop) with Continue/Abort actions.
 * Shares the same `['rebase-state', repoPath]` polling query as `StateTags`'s "REBASING"
 * badge so the two stay in sync off a single 4s poll rather than a second poller.
 */
export function RebaseConflictBanner({ repoPath }: RebaseConflictBannerProps) {
  const { t } = useTranslation('git')
  const queryClient = useQueryClient()
  const [isLoading, setIsLoading] = useState<'continue' | 'abort' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: rebaseState } = useQuery({
    queryKey: ['rebase-state', repoPath],
    queryFn: () => apiGetRebaseState(repoPath),
    enabled: !!repoPath,
    refetchInterval: 4000,
  })

  const isPaused = rebaseState?.kind === 'conflict' || rebaseState?.kind === 'edit_pause'
  if (!isPaused) return null

  async function refresh() {
    queryClient.invalidateQueries({ queryKey: ['rebase-state', repoPath] })
    queryClient.invalidateQueries({ queryKey: ['git-log', repoPath] })
    queryClient.invalidateQueries({ queryKey: ['git-status', repoPath] })
  }

  async function handleContinue() {
    setIsLoading('continue')
    setError(null)
    try {
      await apiRebaseContinue(repoPath)
      await refresh()
    } catch (err) {
      setError(String(err))
    } finally {
      setIsLoading(null)
    }
  }

  async function handleAbort() {
    setIsLoading('abort')
    setError(null)
    try {
      await apiRebaseAbort(repoPath)
      await refresh()
    } catch (err) {
      setError(String(err))
    } finally {
      setIsLoading(null)
    }
  }

  return (
    <div className="pointer-events-auto fixed bottom-4 left-1/2 z-50 w-full max-w-md -translate-x-1/2 rounded-md border border-destructive/50 bg-popover px-4 py-3 text-sm shadow-lg">
      <p className="font-medium text-foreground">
        {rebaseState?.kind === 'conflict'
          ? t('gitTree.contextMenu.rebaseConflict')
          : t('gitTree.contextMenu.rebaseEditPause')}
      </p>
      {rebaseState?.conflictedFiles && rebaseState.conflictedFiles.length > 0 && (
        <ul className="mt-1 max-h-24 overflow-y-auto text-xs text-muted-foreground">
          {rebaseState.conflictedFiles.map((f) => (
            <li key={f} className="truncate">{f}</li>
          ))}
        </ul>
      )}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      <div className="mt-2 flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={handleAbort} disabled={!!isLoading}>
          {isLoading === 'abort' && <Spinner className="mr-1 h-3 w-3" />}
          {t('gitTree.contextMenu.rebaseAbort')}
        </Button>
        <Button size="sm" onClick={handleContinue} disabled={!!isLoading}>
          {isLoading === 'continue' && <Spinner className="mr-1 h-3 w-3" />}
          {t('gitTree.contextMenu.rebaseContinue')}
        </Button>
      </div>
    </div>
  )
}
