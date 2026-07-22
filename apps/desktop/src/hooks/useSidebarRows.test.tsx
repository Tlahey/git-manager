import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { GitBranch, GitRef, GitStash, GitSubmodule, GitWorktree } from '@git-manager/git-types'

const useBranchesMock = vi.fn()
const useGitStashesMock = vi.fn()
const usePullRequestsMock = vi.fn()
const useMergedPrsByBranchMock = vi.fn()
vi.mock('./useBranches', () => ({ useBranches: () => useBranchesMock() }))
vi.mock('./useGitStashes', () => ({ useGitStashes: () => useGitStashesMock() }))
vi.mock('./usePullRequests', () => ({ usePullRequests: () => usePullRequestsMock() }))
vi.mock('./useMergedPrsByBranch', () => ({
  useMergedPrsByBranch: () => useMergedPrsByBranchMock(),
}))

vi.mock('../api/git.api', () => ({ apiGetTags: vi.fn(), apiListSubmodules: vi.fn() }))
vi.mock('../api/worktree.api', () => ({ apiListWorktrees: vi.fn() }))

import { apiGetTags, apiListSubmodules } from '../api/git.api'
import { apiListWorktrees } from '../api/worktree.api'
import { usePinnedBranchesStore } from '../stores/pinned-branches.store'
import { useRepoUIStore } from '../stores/repoUI.store'
import { useSidebarRows } from './useSidebarRows'
import type { SectionKey, SidebarRow, SidebarSection } from '../components/repository-sidebar/types'

const mockedGetTags = apiGetTags as unknown as ReturnType<typeof vi.fn>
const mockedListSubmodules = apiListSubmodules as unknown as ReturnType<typeof vi.fn>
const mockedListWorktrees = apiListWorktrees as unknown as ReturnType<typeof vi.fn>

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

function worktree(path: string, overrides: Partial<GitWorktree> = {}): GitWorktree {
  return {
    path,
    branch: 'feature/login',
    commitOid: 'oid',
    isMain: false,
    isLocked: false,
    isDirty: false,
    isPrunable: false,
    ...overrides,
  }
}

function findSection(sections: SidebarSection[], key: SectionKey) {
  return sections.find((s) => s.key === key)
}

function findRow(sections: SidebarSection[], id: string) {
  return sections.flatMap((s) => s.rows).find((r) => r.id === id)
}

function allRows(sections: SidebarSection[]): SidebarRow[] {
  return sections.flatMap((s) => s.rows)
}

const DEFAULT_PR_DATA = { allPrs: [], isGithub: false, isLoading: false }

