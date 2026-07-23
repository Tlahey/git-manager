import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { ReactNode } from 'react'
import type { GitBranch } from '@git-manager/git-types'
import type { MockIssue } from '../app/pull-requests/types'

vi.mock('../api/git.api', () => ({ apiGetRemotes: vi.fn(), apiGetBranches: vi.fn() }))

import { apiGetRemotes, apiGetBranches } from '../api/git.api'
import { useRepoDataStore } from '../stores/repoData.store'
import { useIssueRepoLink } from './useIssueRepoLink'

const mocked = {
  apiGetRemotes: apiGetRemotes as unknown as ReturnType<typeof vi.fn>,
  apiGetBranches: apiGetBranches as unknown as ReturnType<typeof vi.fn>,
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
  )
}

function issue(overrides: Partial<MockIssue> = {}): MockIssue {
  return {
    id: '1',
    number: 312,
    title: 'Bug',
    repo: 'git-manager',
    fullName: 'Tlahey/git-manager',
    url: '',
    status: 'open',
    author: 'me',
    authorAvatar: '',
    assignees: [],
    labels: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    comments: 0,
    thumbsUp: 0,
    ...overrides,
  }
}

function branch(shortName: string): GitBranch {
  return {
    name: shortName,
    shortName,
    isHead: false,
    isRemote: false,
    commitOid: 'x',
    commitMessage: '',
    commitTimestamp: 0,
    aheadCount: 0,
    behindCount: 0,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  useRepoDataStore.setState({ savedRepos: [] })
  mocked.apiGetRemotes.mockResolvedValue([])
  mocked.apiGetBranches.mockResolvedValue([])
})

describe('useIssueRepoLink', () => {
  it('returns a null path when no saved repo matches', () => {
    const { result } = renderHook(() => useIssueRepoLink(issue()), { wrapper })
    expect(result.current.repoPath).toBeNull()
  })

  it('maps the issue to a saved repo by its GitHub owner/repo remote', async () => {
    useRepoDataStore.setState({
      savedRepos: [{ path: '/p/git-manager', name: 'git-manager', pinned: false }],
    })
    mocked.apiGetRemotes.mockResolvedValue([
      { name: 'origin', url: 'git@github.com:Tlahey/git-manager.git' },
    ])
    const { result } = renderHook(() => useIssueRepoLink(issue()), { wrapper })
    await waitFor(() => expect(result.current.repoPath).toBe('/p/git-manager'))
  })

  it('detects a local branch referencing the issue number', async () => {
    useRepoDataStore.setState({
      savedRepos: [{ path: '/p/git-manager', name: 'git-manager', pinned: false }],
    })
    mocked.apiGetRemotes.mockResolvedValue([
      { name: 'origin', url: 'https://github.com/Tlahey/git-manager' },
    ])
    mocked.apiGetBranches.mockResolvedValue([branch('main'), branch('312-fix-bug')])
    const { result } = renderHook(() => useIssueRepoLink(issue()), { wrapper })
    await waitFor(() => expect(result.current.branch).toBe('312-fix-bug'))
  })

  it('falls back to matching by repo name when there is no GitHub remote', async () => {
    useRepoDataStore.setState({
      savedRepos: [{ path: '/p/git-manager', name: 'git-manager', pinned: false }],
    })
    mocked.apiGetRemotes.mockResolvedValue([{ name: 'origin', url: 'https://gitlab.com/x/y' }])
    const { result } = renderHook(() => useIssueRepoLink(issue({ fullName: undefined })), {
      wrapper,
    })
    await waitFor(() => expect(result.current.repoPath).toBe('/p/git-manager'))
  })
})
