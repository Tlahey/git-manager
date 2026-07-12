import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { GitBranch, GitRef, GitStash, GitSubmodule } from '@git-manager/git-types'

const useBranchesMock = vi.fn()
const useGitStashesMock = vi.fn()
const usePullRequestsMock = vi.fn()
vi.mock('./useBranches', () => ({ useBranches: () => useBranchesMock() }))
vi.mock('./useGitStashes', () => ({ useGitStashes: () => useGitStashesMock() }))
vi.mock('./usePullRequests', () => ({ usePullRequests: () => usePullRequestsMock() }))

vi.mock('../api/git.api', () => ({ apiGetTags: vi.fn(), apiListSubmodules: vi.fn() }))

import { apiGetTags, apiListSubmodules } from '../api/git.api'
import { usePinnedBranchesStore } from '../stores/pinned-branches.store'
import { useSidebarRows } from './useSidebarRows'
import type { SidebarRow } from '../components/repository-sidebar/types'

const mockedGetTags = apiGetTags as unknown as ReturnType<typeof vi.fn>
const mockedListSubmodules = apiListSubmodules as unknown as ReturnType<typeof vi.fn>

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function branch(shortName: string, overrides: Partial<GitBranch> = {}): GitBranch {
  return {
    name: `refs/heads/${shortName}`,
    shortName,
    isHead: false,
    isRemote: false,
    commitOid: 'oid',
    commitMessage: 'msg',
    commitTimestamp: 0,
    aheadCount: 0,
    behindCount: 0,
    ...overrides,
  }
}

function remoteBranch(shortName: string, overrides: Partial<GitBranch> = {}): GitBranch {
  return branch(shortName, { isRemote: true, name: `refs/remotes/${shortName}`, ...overrides })
}

function tag(name: string): GitRef {
  return { name: `refs/tags/${name}`, shortName: name, type: 'tag', commitOid: 'oid' }
}

function stash(index: number): GitStash {
  return {
    index,
    message: `WIP ${index}`,
    branch: 'main',
    commitOid: `stash-${index}`,
    timestamp: 0,
    filesCount: 1,
    additions: 0,
    deletions: 0,
  }
}

function submodule(path: string): GitSubmodule {
  return { path, url: '', headOid: 'oid' }
}

function findRow(rows: SidebarRow[], id: string) {
  return rows.find((r) => r.id === id)
}

const DEFAULT_PR_DATA = { allPrs: [], isGithub: false, isLoading: false }

beforeEach(() => {
  vi.clearAllMocks()
  usePinnedBranchesStore.setState({ overrides: {} })
  useBranchesMock.mockReturnValue({ data: [] })
  useGitStashesMock.mockReturnValue({ data: [] })
  usePullRequestsMock.mockReturnValue(DEFAULT_PR_DATA)
  mockedGetTags.mockResolvedValue([])
  mockedListSubmodules.mockResolvedValue([])
})

function renderRows(params: Partial<Parameters<typeof useSidebarRows>[0]> = {}) {
  return renderHook(
    () =>
      useSidebarRows({
        repoPath: '/repo',
        remoteUrls: [],
        selectedBranch: null,
        filter: '',
        openState: {},
        ...params,
      }),
    { wrapper }
  )
}