beforeEach(() => {
  vi.clearAllMocks()
  usePinnedBranchesStore.setState({ overrides: {} })
  useRepoUIStore.setState({ selectedCommitOid: null })
  useBranchesMock.mockReturnValue({ data: [] })
  useGitStashesMock.mockReturnValue({ data: [] })
  usePullRequestsMock.mockReturnValue(DEFAULT_PR_DATA)
  useMergedPrsByBranchMock.mockReturnValue(new Map())
  mockedGetTags.mockResolvedValue([])
  mockedListSubmodules.mockResolvedValue([])
  mockedListWorktrees.mockResolvedValue([])
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
  it('is collapsed by default, with the branch count still shown on the header', async () => {
    useBranchesMock.mockReturnValue({ data: [branch('main'), branch('feature-x')] })
    const { result } = renderRows()
    await waitFor(() => expect(findSection(result.current.sections, 'local')).toBeDefined())
    expect(findSection(result.current.sections, 'local')).toMatchObject({
      count: 2,
      isOpen: false,
      rows: [],
    })
  })

  it('pins main/master by default, ahead of other branches, with a divider between them', async () => {
    useBranchesMock.mockReturnValue({ data: [branch('feature-x'), branch('main')] })
    const { result } = renderRows({ openState: { 'section:local': true } })
    await waitFor(() => expect(allRows(result.current.sections).length).toBeGreaterThan(1))

    const kinds = allRows(result.current.sections).filter(
      (r) => r.kind === 'branch' || r.kind === 'divider'
    )
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
    const { result } = renderRows({ openState: { 'section:local': true } })
    await waitFor(() => expect(findRow(result.current.sections, 'folder:feat/')).toBeDefined())
    expect(findRow(result.current.sections, 'folder:feat/')).toMatchObject({
      count: 2,
      isOpen: true,
    })
  })

  it('strips the folder prefix from a grouped branch displayName, keeping the full shortName', async () => {
    useBranchesMock.mockReturnValue({ data: [branch('feat/a'), branch('feat/b')] })
    const { result } = renderRows({ openState: { 'section:local': true } })
    await waitFor(() =>
      expect(allRows(result.current.sections).find((r) => r.kind === 'branch')).toBeDefined()
    )
    const grouped = allRows(result.current.sections).find(
      (r) => r.kind === 'branch' && r.branch.shortName === 'feat/a'
    )
    expect(grouped).toMatchObject({ displayName: 'a' })
    expect((grouped as { branch: GitBranch }).branch.shortName).toBe('feat/a')
  })

  it('keeps the full shortName as displayName for ungrouped/pinned branches', async () => {
    useBranchesMock.mockReturnValue({ data: [branch('main'), branch('feature-x')] })
    const { result } = renderRows({ openState: { 'section:local': true } })
    await waitFor(() =>
      expect(allRows(result.current.sections).find((r) => r.kind === 'branch')).toBeDefined()
    )
    const main = allRows(result.current.sections).find(
      (r) => r.kind === 'branch' && r.branch.shortName === 'main'
    )
    const featureX = allRows(result.current.sections).find(
      (r) => r.kind === 'branch' && r.branch.shortName === 'feature-x'
    )
    expect(main).toMatchObject({ displayName: 'main' })
    expect(featureX).toMatchObject({ displayName: 'feature-x' })
  })

  it('respects an explicit closed override for a folder', async () => {
    useBranchesMock.mockReturnValue({ data: [branch('feat/a'), branch('feat/b')] })
    const { result } = renderRows({
      openState: { 'section:local': true, 'folder:feat/': false },
    })
    await waitFor(() => expect(findRow(result.current.sections, 'folder:feat/')).toBeDefined())
    expect(findRow(result.current.sections, 'folder:feat/')).toMatchObject({ isOpen: false })
    expect(
      allRows(result.current.sections).find(
        (r) => r.kind === 'branch' && r.id === 'local:refs/heads/feat/a'
      )
    ).toBeUndefined()
  })

  it('filters local branches by the filter string (case-insensitive)', async () => {
    useBranchesMock.mockReturnValue({ data: [branch('feature-x'), branch('bugfix-y')] })
    const { result } = renderRows({ filter: 'FEAT', openState: { 'section:local': true } })
    await waitFor(() =>
      expect(allRows(result.current.sections).some((r) => r.kind === 'branch')).toBe(true)
    )
    const branchRows = allRows(result.current.sections).filter((r) => r.kind === 'branch')
    expect(branchRows).toHaveLength(1)
    expect((branchRows[0] as { branch: GitBranch }).branch.shortName).toBe('feature-x')
  })

  it('keeps the local section closed when no override is given, even with branches present', async () => {
    useBranchesMock.mockReturnValue({ data: [branch('main')] })
    const { result } = renderRows()
    await waitFor(() => expect(findSection(result.current.sections, 'local')).toBeDefined())
    expect(allRows(result.current.sections).some((r) => r.kind === 'branch')).toBe(false)
  })
})

describe('useSidebarRows — remotes section', () => {
  it('is omitted entirely when there are no remote branches', async () => {
    useBranchesMock.mockReturnValue({ data: [branch('main')] })
    const { result } = renderRows()
    await waitFor(() => expect(findSection(result.current.sections, 'local')).toBeDefined())
    expect(findSection(result.current.sections, 'remotes')).toBeUndefined()
  })

  it('is collapsed by default when there are remote branches', async () => {
    useBranchesMock.mockReturnValue({ data: [remoteBranch('origin/main')] })
    const { result } = renderRows()
    await waitFor(() => expect(findSection(result.current.sections, 'remotes')).toBeDefined())
    expect(findSection(result.current.sections, 'remotes')).toMatchObject({
      isOpen: false,
      rows: [],
    })
  })

  it('groups remote branches by remote name once opened', async () => {
    useBranchesMock.mockReturnValue({
      data: [
        remoteBranch('origin/main'),
        remoteBranch('origin/dev'),
        remoteBranch('upstream/main'),
      ],
    })
    const { result } = renderRows({ openState: { 'section:remotes': true } })
    await waitFor(() => expect(findSection(result.current.sections, 'remotes')).toBeDefined())
    expect(findRow(result.current.sections, 'remote:origin')).toMatchObject({ count: 2 })
    expect(findRow(result.current.sections, 'remote:upstream')).toMatchObject({ count: 1 })
    expect(findSection(result.current.sections, 'remotes')).toMatchObject({ count: 3 })
  })

  it('defaults a slash-less remote branch name to the "origin" group', async () => {
    useBranchesMock.mockReturnValue({ data: [remoteBranch('HEAD', { shortName: 'HEAD' })] })
    const { result } = renderRows({ openState: { 'section:remotes': true } })
    await waitFor(() => expect(findRow(result.current.sections, 'remote:origin')).toBeDefined())
  })
})

