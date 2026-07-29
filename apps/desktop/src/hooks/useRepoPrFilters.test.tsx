import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { PullRequest } from '@git-manager/git-types'

const { useSWRMock, fetchPullRequestsByQuery, useSettingsStoreMock } = vi.hoisted(() => ({
  useSWRMock: vi.fn(),
  fetchPullRequestsByQuery: vi.fn(),
  useSettingsStoreMock: vi.fn(),
}))
vi.mock('swr', () => ({ default: useSWRMock }))
vi.mock('../api/github.api', () => ({ fetchPullRequestsByQuery }))
vi.mock('../stores/settings.store', () => ({
  useSettingsStore: (selector: (s: unknown) => unknown) => selector(useSettingsStoreMock()),
}))

import { useRepoPrFilters } from './useRepoPrFilters'
import type { PrFilter } from '../stores/prFilters.store'

const GITHUB_REMOTE = 'https://github.com/org/repo.git'

const FILTERS: PrFilter[] = [
  { id: 'f1', name: 'Open', query: 'is:open' },
  { id: 'f2', name: 'Mine', query: 'is:open author:@me' },
]

function pr(number: number, overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    number,
    title: `PR ${number}`,
    body: '',
    state: 'open',
    author: 'antoine',
    authorAvatar: '',
    headRef: '',
    baseRef: '',
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

const lastKey = () => useSWRMock.mock.calls.at(-1)![0]
const runFetcher = () => useSWRMock.mock.calls.at(-1)![1]()

function render(options: Partial<Parameters<typeof useRepoPrFilters>[0]> = {}) {
  return renderHook(() =>
    useRepoPrFilters({
      remoteUrls: [GITHUB_REMOTE],
      filters: FILTERS,
      knownPrs: [],
      ...options,
    })
  )
}

beforeEach(() => {
  useSWRMock.mockReset().mockReturnValue({ data: undefined, error: undefined, mutate: vi.fn() })
  fetchPullRequestsByQuery.mockReset().mockResolvedValue([])
  useSettingsStoreMock.mockReturnValue({
    settings: { github: { accounts: [{ id: 'a', token: 'tok' }], activeAccountId: 'a' } },
  })
})

describe('useRepoPrFilters — GitHub resolution', () => {
  it('keys the fetch on the repo and the filter queries', () => {
    const { result } = render()
    expect(result.current.isGithub).toBe(true)
    expect(lastKey()).toEqual([
      'repo-pr-filters',
      'org',
      'repo',
      'tok',
      'f1 is:open\nf2 is:open author:@me',
    ])
  })

  it('skips the fetch for a non-GitHub repo, when disabled, and with no filters', () => {
    render({ remoteUrls: ['git@gitlab.com:org/repo.git'] })
    expect(lastKey()).toBeNull()
    render({ enabled: false })
    expect(lastKey()).toBeNull()
    render({ filters: [] })
    expect(lastKey()).toBeNull()
  })

  it('keys on the query, not the filter name', () => {
    render()
    const before = lastKey()
    render({ filters: [{ ...FILTERS[0], name: 'Renamed' }, FILTERS[1]] })
    expect(lastKey()).toEqual(before)
  })
})

describe('useRepoPrFilters — fetching', () => {
  it('asks GitHub for each filter query in turn', async () => {
    render()
    await runFetcher()
    expect(fetchPullRequestsByQuery.mock.calls).toEqual([
      ['org', 'repo', 'is:open', 'tok'],
      ['org', 'repo', 'is:open author:@me', 'tok'],
    ])
  })

  it('reports a rejected query on its own group and still returns the others', async () => {
    fetchPullRequestsByQuery
      .mockRejectedValueOnce(new Error('GitHub API 422: Validation Failed'))
      .mockResolvedValueOnce([pr(2)])

    render()
    const groups = await runFetcher()

    expect(groups[0].prs).toEqual([])
    expect(groups[0].error).toContain('Validation Failed')
    expect(groups[1].prs).toHaveLength(1)
  })
})

describe('useRepoPrFilters — merging with the repo PR list', () => {
  function withData(groups: { filter: PrFilter; prs: PullRequest[]; error: null }[]) {
    useSWRMock.mockReturnValue({ data: groups, error: undefined, mutate: vi.fn() })
  }

  // Search returns the issue view of a PR, with no head/base — the row's branch, its selection
  // highlight and its actions menu all depend on those, so the full object has to win.
  it('swaps a search result for the full PR when the repo list carries it', () => {
    withData([{ filter: FILTERS[0], prs: [pr(42)], error: null }])
    const { result } = render({
      knownPrs: [pr(42, { headRef: 'feat/thing', baseRef: 'main', title: 'Full title' })],
    })
    expect(result.current.groups[0].prs[0]).toMatchObject({
      number: 42,
      headRef: 'feat/thing',
      baseRef: 'main',
      title: 'Full title',
    })
  })

  // A closed or merged PR matched by an explicit filter is not in the open-PR list.
  it('keeps the search shape for a PR the repo list does not carry', () => {
    withData([{ filter: FILTERS[0], prs: [pr(99)], error: null }])
    const { result } = render({ knownPrs: [pr(42, { headRef: 'feat/thing' })] })
    expect(result.current.groups[0].prs[0]).toMatchObject({ number: 99, headRef: '' })
  })
})

describe('useRepoPrFilters — result', () => {
  it('returns an empty group per filter before the fetch resolves, and reports loading', () => {
    const { result } = render()
    expect(result.current.groups.map((g) => g.filter.id)).toEqual(['f1', 'f2'])
    expect(result.current.isLoading).toBe(true)
  })

  it('de-duplicates the union of every group, since the filters overlap', () => {
    useSWRMock.mockReturnValue({
      data: [
        { filter: FILTERS[0], prs: [pr(1), pr(2)], error: null },
        { filter: FILTERS[1], prs: [pr(1)], error: null },
      ],
      error: undefined,
      mutate: vi.fn(),
    })
    const { result } = render()
    expect(result.current.allMatched.map((p) => p.number)).toEqual([1, 2])
  })

  it('follows the current filter order and names without refetching', () => {
    useSWRMock.mockReturnValue({
      data: [
        { filter: FILTERS[0], prs: [pr(1)], error: null },
        { filter: FILTERS[1], prs: [], error: null },
      ],
      error: undefined,
      mutate: vi.fn(),
    })
    const { result } = render({ filters: [FILTERS[1], { ...FILTERS[0], name: 'Renamed' }] })
    expect(result.current.groups.map((g) => g.filter.id)).toEqual(['f2', 'f1'])
    expect(result.current.groups[1].filter.name).toBe('Renamed')
    expect(result.current.groups[1].prs).toHaveLength(1)
  })

  it('gives a filter added since the last fetch an empty group rather than dropping it', () => {
    useSWRMock.mockReturnValue({
      data: [{ filter: FILTERS[0], prs: [pr(1)], error: null }],
      error: undefined,
      mutate: vi.fn(),
    })
    const { result } = render()
    expect(result.current.groups).toHaveLength(2)
    expect(result.current.groups[1].prs).toEqual([])
  })

  it('exposes refresh as a revalidation of the SWR key', () => {
    const mutate = vi.fn()
    useSWRMock.mockReturnValue({ data: [], error: undefined, mutate })
    const { result } = render()
    result.current.refresh()
    expect(mutate).toHaveBeenCalled()
  })
})
