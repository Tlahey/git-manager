import { useCallback, useState } from 'react'
import { useSWRConfig } from 'swr'
import { toast } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import { updateIssue } from '../api/github.api'
import { useRepoGitHub } from './useRepoGitHub'

/**
 * Edit an issue's title/body from the in-app panel. Awaits the GitHub `PATCH`, then revalidates every
 * open `issue-detail` SWR key so the view reflects the change. `canEdit` is false when signed out or
 * the repo isn't a resolvable GitHub repo, so callers can hide the edit affordances.
 */
export function useIssueEdit(repoPath: string | null, issueNumber: number | null) {
  const { t } = useTranslation('git')
  const { ownerRepo, token } = useRepoGitHub(repoPath)
  const { mutate } = useSWRConfig()
  const [pending, setPending] = useState(false)

  const update = useCallback(
    async (patch: { title?: string; body?: string }) => {
      if (!ownerRepo || !token || issueNumber == null) return
      setPending(true)
      try {
        await updateIssue(ownerRepo.owner, ownerRepo.repo, issueNumber, patch, token)
        await mutate((key) => Array.isArray(key) && key[0] === 'issue-detail')
      } catch (e) {
        toast.error(t('issue.view.editFailed'), { description: String(e) })
        throw e
      } finally {
        setPending(false)
      }
    },
    [ownerRepo, token, issueNumber, mutate, t]
  )

  return { update, pending, canEdit: !!ownerRepo && !!token }
}