describe('useSidebarRows — pull requests section', () => {
  it('is collapsed by default', async () => {
    usePullRequestsMock.mockReturnValue({ allPrs: [], isGithub: true, isLoading: false })
    const { result } = renderRows()
    await waitFor(() => expect(findSection(result.current.sections, 'prs')).toBeDefined())
    expect(findSection(result.current.sections, 'prs')).toMatchObject({ isOpen: false, rows: [] })
  })

  it('shows a loading message while PRs are loading', async () => {
    usePullRequestsMock.mockReturnValue({ allPrs: [], isGithub: true, isLoading: true })
    const { result } = renderRows({ openState: { 'section:prs': true } })
    await waitFor(() => expect(findRow(result.current.sections, 'pr:loading')).toBeDefined())
  })

  it('shows a "connect GitHub" message when not a GitHub repo', async () => {
    usePullRequestsMock.mockReturnValue({ allPrs: [], isGithub: false, isLoading: false })
    const { result } = renderRows({ openState: { 'section:prs': true } })
    await waitFor(() => expect(findRow(result.current.sections, 'pr:nogithub')).toBeDefined())
  })

  it('shows an empty message when there are no open PRs', async () => {
    usePullRequestsMock.mockReturnValue({ allPrs: [], isGithub: true, isLoading: false })
    const { result } = renderRows({ openState: { 'section:prs': true } })
    await waitFor(() => expect(findRow(result.current.sections, 'pr:empty')).toBeDefined())
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
    const { result } = renderRows({
      selectedBranch: 'feature-y',
      openState: { 'section:prs': true },
    })
    await waitFor(() => expect(findRow(result.current.sections, 'pr:2')).toBeDefined())
    expect(findRow(result.current.sections, 'pr:1')).toMatchObject({ isSelected: false })
    expect(findRow(result.current.sections, 'pr:2')).toMatchObject({ isSelected: true })
  })
})

