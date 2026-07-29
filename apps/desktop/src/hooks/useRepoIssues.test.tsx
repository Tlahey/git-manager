import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const { useSWRMock, fetchIssuesByQuery, useSettingsStoreMock } = vi.hoisted(() => ({
  useSWRMock: vi.fn(),
  fetchIssuesByQuery: vi.fn(),
  useSettingsStoreMock: vi.fn(),
}))
vi.mock('swr', () => ({ default: useSWRMock }))
vi.mock('../api/github.api', () => ({ fetchIssuesByQuery }))
// Mocked rather than driven through the real store: only the active account's token matters here,
// and building a whole valid SettingsState just to set one field buries what the test is about.
vi.mock('../stores/settings.store', () => ({
  useSettingsStore: (selector: (s: unknown) => unknown) => selector(useSettingsStoreMock()),
}))

import { useRepoIssues } from './useRepoIssues'
import type { IssueFilter } from '../stores/issueFilters.store'
import type { MockIssue } from '../app/pull-requests/types'

const GITHUB_REMOTE = 'https://github.com/org/repo.git'

const FILTERS: IssueFilter[] = [
  { id: 'f1', name: 'Open', query: 'is:open' },
  { id: 'f2', name: 'Mine', query: 'is:open author:@me' },
]

function issue(id: string, number: number): MockIssue {
  return {
    id,
    number,
    title: `Issue ${number}`,
    repo: 'repo',
    url: `https://github.com/org/repo/issues/${number}`,
    status: 'open',
    author: 'antoine',
    authorAvatar: '',
    assignees: [],
    labels: [],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-02'),
    comments: 0,
    thumbsUp: 0,
  }
}

function lastKey() {
  return useSWRMock.mock.calls.at(-1)![0]
}

function runFetcher() {
  return useSWRMock.mock.calls.at(-1)![1]()
}

function signIn(token: string | null) {
  useSettingsStoreMock.mockReturnValue({
    settings: {
      github: token
        ? { accounts: [{ id: 'a', token, user: { login: 'antoine' } }], activeAccountId: 'a' }
        : { accounts: [], activeAccountId: null },
    },
  })
}

function render(options: Partial<Parameters<typeof useRepoIssues>[0]> = {}) {
  return renderHook(() =>
    useRepoIssues({ remoteUrls: [GITHUB_REMOTE], filters: FILTERS, ...options })
  )
}

beforeEach(() => {
  useSWRMock.mockReset().mockReturnValue({ data: undefined, error: undefined, mutate: vi.fn() })
  fetchIssuesByQuery.mockReset().mockResolvedValue([])
  signIn('tok')
})

describe('useRepoIssues — GitHub resolution', () => {
  it('resolves owner/repo from the first GitHub remote and keys the fetch on the queries', () => {
    const { result } = render()
    expect(result.current.isGithub).toBe(true)
    expect(result.current.ownerRepo).toEqual({ owner: 'org', repo: 'repo' })
    expect(lastKey()).toEqual([
      'repo-issue-filters',
      'org',
      'repo',
      'tok',
      'f1 is:open\nf2 is:open author:@me',
    ])
  })

  it('reports a non-GitHub repo and skips the fetch entirely', () => {
    const { result } = render({ remoteUrls: ['git@gitlab.com:org/repo.git'] })
    expect(result.current.isGithub).toBe(false)
    expect(result.current.ownerRepo).toBeNull()
    expect(lastKey()).toBeNull()
  })

  it('skips the fetch when disabled', () => {
    render({ enabled: false })
    expect(lastKey()).toBeNull()
  })

  it('skips the fetch when the user has deleted every filter', () => {
    render({ filters: [] })
    expect(lastKey()).toBeNull()
  })

  it("prefers an explicitly passed token over the active account's", () => {
    render({ githubToken: 'explicit' })
    expect(lastKey()![3]).toBe('explicit')
  })

  // Public repos are readable unauthenticated, so a missing token still fetches.
  it('still fetches when signed out', () => {
    signIn(null)
    render()
    expect(lastKey()![3]).toBeUndefined()
  })

  // A rename changes only what is displayed, so it must not cost a round-trip per keystroke.
  it('keys on the query, not the filter name', () => {
    render()
    const before = lastKey()
    render({ filters: [{ ...FILTERS[0], name: 'Renamed' }, FILTERS[1]] })
    expect(lastKey()).toEqual(before)
  })
})

