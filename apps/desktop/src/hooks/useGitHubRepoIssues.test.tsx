import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { ReactNode } from 'react'

vi.mock('../api/git.api', () => ({ apiGetRemotes: vi.fn() }))
vi.mock('../api/github.api', () => ({ fetchGitHubRepoIssues: vi.fn() }))

import { apiGetRemotes } from '../api/git.api'
import { fetchGitHubRepoIssues } from '../api/github.api'
import { useSettingsStore } from '../stores/settings.store'
import { useRepoDataStore } from '../stores/repoData.store'
import { useGitHubRepoIssues } from './useGitHubRepoIssues'
import { useDevFixturesStore, resetDevFixturesLoad } from '../stores/devFixtures.store'
import { useDevFlagsStore } from '../stores/devFlags.store'
import type { MockIssue } from '../app/pull-requests/types'

const mocked = {
  apiGetRemotes: apiGetRemotes as unknown as ReturnType<typeof vi.fn>,
  fetchGitHubRepoIssues: fetchGitHubRepoIssues as unknown as ReturnType<typeof vi.fn>,
}

const DEFAULT_SETTINGS = useSettingsStore.getState().settings

function wrapper({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
  )
}

function withToken() {
  useSettingsStore.setState({
    settings: {
      ...DEFAULT_SETTINGS,
      github: {
        accounts: [
          {
            id: 'acc1',
            token: 'tok',
            user: { login: 'me', name: null, email: null, avatarUrl: '' },
          },
        ],
        activeAccountId: 'acc1',
      },
    },
  })
}

function issue(overrides: Partial<MockIssue> = {}): MockIssue {
  return {
    id: 'i1',
    number: 1,
    title: 'Bug',
    repo: 'git-manager',
    url: '',
    status: 'open',
    author: 'me',
    authorAvatar: '',
    assignees: [],
    labels: [],
    thumbsUp: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    comments: 0,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  resetDevFixturesLoad()
  useDevFixturesStore.setState({ loaded: false, issues: [], contributions: [] })
  // Off by default here: the interesting assertion is what a *user* without a token gets.
  useDevFlagsStore.setState({ mockGitHub: false })
  useSettingsStore.setState({ settings: DEFAULT_SETTINGS })
  useRepoDataStore.setState({ savedRepos: [] })
  mocked.apiGetRemotes.mockResolvedValue([])
  mocked.fetchGitHubRepoIssues.mockResolvedValue([])
})

describe('useGitHubRepoIssues — signed out', () => {
  it('returns an empty list and never touches the network', async () => {
    // Behaviour change, and the point of it. This used to hand the four fixture issues to *anyone*
    // without a token, so a user who simply had not connected their GitHub account was shown
    // invented issues — invented authors, invented titles, invented thumbs-up counts — rendered
    // exactly like real ones. Same defect `useGitHubData` carried for pull requests.
    const { result } = renderHook(() => useGitHubRepoIssues(), { wrapper })

    expect(result.current.issues).toEqual([])
    expect(result.current.loading).toBe(false)
    expect(mocked.apiGetRemotes).not.toHaveBeenCalled()
    expect(mocked.fetchGitHubRepoIssues).not.toHaveBeenCalled()
    // And the fixtures are not merely hidden — nothing asked for them.
    await waitFor(() => expect(useDevFixturesStore.getState().loaded).toBe(false))
  })

  it('serves the fixtures when a development build asks for them', async () => {
    useDevFlagsStore.setState({ mockGitHub: true })
    const { result } = renderHook(() => useGitHubRepoIssues(), { wrapper })

    await waitFor(() => expect(result.current.issues.length).toBeGreaterThan(0))
    expect(mocked.fetchGitHubRepoIssues).not.toHaveBeenCalled()
  })
})

describe('useGitHubRepoIssues — with a token', () => {
  it('resolves each saved repo to owner/repo and fetches their issues', async () => {
    withToken()
    useRepoDataStore.setState({
      savedRepos: [{ path: '/p/git-manager', name: 'git-manager', pinned: false }],
    })
    mocked.apiGetRemotes.mockResolvedValue([
      { name: 'origin', url: 'git@github.com:Tlahey/git-manager.git' },
    ])
    mocked.fetchGitHubRepoIssues.mockResolvedValue([issue({ id: 'x1' })])

    const { result } = renderHook(() => useGitHubRepoIssues(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(mocked.fetchGitHubRepoIssues).toHaveBeenCalledWith(
      [{ owner: 'Tlahey', repo: 'git-manager' }],
      'tok'
    )
    expect(result.current.issues.map((i) => i.id)).toEqual(['x1'])
  })

  it('drops a saved repo whose remotes cannot be read', async () => {
    withToken()
    useRepoDataStore.setState({
      savedRepos: [
        { path: '/p/gone', name: 'gone', pinned: false },
        { path: '/p/git-manager', name: 'git-manager', pinned: false },
      ],
    })
    mocked.apiGetRemotes.mockImplementation(async (path: string) => {
      if (path === '/p/gone') throw new Error('not found')
      return [{ name: 'origin', url: 'https://github.com/Tlahey/git-manager' }]
    })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { result } = renderHook(() => useGitHubRepoIssues(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(mocked.fetchGitHubRepoIssues).toHaveBeenCalledWith(
      [{ owner: 'Tlahey', repo: 'git-manager' }],
      'tok'
    )
    expect(warnSpy).toHaveBeenCalled()
  })

  it('does not fetch when there are no saved repos', () => {
    withToken()
    useRepoDataStore.setState({ savedRepos: [] })
    const { result } = renderHook(() => useGitHubRepoIssues(), { wrapper })
    expect(result.current.issues).toEqual([])
    expect(mocked.fetchGitHubRepoIssues).not.toHaveBeenCalled()
  })
})