describe('useSidebarRows — PR linked to branch/worktree rows', () => {
  it('attaches the PR whose headRef matches a branch shortName to that branch row', async () => {
    useBranchesMock.mockReturnValue({ data: [branch('feature-x'), branch('feature-y')] })
    usePullRequestsMock.mockReturnValue({
      allPrs: [{ number: 9, headRef: 'feature-x', state: 'open' }],
      isGithub: true,
      isLoading: false,
    })
    const { result } = renderRows({ openState: { 'section:local': true } })
    await waitFor(() =>
      expect(findRow(result.current.sections, 'local:refs/heads/feature-x')).toBeDefined()
    )
    expect(findRow(result.current.sections, 'local:refs/heads/feature-x')).toMatchObject({
      pr: { number: 9 },
    })
    expect(findRow(result.current.sections, 'local:refs/heads/feature-y')).toMatchObject({
      pr: undefined,
    })
  })

  it('prefers an open PR over a merged one sharing the same headRef', async () => {
    useBranchesMock.mockReturnValue({ data: [branch('feature-x')] })
    usePullRequestsMock.mockReturnValue({
      allPrs: [
        { number: 1, headRef: 'feature-x', state: 'merged' },
        { number: 2, headRef: 'feature-x', state: 'open' },
      ],
      isGithub: true,
      isLoading: false,
    })
    const { result } = renderRows({ openState: { 'section:local': true } })
    await waitFor(() =>
      expect(findRow(result.current.sections, 'local:refs/heads/feature-x')).toBeDefined()
    )
    expect(findRow(result.current.sections, 'local:refs/heads/feature-x')).toMatchObject({
      pr: { number: 2 },
    })
  })

  it('attaches the PR whose headRef matches a worktree branch to that worktree row', async () => {
    mockedListWorktrees.mockResolvedValue([worktree('/tmp/repo-linked', { branch: 'feature/login' })])
    usePullRequestsMock.mockReturnValue({
      allPrs: [{ number: 11, headRef: 'feature/login', state: 'open' }],
      isGithub: true,
      isLoading: false,
    })
    const { result } = renderRows({ openState: { 'section:worktrees': true } })
    await waitFor(() =>
      expect(findRow(result.current.sections, 'wt:/tmp/repo-linked')).toBeDefined()
    )
    expect(findRow(result.current.sections, 'wt:/tmp/repo-linked')).toMatchObject({
      pr: { number: 11 },
    })
  })

  it('attaches a merged PR (present only in the merged-by-branch map) to a worktree row', async () => {
    mockedListWorktrees.mockResolvedValue([
      worktree('/tmp/repo-merged', { branch: 'claude/graph-vertical-line-cutoff' }),
    ])
    usePullRequestsMock.mockReturnValue({ allPrs: [], isGithub: true, isLoading: false })
    useMergedPrsByBranchMock.mockReturnValue(
      new Map([['claude/graph-vertical-line-cutoff', { number: 42, state: 'merged' }]])
    )
    const { result } = renderRows({ openState: { 'section:worktrees': true } })
    await waitFor(() =>
      expect(findRow(result.current.sections, 'wt:/tmp/repo-merged')).toBeDefined()
    )
    expect(findRow(result.current.sections, 'wt:/tmp/repo-merged')).toMatchObject({
      pr: { number: 42, state: 'merged' },
    })
  })

  it('lets an open PR win over a merged one on the same branch', async () => {
    useBranchesMock.mockReturnValue({ data: [branch('feature-x')] })
    usePullRequestsMock.mockReturnValue({
      allPrs: [{ number: 8, headRef: 'feature-x', state: 'open' }],
      isGithub: true,
      isLoading: false,
    })
    useMergedPrsByBranchMock.mockReturnValue(
      new Map([['feature-x', { number: 3, state: 'merged' }]])
    )
    const { result } = renderRows({ openState: { 'section:local': true } })
    await waitFor(() =>
      expect(findRow(result.current.sections, 'local:refs/heads/feature-x')).toBeDefined()
    )
    expect(findRow(result.current.sections, 'local:refs/heads/feature-x')).toMatchObject({
      pr: { number: 8, state: 'open' },
    })
  })
})

describe('useSidebarRows — tags/stashes/submodules', () => {
  it('omits the tags section when there are no tags', async () => {
    const { result } = renderRows()
    await waitFor(() => expect(findSection(result.current.sections, 'local')).toBeDefined())
    expect(findSection(result.current.sections, 'tags')).toBeUndefined()
  })

  it('renders the tags section (closed by default) once tags load', async () => {
    mockedGetTags.mockResolvedValue([tag('v1.0'), tag('v2.0')])
    const { result } = renderRows()
    await waitFor(() => expect(findSection(result.current.sections, 'tags')).toBeDefined())
    expect(findSection(result.current.sections, 'tags')).toMatchObject({ count: 2, isOpen: false })
    expect(allRows(result.current.sections).some((r) => r.kind === 'tag')).toBe(false)
  })

  it('shows tag rows once the section is explicitly opened', async () => {
    mockedGetTags.mockResolvedValue([tag('v1.0')])
    const { result } = renderRows({ openState: { 'section:tags': true } })
    await waitFor(() =>
      expect(allRows(result.current.sections).some((r) => r.kind === 'tag')).toBe(true)
    )
    expect(findRow(result.current.sections, 'tag:refs/tags/v1.0')).toBeDefined()
  })

  it('marks a tag row as selected when its commit is the one selected in the graph', async () => {
    mockedGetTags.mockResolvedValue([
      { name: 'refs/tags/v1.0', shortName: 'v1.0', type: 'tag', commitOid: 'commit-a' },
      { name: 'refs/tags/v2.0', shortName: 'v2.0', type: 'tag', commitOid: 'commit-b' },
    ])
    useRepoUIStore.setState({ selectedCommitOid: 'commit-b' })
    const { result } = renderRows({ openState: { 'section:tags': true } })
    await waitFor(() =>
      expect(allRows(result.current.sections).some((r) => r.kind === 'tag')).toBe(true)
    )
    expect(findRow(result.current.sections, 'tag:refs/tags/v1.0')).toMatchObject({ isSelected: false })
    expect(findRow(result.current.sections, 'tag:refs/tags/v2.0')).toMatchObject({ isSelected: true })
  })

  it('truncates the tag list at TAGS_LIMIT (100) with a "+N more" message', async () => {
    mockedGetTags.mockResolvedValue(Array.from({ length: 105 }, (_, i) => tag(`v${i}`)))
    const { result } = renderRows({ openState: { 'section:tags': true } })
    await waitFor(() =>
      expect(allRows(result.current.sections).some((r) => r.kind === 'tag')).toBe(true)
    )
    expect(allRows(result.current.sections).filter((r) => r.kind === 'tag')).toHaveLength(100)
    expect(findRow(result.current.sections, 'tag:more')).toMatchObject({
      text: '+ 5 autres tags',
    })
  })

  it('renders the stashes section (closed by default) once stashes load', async () => {
    useGitStashesMock.mockReturnValue({ data: [stash(0), stash(1)] })
    const { result } = renderRows()
    await waitFor(() => expect(findSection(result.current.sections, 'stashes')).toBeDefined())
    expect(findSection(result.current.sections, 'stashes')).toMatchObject({
      count: 2,
      isOpen: false,
    })
  })

  it('renders the submodules section (closed by default) once submodules load', async () => {
    mockedListSubmodules.mockResolvedValue([submodule('libs/a'), submodule('libs/b')])
    const { result } = renderRows()
    await waitFor(() => expect(findSection(result.current.sections, 'submodules')).toBeDefined())
    expect(findSection(result.current.sections, 'submodules')).toMatchObject({
      count: 2,
      isOpen: false,
    })
  })
})