describe('useSidebarRows — local section', () => {
  it('always renders the local section header with the branch count', async () => {
    useBranchesMock.mockReturnValue({ data: [branch('main'), branch('feature-x')] })
    const { result } = renderRows()
    await waitFor(() => expect(findRow(result.current.rows, 'section:local')).toBeDefined())
    expect(findRow(result.current.rows, 'section:local')).toMatchObject({ count: 2, isOpen: true })
  })

  it('pins main/master by default, ahead of other branches, with a divider between them', async () => {
    useBranchesMock.mockReturnValue({ data: [branch('feature-x'), branch('main')] })
    const { result } = renderRows()
    await waitFor(() => expect(result.current.rows.length).toBeGreaterThan(1))

    const kinds = result.current.rows.filter((r) => r.kind === 'branch' || r.kind === 'divider')
    expect(kinds[0]).toMatchObject({ kind: 'branch', id: 'local:refs/heads/main', isPinned: true })
    expect(kinds[1]).toMatchObject({ kind: 'divider', id: 'div:pinned' })
  })

  it('respects explicit pin overrides from the pinned-branches store', async () => {
    usePinnedBranchesStore.setState({ overrides: { '/repo': { 'feature-x': true, main: false } } })
    useBranchesMock.mockReturnValue({ data: [branch('feature-x'), branch('main')] })
    const { result } = renderRows()
    await waitFor(() => expect(result.current.isPinned('feature-x')).toBe(true))
    expect(result.current.isPinned('main')).toBe(false)
  })

  it('groups remaining branches into folders by prefix (via useGroupedBranches)', async () => {
    useBranchesMock.mockReturnValue({ data: [branch('feat/a'), branch('feat/b')] })
    const { result } = renderRows()
    await waitFor(() => expect(findRow(result.current.rows, 'folder:feat/')).toBeDefined())
    expect(findRow(result.current.rows, 'folder:feat/')).toMatchObject({ count: 2, isOpen: true })
  })

  it('respects an explicit closed override for a folder', async () => {
    useBranchesMock.mockReturnValue({ data: [branch('feat/a'), branch('feat/b')] })
    const { result } = renderRows({ openState: { 'folder:feat/': false } })
    await waitFor(() => expect(findRow(result.current.rows, 'folder:feat/')).toBeDefined())
    expect(findRow(result.current.rows, 'folder:feat/')).toMatchObject({ isOpen: false })
    expect(
      result.current.rows.find((r) => r.kind === 'branch' && r.id === 'local:refs/heads/feat/a')
    ).toBeUndefined()
  })

  it('filters local branches by the filter string (case-insensitive)', async () => {
    useBranchesMock.mockReturnValue({ data: [branch('feature-x'), branch('bugfix-y')] })
    const { result } = renderRows({ filter: 'FEAT' })
    await waitFor(() => expect(result.current.rows.some((r) => r.kind === 'branch')).toBe(true))
    const branchRows = result.current.rows.filter((r) => r.kind === 'branch')
    expect(branchRows).toHaveLength(1)
    expect((branchRows[0] as { branch: GitBranch }).branch.shortName).toBe('feature-x')
  })

  it('collapses the whole local section when overridden closed', async () => {
    useBranchesMock.mockReturnValue({ data: [branch('main')] })
    const { result } = renderRows({ openState: { 'section:local': false } })
    await waitFor(() => expect(findRow(result.current.rows, 'section:local')).toBeDefined())
    expect(result.current.rows.some((r) => r.kind === 'branch')).toBe(false)
  })
})

describe('useSidebarRows — remotes section', () => {
  it('is omitted entirely when there are no remote branches', async () => {
    useBranchesMock.mockReturnValue({ data: [branch('main')] })
    const { result } = renderRows()
    await waitFor(() => expect(findRow(result.current.rows, 'section:local')).toBeDefined())
    expect(findRow(result.current.rows, 'section:remotes')).toBeUndefined()
  })

  it('groups remote branches by remote name', async () => {
    useBranchesMock.mockReturnValue({
      data: [
        remoteBranch('origin/main'),
        remoteBranch('origin/dev'),
        remoteBranch('upstream/main'),
      ],
    })
    const { result } = renderRows()
    await waitFor(() => expect(findRow(result.current.rows, 'section:remotes')).toBeDefined())
    expect(findRow(result.current.rows, 'remote:origin')).toMatchObject({ count: 2 })
    expect(findRow(result.current.rows, 'remote:upstream')).toMatchObject({ count: 1 })
    expect(findRow(result.current.rows, 'section:remotes')).toMatchObject({ count: 3 })
  })

  it('defaults a slash-less remote branch name to the "origin" group', async () => {
    useBranchesMock.mockReturnValue({ data: [remoteBranch('HEAD', { shortName: 'HEAD' })] })
    const { result } = renderRows()
    await waitFor(() => expect(findRow(result.current.rows, 'remote:origin')).toBeDefined())
  })
})

