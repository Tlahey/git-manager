import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, render, act, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import useSWR, { SWRConfig } from 'swr'

const postPrComment = vi.fn()
const submitPrReview = vi.fn()
const mergePullRequest = vi.fn()
const updatePullRequest = vi.fn()
const setPullRequestDraft = vi.fn()
const updatePrBranch = vi.fn()
const addReviewers = vi.fn()
const removeReviewers = vi.fn()
const addAssignees = vi.fn()
const removeAssignees = vi.fn()
const addLabels = vi.fn()
const removeLabel = vi.fn()
vi.mock('../api/github.api', () => ({
  postPrComment: (...a: unknown[]) => postPrComment(...a),
  submitPrReview: (...a: unknown[]) => submitPrReview(...a),
  mergePullRequest: (...a: unknown[]) => mergePullRequest(...a),
  updatePullRequest: (...a: unknown[]) => updatePullRequest(...a),
  setPullRequestDraft: (...a: unknown[]) => setPullRequestDraft(...a),
  updatePrBranch: (...a: unknown[]) => updatePrBranch(...a),
  addReviewers: (...a: unknown[]) => addReviewers(...a),
  removeReviewers: (...a: unknown[]) => removeReviewers(...a),
  addAssignees: (...a: unknown[]) => addAssignees(...a),
  removeAssignees: (...a: unknown[]) => removeAssignees(...a),
  addLabels: (...a: unknown[]) => addLabels(...a),
  removeLabel: (...a: unknown[]) => removeLabel(...a),
}))

const useRepoGitHub = vi.fn()
vi.mock('./useRepoGitHub', () => ({ useRepoGitHub: () => useRepoGitHub() }))

import { usePrActions } from './usePrActions'

const wrapper = ({ children }: { children: React.ReactNode }) =>
  createElement(SWRConfig, { value: { provider: () => new Map(), dedupingInterval: 0 } }, children)

beforeEach(() => {
  vi.clearAllMocks()
  useRepoGitHub.mockReturnValue({ ownerRepo: { owner: 'org', repo: 'repo' }, token: 'tok' })
  postPrComment.mockResolvedValue({ id: 1 })
  submitPrReview.mockResolvedValue({ id: 2 })
  mergePullRequest.mockResolvedValue({ merged: true })
  updatePullRequest.mockResolvedValue({ number: 7 })
  setPullRequestDraft.mockResolvedValue(true)
  updatePrBranch.mockResolvedValue(undefined)
  addReviewers.mockResolvedValue(undefined)
  removeReviewers.mockResolvedValue(undefined)
  addAssignees.mockResolvedValue(undefined)
  removeAssignees.mockResolvedValue(undefined)
  addLabels.mockResolvedValue(undefined)
  removeLabel.mockResolvedValue(undefined)
})

