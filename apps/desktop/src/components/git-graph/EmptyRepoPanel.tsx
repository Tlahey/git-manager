import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Button, Spinner, Card } from '@git-manager/ui'
import { GitCommitHorizontal } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { apiCreateCommit, apiGetRemotes, apiPushBranch } from '../../api/git.api'
import { useRepoUIStore } from '../../stores/repoUI.store'

interface EmptyRepoPanelProps {
  repoPath: string
}

/**
 * Shown in the center panel when a repo has no commits yet (a freshly cloned/initialized repo with
 * an unborn HEAD) — the graph is empty and the normal WIP commit row can't render (its connector
 * math needs a first commit). Offers to create an empty initial commit so the repo becomes usable;
 * afterwards the working files appear in the normal WIP row for a real commit. Cancel closes the
 * repo tab (falling back to the last open tab), same as the tab bar's close button.
 */
export function EmptyRepoPanel({ repoPath }: EmptyRepoPanelProps) {
  const { t } = useTranslation('git')
  const queryClient = useQueryClient()
  const closeTab = useRepoUIStore((s) => s.closeTab)
  const [initializing, setInitializing] = useState(false)
  const [committed, setCommitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const repoName = repoPath.split('/').filter(Boolean).pop() ?? repoPath

  async function initialize() {
    setInitializing(true)
    setError(null)
    try {
      // GitHub's fresh-repo flow: make the first commit, then push it to establish the branch on the
      // remote (a PR's base branch must exist there). `committed` guards against a duplicate empty
      // commit if a first attempt committed but the push then failed and the user retries.
      if (!committed) {
        await apiCreateCommit(repoPath, 'Initial commit')
        setCommitted(true)
      }
      const remotes = await apiGetRemotes(repoPath).catch(() => [])
      if (remotes.length > 0) {
        await apiPushBranch(repoPath)
      }
      // The first commit is born (and published): refresh so the normal graph takes over.
      queryClient.invalidateQueries({ queryKey: ['git-log', repoPath] })
      queryClient.invalidateQueries({ queryKey: ['git-status', repoPath] })
      queryClient.invalidateQueries({ queryKey: ['branches', repoPath] })
    } catch (e) {
      setError(String(e))
    } finally {
      setInitializing(false)
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Card
        data-testid="empty-repo-panel"
        className="max-w-sm space-y-3 p-5 text-center"
      >
        <GitCommitHorizontal className="mx-auto h-6 w-6 text-muted-foreground" />
        <p className="text-sm text-foreground">{t('emptyRepo.message', { repo: repoName })}</p>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex justify-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => closeTab(repoPath)}
            disabled={initializing}
            data-testid="empty-repo-cancel"
          >
            {t('emptyRepo.cancel')}
          </Button>
          <Button
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={initialize}
            disabled={initializing}
            data-testid="empty-repo-initialize"
          >
            {initializing && <Spinner className="h-3 w-3" />}
            {initializing ? t('emptyRepo.initializing') : t('emptyRepo.initialize')}
          </Button>
        </div>
      </Card>
    </div>
  )
}