describe('useSidebarRows — pull requests section', () => {
  it('shows a loading message while PRs are loading', async () => {
    usePullRequestsMock.mockReturnValue({ allPrs: [], isGithub: true, isLoading: true })
    const { result } = renderRows()
    await waitFor(() => expect(findRow(result.current.rows, 'pr:loading')).toBeDefined())
  })

  it('shows a "connect GitHub" message when not a GitHub repo', async () => {
    usePullRequestsMock.mockReturnValue({ allPrs: [], isGithub: false, isLoading: false })
    const { result } = renderRows()
    await waitFor(() => expect(findRow(result.current.rows, 'pr:nogithub')).toBeDefined())
  })

  it('shows an empty message when there are no open PRs', async () => {
    usePullRequestsMock.mockReturnValue({ allPrs: [], isGithub: true, isLoading: false })
    const { result } = renderRows()
    await waitFor(() => expect(findRow(result.current.rows, 'pr:empty')).toBeDefined())
  })

  it('renders one row per PR, marking the row matching selectedBranch as selected', async () => {
    usePullRequestsMock.mockReturnValue({
      allPrs: [
        { number: 1, headRef: 'feature-x' },
        { number: 2, headRef: 'feature-y' },
      ],
      isGithub: true,
      isLoading: false,
    })
    const { result } = renderRows({ selectedBranch: 'feature-y' })
    await waitFor(() => expect(findRow(result.current.rows, 'pr:2')).toBeDefined())
    expect(findRow(result.current.rows, 'pr:1')).toMatchObject({ isSelected: false })
    expect(findRow(result.current.rows, 'pr:2')).toMatchObject({ isSelected: true })
  })
})

describe('useSidebarRows — tags/stashes/submodules', () => {
  it('omits the tags section when there are no tags', async () => {
    const { result } = renderRows()
    await waitFor(() => expect(findRow(result.current.rows, 'section:local')).toBeDefined())
    expect(findRow(result.current.rows, 'section:tags')).toBeUndefined()
  })

  it('renders the tags section (closed by default) once tags load', async () => {
    mockedGetTags.mockResolvedValue([tag('v1.0'), tag('v2.0')])
    const { result } = renderRows()
    await waitFor(() => expect(findRow(result.current.rows, 'section:tags')).toBeDefined())
    expect(findRow(result.current.rows, 'section:tags')).toMatchObject({ count: 2, isOpen: false })
    expect(result.current.rows.some((r) => r.kind === 'tag')).toBe(false)
  })

  it('shows tag rows once the section is explicitly opened', async () => {
    mockedGetTags.mockResolvedValue([tag('v1.0')])
    const { result } = renderRows({ openState: { 'section:tags': true } })
    await waitFor(() => expect(result.current.rows.some((r) => r.kind === 'tag')).toBe(true))
    expect(findRow(result.current.rows, 'tag:refs/tags/v1.0')).toBeDefined()
  })

  it('truncates the tag list at TAGS_LIMIT (100) with a "+N more" message', async () => {
    mockedGetTags.mockResolvedValue(Array.from({ length: 105 }, (_, i) => tag(`v${i}`)))
    const { result } = renderRows({ openState: { 'section:tags': true } })
    await waitFor(() => expect(result.current.rows.some((r) => r.kind === 'tag')).toBe(true))
    expect(result.current.rows.filter((r) => r.kind === 'tag')).toHaveLength(100)
    expect(findRow(result.current.rows, 'tag:more')).toMatchObject({ text: '+ 5 autres tags' })
  })

  it('renders the stashes section (closed by default) once stashes load', async () => {
    useGitStashesMock.mockReturnValue({ data: [stash(0), stash(1)] })
    const { result } = renderRows()
    await waitFor(() => expect(findRow(result.current.rows, 'section:stashes')).toBeDefined())
    expect(findRow(result.current.rows, 'section:stashes')).toMatchObject({
      count: 2,
      isOpen: false,
    })
  })

  it('renders the submodules section (closed by default) once submodules load', async () => {
    mockedListSubmodules.mockResolvedValue([submodule('libs/a'), submodule('libs/b')])
    const { result } = renderRows()
    await waitFor(() => expect(findRow(result.current.rows, 'section:submodules')).toBeDefined())
    expect(findRow(result.current.rows, 'section:submodules')).toMatchObject({
      count: 2,
      isOpen: false,
    })
  })
})