describe('usePrActions', () => {
  it('posts a comment', async () => {
    const { result } = renderHook(() => usePrActions('/repo', 7), { wrapper })
    await act(async () => {
      await result.current.comment('hi')
    })
    expect(postPrComment).toHaveBeenCalledWith('org', 'repo', 7, 'hi', 'tok')
  })

  it('submits a review', async () => {
    const { result } = renderHook(() => usePrActions('/repo', 7), { wrapper })
    await act(async () => {
      await result.current.submitReview({ event: 'APPROVE', body: 'lgtm' })
    })
    expect(submitPrReview).toHaveBeenCalledWith('org', 'repo', 7, { event: 'APPROVE', body: 'lgtm' }, 'tok')
  })

  it('merges', async () => {
    const { result } = renderHook(() => usePrActions('/repo', 7), { wrapper })
    await act(async () => {
      await result.current.merge({ mergeMethod: 'squash' })
    })
    expect(mergePullRequest).toHaveBeenCalledWith('org', 'repo', 7, { mergeMethod: 'squash' }, 'tok')
  })

  it('updates the PR title/body', async () => {
    const { result } = renderHook(() => usePrActions('/repo', 7), { wrapper })
    await act(async () => {
      await result.current.updatePr({ title: 'New', body: 'B' })
    })
    expect(updatePullRequest).toHaveBeenCalledWith('org', 'repo', 7, { title: 'New', body: 'B' }, 'tok')
  })

  it('closes / reopens via the state patch', async () => {
    const { result } = renderHook(() => usePrActions('/repo', 7), { wrapper })
    await act(async () => {
      await result.current.setState('closed')
    })
    expect(updatePullRequest).toHaveBeenCalledWith('org', 'repo', 7, { state: 'closed' }, 'tok')
  })

  it('toggles draft via the GraphQL helper (by node id)', async () => {
    const { result } = renderHook(() => usePrActions('/repo', 7), { wrapper })
    await act(async () => {
      await result.current.toggleDraft('PR_node', true)
    })
    expect(setPullRequestDraft).toHaveBeenCalledWith('PR_node', true, 'tok')
  })

  it('updates the branch (merges base in)', async () => {
    const { result } = renderHook(() => usePrActions('/repo', 7), { wrapper })
    await act(async () => {
      await result.current.updateBranch()
    })
    expect(updatePrBranch).toHaveBeenCalledWith('org', 'repo', 7, 'tok')
  })

  it('requests and un-requests a reviewer', async () => {
    const { result } = renderHook(() => usePrActions('/repo', 7), { wrapper })
    await act(async () => {
      await result.current.requestReviewer('carol')
    })
    expect(addReviewers).toHaveBeenCalledWith('org', 'repo', 7, ['carol'], 'tok')
    await act(async () => {
      await result.current.unrequestReviewer('carol')
    })
    expect(removeReviewers).toHaveBeenCalledWith('org', 'repo', 7, ['carol'], 'tok')
  })

  it('assigns and unassigns a user', async () => {
    const { result } = renderHook(() => usePrActions('/repo', 7), { wrapper })
    await act(async () => {
      await result.current.assign('dave')
    })
    expect(addAssignees).toHaveBeenCalledWith('org', 'repo', 7, ['dave'], 'tok')
    await act(async () => {
      await result.current.unassign('dave')
    })
    expect(removeAssignees).toHaveBeenCalledWith('org', 'repo', 7, ['dave'], 'tok')
  })

  it('adds and removes a label', async () => {
    const { result } = renderHook(() => usePrActions('/repo', 7), { wrapper })
    await act(async () => {
      await result.current.addLabel('bug')
    })
    expect(addLabels).toHaveBeenCalledWith('org', 'repo', 7, ['bug'], 'tok')
    await act(async () => {
      await result.current.deleteLabel('bug')
    })
    expect(removeLabel).toHaveBeenCalledWith('org', 'repo', 7, 'bug', 'tok')
  })

  it('records an error when an action fails', async () => {
    postPrComment.mockRejectedValueOnce(new Error('nope'))
    const { result } = renderHook(() => usePrActions('/repo', 7), { wrapper })
    await act(async () => {
      await expect(result.current.comment('x')).rejects.toThrow()
    })
    await waitFor(() => expect(result.current.error).toContain('nope'))
  })

  it('is a no-op when signed out', async () => {
    useRepoGitHub.mockReturnValue({ ownerRepo: null, token: null })
    const { result } = renderHook(() => usePrActions('/repo', 7), { wrapper })
    await act(async () => {
      await result.current.comment('x')
    })
    expect(postPrComment).not.toHaveBeenCalled()
  })
})

describe('usePrActions — cross-cache revalidation on status-changing actions', () => {
  function harness(githubDataFetcher: () => Promise<unknown>, commitPrFetcher: () => Promise<unknown>) {
    let actions!: ReturnType<typeof usePrActions>
    function Harness() {
      useSWR(['github-data', 'tok', 'me'], githubDataFetcher)
      useSWR(['commit-pr', 'org', 'repo', 'sha', 'tok'], commitPrFetcher)
      actions = usePrActions('/repo', 7)
      return null
    }
    render(
      createElement(
        SWRConfig,
        { value: { provider: () => new Map(), dedupingInterval: 0 } },
        createElement(Harness)
      )
    )
    return () => actions
  }

  it('merge revalidates the global PR list ("github-data") and commit-PR annotation caches', async () => {
    const githubDataFetcher = vi.fn().mockResolvedValue({ prs: [] })
    const commitPrFetcher = vi.fn().mockResolvedValue(null)
    const getActions = harness(githubDataFetcher, commitPrFetcher)

    await waitFor(() => expect(githubDataFetcher).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(commitPrFetcher).toHaveBeenCalledTimes(1))

    await act(async () => {
      await getActions().merge({ mergeMethod: 'merge' })
    })

    await waitFor(() => expect(githubDataFetcher).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(commitPrFetcher).toHaveBeenCalledTimes(2))
  })

  it('setState (close/reopen) also revalidates those caches', async () => {
    const githubDataFetcher = vi.fn().mockResolvedValue({ prs: [] })
    const commitPrFetcher = vi.fn().mockResolvedValue(null)
    const getActions = harness(githubDataFetcher, commitPrFetcher)

    await waitFor(() => expect(githubDataFetcher).toHaveBeenCalledTimes(1))

    await act(async () => {
      await getActions().setState('closed')
    })

    await waitFor(() => expect(githubDataFetcher).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(commitPrFetcher).toHaveBeenCalledTimes(2))
  })

  it('a comment does not trigger the expensive global revalidation', async () => {
    const githubDataFetcher = vi.fn().mockResolvedValue({ prs: [] })
    const commitPrFetcher = vi.fn().mockResolvedValue(null)
    const getActions = harness(githubDataFetcher, commitPrFetcher)

    await waitFor(() => expect(githubDataFetcher).toHaveBeenCalledTimes(1))

    await act(async () => {
      await getActions().comment('hi')
    })

    expect(githubDataFetcher).toHaveBeenCalledTimes(1)
    expect(commitPrFetcher).toHaveBeenCalledTimes(1)
  })
})
