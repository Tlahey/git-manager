import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { ReactNode } from 'react'

vi.mock('../api/github.api', async (importActual) => {
  const actual = await importActual<typeof import('../api/github.api')>()
  return { ...actual, fetchClosedPullRequests: vi.fn() }
})

import { fetchClosedPullRequests } from '../api/github.api'
import { useSettingsStore } from '../stores/settings.store'
import { useMergedPrsByBranch } from './useMergedPrsByBranch'

const mockedFetch = fetchClosedPullRequests as unknown as ReturnType<typeof vi.fn>
const DEFAULT_SETTINGS = useSettingsStore.getState().settings

function wrapper({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
  )
}

function rawPR(overrides: Record<string, unknown> = {}) {
  return {
    number: 1,
    title: 'Merged thing',
    body: null,
    html_url: 'https://github.com/org/repo/pull/1',
    state: 'closed',
    draft: false,
    merged_at: '2024-02-01T00:00:00Z',
    user: { login: 'octocat', avatar_url: 'a.png' },
    head: { ref: 'feature-x' },
    base: { ref: 'main' },
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-02-01T00:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  useSettingsStore.setState({ settings: DEFAULT_SETTINGS })
})

describe('useMergedPrsByBranch', () => {
  it('returns an empty map and skips fetching when the remote is not GitHub', () => {
    const { result } = renderHook(
      () => useMergedPrsByBranch({ remoteUrls: ['https://gitlab.com/org/repo.git'] }),
      { wrapper }
    )
    expect(result.current.size).toBe(0)
    expect(mockedFetch).not.toHaveBeenCalled()
  })

  it('does not fetch without a token (nothing to authenticate the closed-PR list)', () => {
    renderHook(() => useMergedPrsByBranch({ remoteUrls: ['https://github.com/org/repo.git'] }), {
      wrapper,
    })
    expect(mockedFetch).not.toHaveBeenCalled()
  })

  it('maps merged closed PRs into a headRef → PullRequest map with state "merged"', async () => {
    mockedFetch.mockResolvedValue([rawPR({ head: { ref: 'claude/foo' } })])
    const { result } = renderHook(
      () =>
        useMergedPrsByBranch({
          remoteUrls: ['https://github.com/org/repo.git'],
          githubToken: 'tok',
        }),
      { wrapper }
    )
    await waitFor(() => expect(result.current.size).toBe(1))
    expect(mockedFetch).toHaveBeenCalledWith('org', 'repo', 'tok')
    expect(result.current.get('claude/foo')).toMatchObject({ number: 1, state: 'merged' })
  })

  it('ignores closed-but-not-merged PRs', async () => {
    mockedFetch.mockResolvedValue([rawPR({ merged_at: null })])
    const { result } = renderHook(
      () =>
        useMergedPrsByBranch({
          remoteUrls: ['https://github.com/org/repo.git'],
          githubToken: 'tok',
        }),
      { wrapper }
    )
    await waitFor(() => expect(mockedFetch).toHaveBeenCalled())
    expect(result.current.size).toBe(0)
  })

  it('keeps the first (most recently updated) merged PR for a reused branch name', async () => {
    mockedFetch.mockResolvedValue([
      rawPR({ number: 20, head: { ref: 'shared' } }),
      rawPR({ number: 10, head: { ref: 'shared' } }),
    ])
    const { result } = renderHook(
      () =>
        useMergedPrsByBranch({
          remoteUrls: ['https://github.com/org/repo.git'],
          githubToken: 'tok',
        }),
      { wrapper }
    )
    await waitFor(() => expect(result.current.size).toBe(1))
    expect(result.current.get('shared')?.number).toBe(20)
  })
})