describe('useSidebarRows — worktrees section', () => {
  it('always shows the worktrees section, even with none — unlike submodules/tags/stashes', async () => {
    const { result } = renderRows()
    await waitFor(() => expect(findSection(result.current.sections, 'worktrees')).toBeDefined())
    expect(findSection(result.current.sections, 'worktrees')).toMatchObject({
      count: undefined,
      isOpen: false,
    })
  })

  it('shows an empty message when the section is opened with no worktrees', async () => {
    const { result } = renderRows({ openState: { 'section:worktrees': true } })
    await waitFor(() => expect(findRow(result.current.sections, 'wt:empty')).toBeDefined())
  })

  it('filters out the main worktree and renders one row per linked worktree once opened', async () => {
    mockedListWorktrees.mockResolvedValue([
      worktree('/repo', { isMain: true }),
      worktree('/tmp/repo-linked'),
    ])
    const { result } = renderRows({ openState: { 'section:worktrees': true } })
    await waitFor(() =>
      expect(findSection(result.current.sections, 'worktrees')).toMatchObject({ count: 1 })
    )
    expect(findRow(result.current.sections, 'wt:/repo')).toBeUndefined()
    expect(findRow(result.current.sections, 'wt:/tmp/repo-linked')).toBeDefined()
  })

  it('hides detached-HEAD worktrees from the section and the worktree lists', async () => {
    mockedListWorktrees.mockResolvedValue([
      worktree('/tmp/repo-linked', { branch: 'feature/login' }),
      worktree('/tmp/repo-detached', { branch: '(detached HEAD)' }),
    ])
    const { result } = renderRows({ openState: { 'section:worktrees': true } })
    await waitFor(() =>
      expect(findSection(result.current.sections, 'worktrees')).toMatchObject({ count: 1 })
    )
    expect(findRow(result.current.sections, 'wt:/tmp/repo-detached')).toBeUndefined()
    expect(findRow(result.current.sections, 'wt:/tmp/repo-linked')).toBeDefined()
    expect(result.current.worktrees.map((w) => w.path)).toEqual(['/tmp/repo-linked'])
  })
})

