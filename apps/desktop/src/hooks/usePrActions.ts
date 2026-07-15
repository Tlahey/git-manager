import { useCallback, useState } from 'react'
import { useSWRConfig } from 'swr'
import {
  postPrComment,
  submitPrReview,
  mergePullRequest,
  updatePullRequest,
  setPullRequestDraft,
  updatePrBranch,
  addReviewers,
  removeReviewers,
  addAssignees,
  removeAssignees,
  addLabels,
  removeLabel,
  type PrReviewEvent,
  type MergeMethod,
} from '../api/github.api'
import { useRepoGitHub } from './useRepoGitHub'

/** Interactive PR actions (comment, review, merge). Each awaits the GitHub write then revalidates
 * every open PR-related SWR key so the view (details, CI, list) reflects the change. */
export function usePrActions(repoPath: string | null, prNumber: number | null) {
  const { ownerRepo, token } = useRepoGitHub(repoPath)
  const { mutate } = useSWRConfig()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refreshPrData = useCallback(() => {
    // Revalidate this PR's detail/CI/files and any repo PR listing.
    return mutate(
      (key) =>
        Array.isArray(key) &&
        typeof key[0] === 'string' &&
        (key[0].startsWith('pr-') || key[0] === 'repo-pull-requests')
    )
  }, [mutate])

  const run = useCallback(
    async <T>(op: () => Promise<T>): Promise<T | undefined> => {
      if (!ownerRepo || !token || prNumber == null) return
      setPending(true)
      setError(null)
      try {
        const result = await op()
        await refreshPrData()
        return result
      } catch (e) {
        setError(String(e))
        throw e
      } finally {
        setPending(false)
      }
    },
    [ownerRepo, token, prNumber, refreshPrData]
  )

  const comment = useCallback(
    (body: string) =>
      run(() => postPrComment(ownerRepo!.owner, ownerRepo!.repo, prNumber!, body, token!)),
    [run, ownerRepo, prNumber, token]
  )

  const submitReview = useCallback(
    (input: { event: PrReviewEvent; body?: string }) =>
      run(() => submitPrReview(ownerRepo!.owner, ownerRepo!.repo, prNumber!, input, token!)),
    [run, ownerRepo, prNumber, token]
  )

  const merge = useCallback(
    (input: { mergeMethod: MergeMethod; commitTitle?: string; commitMessage?: string }) =>
      run(() => mergePullRequest(ownerRepo!.owner, ownerRepo!.repo, prNumber!, input, token!)),
    [run, ownerRepo, prNumber, token]
  )

  /** Edit the PR's title and/or body (GitHub `PATCH /pulls/{n}`). */
  const updatePr = useCallback(
    (patch: { title?: string; body?: string }) =>
      run(() => updatePullRequest(ownerRepo!.owner, ownerRepo!.repo, prNumber!, patch, token!)),
    [run, ownerRepo, prNumber, token]
  )

  /** Close or reopen the PR. */
  const setState = useCallback(
    (state: 'open' | 'closed') =>
      run(() => updatePullRequest(ownerRepo!.owner, ownerRepo!.repo, prNumber!, { state }, token!)),
    [run, ownerRepo, prNumber, token]
  )

  /** Toggle the draft flag (GraphQL — REST can't). Needs the PR's global `node_id`. */
  const toggleDraft = useCallback(
    (nodeId: string, draft: boolean) => run(() => setPullRequestDraft(nodeId, draft, token!)),
    [run, token]
  )

  /** Merge the base branch into the PR branch (the "Update branch" action when it's behind). */
  const updateBranch = useCallback(
    () => run(() => updatePrBranch(ownerRepo!.owner, ownerRepo!.repo, prNumber!, token!)),
    [run, ownerRepo, prNumber, token]
  )

  const requestReviewer = useCallback(
    (login: string) => run(() => addReviewers(ownerRepo!.owner, ownerRepo!.repo, prNumber!, [login], token!)),
    [run, ownerRepo, prNumber, token]
  )
  const unrequestReviewer = useCallback(
    (login: string) => run(() => removeReviewers(ownerRepo!.owner, ownerRepo!.repo, prNumber!, [login], token!)),
    [run, ownerRepo, prNumber, token]
  )
  const assign = useCallback(
    (login: string) => run(() => addAssignees(ownerRepo!.owner, ownerRepo!.repo, prNumber!, [login], token!)),
    [run, ownerRepo, prNumber, token]
  )
  const unassign = useCallback(
    (login: string) => run(() => removeAssignees(ownerRepo!.owner, ownerRepo!.repo, prNumber!, [login], token!)),
    [run, ownerRepo, prNumber, token]
  )
  const addLabel = useCallback(
    (name: string) => run(() => addLabels(ownerRepo!.owner, ownerRepo!.repo, prNumber!, [name], token!)),
    [run, ownerRepo, prNumber, token]
  )
  const deleteLabel = useCallback(
    (name: string) => run(() => removeLabel(ownerRepo!.owner, ownerRepo!.repo, prNumber!, name, token!)),
    [run, ownerRepo, prNumber, token]
  )

  return {
    comment,
    submitReview,
    merge,
    updatePr,
    setState,
    toggleDraft,
    updateBranch,
    requestReviewer,
    unrequestReviewer,
    assign,
    unassign,
    addLabel,
    deleteLabel,
    pending,
    error,
  }
}