describe('useRepoIssues — fetching', () => {
  it('asks GitHub for each filter query in turn', async () => {
    render()
    await runFetcher()
    expect(fetchIssuesByQuery.mock.calls).toEqual([
      ['org', 'repo', 'is:open', 'tok'],
      ['org', 'repo', 'is:open author:@me', 'tok'],
    ])
  })

  it('reports a rejected query on its own group and still returns the others', async () => {
    fetchIssuesByQuery
      .mockRejectedValueOnce(new Error('GitHub API 422: Validation Failed'))
      .mockResolvedValueOnce([issue('i-2', 2)])

    render()
    const groups = await runFetcher()

    expect(groups[0].issues).toEqual([])
    expect(groups[0].error).toContain('Validation Failed')
    expect(groups[1].issues).toHaveLength(1)
    expect(groups[1].error).toBeNull()
  })
})

describe('useRepoIssues — result', () => {
  it('returns an empty group per filter before the fetch resolves, and reports loading', () => {
    const { result } = render()
    expect(result.current.groups.map((g) => g.filter.id)).toEqual(['f1', 'f2'])
    expect(result.current.groups.every((g) => g.issues.length === 0)).toBe(true)
    expect(result.current.isLoading).toBe(true)
  })

  it('is not loading once an error comes back', () => {
    useSWRMock.mockReturnValue({ data: undefined, error: new Error('boom'), mutate: vi.fn() })
    const { result } = render()
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeInstanceOf(Error)
  })

  it('pairs fetched issues with their filter', () => {
    useSWRMock.mockReturnValue({
      data: [
        { filter: FILTERS[0], issues: [issue('i-1', 1), issue('i-2', 2)], error: null },
        { filter: FILTERS[1], issues: [issue('i-1', 1)], error: null },
      ],
      error: undefined,
      mutate: vi.fn(),
    })
    const { result } = render()
    expect(result.current.groups[0].issues).toHaveLength(2)
    expect(result.current.groups[1].issues).toHaveLength(1)
  })

  it('de-duplicates the union of every group, since the filters overlap', () => {
    useSWRMock.mockReturnValue({
      data: [
        { filter: FILTERS[0], issues: [issue('i-1', 1), issue('i-2', 2)], error: null },
        { filter: FILTERS[1], issues: [issue('i-1', 1)], error: null },
      ],
      error: undefined,
      mutate: vi.fn(),
    })
    const { result } = render()
    expect(result.current.allIssues.map((i) => i.id)).toEqual(['i-1', 'i-2'])
  })

  // Reordering/renaming has no effect on what GitHub returns, so the cached response is re-paired
  // with the current filters rather than left stale until the next revalidation.
  it('follows the current filter order and names without refetching', () => {
    useSWRMock.mockReturnValue({
      data: [
        { filter: FILTERS[0], issues: [issue('i-1', 1)], error: null },
        { filter: FILTERS[1], issues: [], error: null },
      ],
      error: undefined,
      mutate: vi.fn(),
    })
    const { result } = render({
      filters: [FILTERS[1], { ...FILTERS[0], name: 'Renamed' }],
    })
    expect(result.current.groups.map((g) => g.filter.id)).toEqual(['f2', 'f1'])
    expect(result.current.groups[1].filter.name).toBe('Renamed')
    expect(result.current.groups[1].issues).toHaveLength(1)
  })

  it('gives a filter added since the last fetch an empty group rather than dropping it', () => {
    useSWRMock.mockReturnValue({
      data: [{ filter: FILTERS[0], issues: [issue('i-1', 1)], error: null }],
      error: undefined,
      mutate: vi.fn(),
    })
    const { result } = render()
    expect(result.current.groups).toHaveLength(2)
    expect(result.current.groups[1].issues).toEqual([])
  })

  it('exposes refresh as a revalidation of the SWR key', () => {
    const mutate = vi.fn()
    useSWRMock.mockReturnValue({ data: [], error: undefined, mutate })
    const { result } = render()

    result.current.refresh()

    expect(mutate).toHaveBeenCalled()
  })
})