describe('useSidebarRows — filter reaches every section, not just branches', () => {
  it('filters pull requests by title, headRef, author, or number', async () => {
    usePullRequestsMock.mockReturnValue({
      allPrs: [
        { number: 1, title: 'Fix login bug', headRef: 'fix-login', author: 'alice' },
        { number: 2, title: 'Add dark mode', headRef: 'dark-mode', author: 'bob' },
      ],
      isGithub: true,
      isLoading: false,
    })
    const { result } = renderRows({ filter: 'login', openState: { 'section:prs': true } })
    await waitFor(() =>
      expect(findSection(result.current.sections, 'prs')).toMatchObject({ count: 1 })
    )
    expect(allRows(result.current.sections).filter((r) => r.kind === 'pr')).toHaveLength(1)
  })

  it('filters tags by shortName', async () => {
    mockedGetTags.mockResolvedValue([tag('v1.0'), tag('v2.0-beta')])
    const { result } = renderRows({ filter: 'beta', openState: { 'section:tags': true } })
    await waitFor(() =>
      expect(findSection(result.current.sections, 'tags')).toMatchObject({ count: 1 })
    )
    expect(findRow(result.current.sections, 'tag:refs/tags/v2.0-beta')).toBeDefined()
  })

  it('filters stashes by message or branch', async () => {
    useGitStashesMock.mockReturnValue({
      data: [
        { ...stash(0), message: 'WIP fix login', branch: 'main' },
        { ...stash(1), message: 'WIP other', branch: 'feature-x' },
      ],
    })
    const { result } = renderRows({ filter: 'feature-x', openState: { 'section:stashes': true } })
    await waitFor(() =>
      expect(findSection(result.current.sections, 'stashes')).toMatchObject({ count: 1 })
    )
    expect(findRow(result.current.sections, 'stash:1')).toBeDefined()
  })

  it('filters submodules by path', async () => {
    mockedListSubmodules.mockResolvedValue([submodule('libs/a'), submodule('vendor/b')])
    const { result } = renderRows({ filter: 'vendor', openState: { 'section:submodules': true } })
    await waitFor(() =>
      expect(findSection(result.current.sections, 'submodules')).toMatchObject({ count: 1 })
    )
  })

  it('filters worktrees by branch or path', async () => {
    mockedListWorktrees.mockResolvedValue([
      worktree('/tmp/repo-a', { branch: 'feature/login' }),
      worktree('/tmp/repo-b', { branch: 'chore/cleanup' }),
    ])
    const { result } = renderRows({ filter: 'login', openState: { 'section:worktrees': true } })
    await waitFor(() =>
      expect(findSection(result.current.sections, 'worktrees')).toMatchObject({ count: 1 })
    )
  })

  it('exposes prunable worktrees (excluding main) regardless of isPrunable status', async () => {
    mockedListWorktrees.mockResolvedValue([
      worktree('/repo', { isMain: true, isPrunable: true }),
      worktree('/tmp/repo-stale', { branch: 'old', isPrunable: true }),
      worktree('/tmp/repo-live', { branch: 'active', isPrunable: false }),
    ])
    const { result } = renderRows()
    await waitFor(() => expect(result.current.prunableWorktrees).toHaveLength(1))
    expect(result.current.prunableWorktrees[0].path).toBe('/tmp/repo-stale')
  })

  it('keeps prunableWorktrees unaffected by an active search filter', async () => {
    mockedListWorktrees.mockResolvedValue([
      worktree('/tmp/repo-stale', { branch: 'old', isPrunable: true }),
    ])
    const { result } = renderRows({ filter: 'zzz' })
    await waitFor(() => expect(result.current.prunableWorktrees).toHaveLength(1))
  })

  it('exposes the full non-main worktree list, unaffected by an active search filter', async () => {
    mockedListWorktrees.mockResolvedValue([
      worktree('/repo', { isMain: true }),
      worktree('/tmp/repo-a', { branch: 'a' }),
      worktree('/tmp/repo-b', { branch: 'b' }),
    ])
    const { result } = renderRows({ filter: 'zzz' })
    await waitFor(() => expect(result.current.worktrees).toHaveLength(2))
    expect(result.current.worktrees.map((wt) => wt.path).sort()).toEqual([
      '/tmp/repo-a',
      '/tmp/repo-b',
    ])
  })
})

