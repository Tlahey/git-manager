import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { ReactNode } from 'react'

vi.mock('../api/github.api', () => ({ fetchRepoPRs: vi.fn() }))

import { fetchRepoPRs } from '../api/github.api'
import { useSettingsStore } from '../stores/settings.store'
import { usePullRequests } from './usePullRequests'

const mockedFetch = fetchRepoPRs as unknown as ReturnType<typeof vi.fn>
const DEFAULT_SETTINGS = useSettingsStore.getState().settings

function wrapper({ children }: { children: ReactNode }) {
  return <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
}

function rawPR(overrides: Partial<Parameters<typeof mockedFetch>[0]> & Record<string, unknown> = {}) {
  return {
    number: 1,
    title: 'Add feature',
    body: null,
    html_url: 'https://github.com/org/repo/pull/1',
    state: 'open',
    draft: false,
    merged_at: null,
    user: { login: 'octocat', avatar_url: 'avatar.png' },
    head: { ref: 'feature-x' },
    base: { ref: 'main' },
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  useSettingsStore.setState({ settings: DEFAULT_SETTINGS })
})

describe('usePullRequests — GitHub remote detection', () => {
  it('detects an https GitHub remote and extracts owner/repo', () => {
    const { result } = renderHook(
      () => usePullRequests({ remoteUrls: ['https://github.com/org/repo.git'] }),
      { wrapper }
    )
    expect(result.current.isGithub).toBe(true)
    expect(result.current.ownerRepo).toEqual({ owner: 'org', repo: 'repo' })
  })

  it('uses the first GitHub remote when multiple are given', () => {
    const { result } = renderHook(
      () => usePullRequests({ remoteUrls: ['not-a-url', 'https://github.com/org/repo.git', 'https://github.com/org/other.git'] }),
      { wrapper }
    )
    expect(result.current.ownerRepo).toEqual({ owner: 'org', repo: 'repo' })
  })

  it('reports isGithub false and skips fetching when no remote matches GitHub', () => {
    const { result } = renderHook(() => usePullRequests({ remoteUrls: ['https://gitlab.com/org/repo.git'] }), { wrapper })
    expect(result.current.isGithub).toBe(false)
    expect(result.current.ownerRepo).toBeNull()
    expect(mockedFetch).not.toHaveBeenCalled()
  })
})

describe('usePullRequests — fetching and mapping', () => {
  it('fetches and maps PRs into the PullRequest shape', async () => {
    mockedFetch.mockResolvedValue([rawPR()])
    const { result } = renderHook(
      () => usePullRequests({ remoteUrls: ['https://github.com/org/repo.git'], githubToken: 'tok' }),
      { wrapper }
    )
    await waitFor(() => expect(result.current.allPrs).toHaveLength(1))
    expect(mockedFetch).toHaveBeenCalledWith('org', 'repo', 'tok')
    expect(result.current.allPrs[0]).toMatchObject({
      number: 1,
      title: 'Add feature',
      author: 'octocat',
      headRef: 'feature-x',
      baseRef: 'main',
      isDraft: false,
      state: 'open',
    })
  })

  it('maps a draft PR\'s state to "draft"', async () => {
    mockedFetch.mockResolvedValue([rawPR({ draft: true })])
    const { result } = renderHook(
      () => usePullRequests({ remoteUrls: ['https://github.com/org/repo.git'] }),
      { wrapper }
    )
    await waitFor(() => expect(result.current.allPrs).toHaveLength(1))
    expect(result.current.allPrs[0].state).toBe('draft')
  })

  it('filters myPrs down to the resolved current user\'s PRs', async () => {
    mockedFetch.mockResolvedValue([rawPR({ user: { login: 'me', avatar_url: '' } }), rawPR({ number: 2, user: { login: 'other', avatar_url: '' } })])
    const { result } = renderHook(
      () => usePullRequests({ remoteUrls: ['https://github.com/org/repo.git'], currentUser: 'me' }),
      { wrapper }
    )
    await waitFor(() => expect(result.current.allPrs).toHaveLength(2))
    expect(result.current.myPrs).toHaveLength(1)
    expect(result.current.myPrs[0].author).toBe('me')
  })

  it('myPrs is empty when there is no resolved current user', async () => {
    mockedFetch.mockResolvedValue([rawPR()])
    const { result } = renderHook(
      () => usePullRequests({ remoteUrls: ['https://github.com/org/repo.git'] }),
      { wrapper }
    )
    await waitFor(() => expect(result.current.allPrs).toHaveLength(1))
    expect(result.current.myPrs).toEqual([])
  })

  it('resolves user/token from the active GitHub account when not explicitly given', async () => {
    useSettingsStore.setState({
      settings: {
        ...DEFAULT_SETTINGS,
        github: {
          accounts: [{ id: 'acc1', token: 'account-tok', user: { login: 'account-user', name: null, email: null, avatarUrl: '' } }],
          activeAccountId: 'acc1',
        },
      },
    })
    mockedFetch.mockResolvedValue([])
    renderHook(() => usePullRequests({ remoteUrls: ['https://github.com/org/repo.git'] }), { wrapper })
    await waitFor(() => expect(mockedFetch).toHaveBeenCalledWith('org', 'repo', 'account-tok'))
  })

  it('does not fetch when enabled is false', () => {
    renderHook(
      () => usePullRequests({ remoteUrls: ['https://github.com/org/repo.git'], enabled: false }),
      { wrapper }
    )
    expect(mockedFetch).not.toHaveBeenCalled()
  })

  it('surfaces a fetch error', async () => {
    mockedFetch.mockRejectedValue(new Error('rate limited'))
    const { result } = renderHook(
      () => usePullRequests({ remoteUrls: ['https://github.com/org/repo.git'] }),
      { wrapper }
    )
    await waitFor(() => expect(result.current.error).not.toBeNull())
    expect(result.current.error?.message).toBe('rate limited')
  })
})
