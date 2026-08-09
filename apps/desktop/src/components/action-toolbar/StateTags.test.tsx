import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { GitRepo, PullRequest } from '@git-manager/git-types'

const useActiveBranchPrMock = vi.fn()
vi.mock('../../hooks/useActiveBranchPr', () => ({
  useActiveBranchPr: () => useActiveBranchPrMock(),
}))

import { StateTags } from './StateTags'
import { useRepoDataStore } from '../../stores/repoData.store'
import { useRepoUIStore } from '../../stores/repoUI.store'
import { useRepoViewStore } from '../../stores/repoView.store'

function repo(overrides: Partial<GitRepo> = {}): GitRepo {
  return {
    path: '/repo',
    name: 'repo',
    head: 'main',
    isDetached: false,
    isDirty: false,
    remotes: [],
    ...overrides,
  }
}

function pr(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    number: 55,
    title: 'PR',
    body: '',
    state: 'merged',
    author: 'a',
    authorAvatar: '',
    headRef: 'feature',
    baseRef: 'main',
    url: '',
    ciStatus: null,
    createdAt: '',
    updatedAt: '',
    isDraft: false,
    assignees: [],
    requestedReviewers: [],
    labels: [],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  useActiveBranchPrMock.mockReturnValue(undefined)
  useRepoUIStore.setState({ activeRepo: null })
  useRepoDataStore.setState({ repoCache: {} })
})

describe('StateTags', () => {
  it('renders nothing when the active branch has no linked PR', () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    useRepoDataStore.setState({ repoCache: { '/repo': repo() } })
    const { container } = render(<StateTags />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the PR status tag when the active branch is linked to a PR', () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    useRepoDataStore.setState({ repoCache: { '/repo': repo() } })
    useActiveBranchPrMock.mockReturnValue(pr({ number: 55, state: 'merged' }))
    render(<StateTags />)
    expect(screen.getByTestId('pr-status-tag-55')).toHaveTextContent('#55')
  })

  // The tag rides with the branch context, so it is on the bar for the files view too — while the PR
  // page it opens is drawn by the graph alone.
  it('opens the PR on the content view when clicked from the files view', async () => {
    const user = userEvent.setup()
    useRepoUIStore.setState({ activeRepo: '/repo' })
    useRepoDataStore.setState({ repoCache: { '/repo': repo() } })
    useRepoViewStore.setState({ view: 'files' })
    useActiveBranchPrMock.mockReturnValue(pr({ number: 55, state: 'merged' }))

    render(<StateTags />)
    await user.click(screen.getByTestId('pr-status-tag-55'))

    expect(useRepoViewStore.getState().view).toBe('graph')
    expect(useRepoUIStore.getState().activePrNumber).toBe(55)
  })
})