describe('useSidebarRows — hides sections with no matches while filtering', () => {
  it('hides the local section when the filter matches zero local branches', async () => {
    useBranchesMock.mockReturnValue({ data: [branch('main')] })
    const { result } = renderRows({ filter: 'zzz' })
    await waitFor(() => expect(result.current.sections.length).toBeGreaterThan(0))
    expect(findSection(result.current.sections, 'local')).toBeUndefined()
  })

  it('keeps the local section visible when the filter is empty, even with zero branches', async () => {
    useBranchesMock.mockReturnValue({ data: [] })
    const { result } = renderRows()
    await waitFor(() => expect(result.current.sections.length).toBeGreaterThan(0))
    expect(findSection(result.current.sections, 'local')).toBeDefined()
  })

  it('hides worktrees when filtered to zero matches, but shows it empty when unfiltered', async () => {
    mockedListWorktrees.mockResolvedValue([
      worktree('/tmp/repo-linked', { branch: 'feature/login' }),
    ])
    const { result: filtered } = renderRows({ filter: 'zzz' })
    await waitFor(() => expect(filtered.current.sections.length).toBeGreaterThan(0))
    expect(findSection(filtered.current.sections, 'worktrees')).toBeUndefined()

    const { result: unfiltered } = renderRows()
    await waitFor(() => expect(findSection(unfiltered.current.sections, 'worktrees')).toBeDefined())
  })

  it('hides tags/stashes/submodules entirely when the filter matches zero', async () => {
    mockedGetTags.mockResolvedValue([tag('v1.0')])
    useGitStashesMock.mockReturnValue({ data: [stash(0)] })
    mockedListSubmodules.mockResolvedValue([submodule('libs/a')])
    const { result } = renderRows({ filter: 'zzz' })
    await waitFor(() => expect(result.current.sections.length).toBeGreaterThan(0))
    expect(findSection(result.current.sections, 'tags')).toBeUndefined()
    expect(findSection(result.current.sections, 'stashes')).toBeUndefined()
    expect(findSection(result.current.sections, 'submodules')).toBeUndefined()
  })

  it('hides PRs when the filter matches zero, but keeps the "connect GitHub" message reachable', async () => {
    usePullRequestsMock.mockReturnValue({
      allPrs: [{ number: 1, title: 'Fix login bug', headRef: 'fix-login', author: 'alice' }],
      isGithub: true,
      isLoading: false,
    })
    const { result: filtered } = renderRows({ filter: 'zzz' })
    await waitFor(() => expect(findSection(filtered.current.sections, 'prs')).toBeUndefined())

    usePullRequestsMock.mockReturnValue({ allPrs: [], isGithub: false, isLoading: false })
    const { result: noGithub } = renderRows({
      filter: 'zzz',
      openState: { 'section:prs': true },
    })
    await waitFor(() => expect(findSection(noGithub.current.sections, 'prs')).toBeDefined())
    expect(findRow(noGithub.current.sections, 'pr:nogithub')).toBeDefined()
  })
})

describe('useSidebarRows — filterStats', () => {
  it('reports matched === total across every entity type when unfiltered', async () => {
    useBranchesMock.mockReturnValue({ data: [branch('main'), remoteBranch('origin/main')] })
    mockedGetTags.mockResolvedValue([tag('v1.0')])
    useGitStashesMock.mockReturnValue({ data: [stash(0)] })
    mockedListSubmodules.mockResolvedValue([submodule('libs/a')])
    mockedListWorktrees.mockResolvedValue([worktree('/tmp/repo-linked')])
    const { result } = renderRows()
    await waitFor(() => expect(result.current.filterStats.total).toBe(6))
    expect(result.current.filterStats).toEqual({ matched: 6, total: 6 })
  })

  it('reports the matched subset across every entity type while filtering', async () => {
    useBranchesMock.mockReturnValue({
      data: [branch('feature-x'), branch('main'), remoteBranch('origin/feature-x')],
    })
    mockedGetTags.mockResolvedValue([tag('feature-tag'), tag('v1.0')])
    useGitStashesMock.mockReturnValue({
      data: [
        { ...stash(0), message: 'WIP feature-x', branch: 'main' },
        { ...stash(1), message: 'WIP other', branch: 'other' },
      ],
    })
    mockedListSubmodules.mockResolvedValue([submodule('libs/a')])
    mockedListWorktrees.mockResolvedValue([worktree('/tmp/repo-linked', { branch: 'feature-x' })])
    const { result } = renderRows({ filter: 'feature-x' })
    // total: 3 branches + 2 tags + 2 stashes + 1 submodule + 1 worktree = 9
    // matched: feature-x (local) + origin/feature-x (remote) + stash "WIP feature-x" + worktree = 4
    await waitFor(() => expect(result.current.filterStats.total).toBe(9))
    expect(result.current.filterStats).toEqual({ matched: 4, total: 9 })
  })
})
