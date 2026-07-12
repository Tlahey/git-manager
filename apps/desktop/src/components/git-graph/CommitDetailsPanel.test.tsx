import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { GitGraphNode, GitStatus } from '@git-manager/git-types'

vi.mock('@git-manager/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key,
  }),
}))

const { useCommitDiff, useGitStatus, invalidateQueries, swrMutate } = vi.hoisted(() => ({
  useCommitDiff: vi.fn(),
  useGitStatus: vi.fn(),
  invalidateQueries: vi.fn(),
  swrMutate: vi.fn(),
}))
vi.mock('../../hooks/useCommitDiff', () => ({ useCommitDiff }))
vi.mock('../../hooks/useGitStatus', () => ({ useGitStatus }))
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries }) }))
vi.mock('swr', () => ({ mutate: swrMutate }))
vi.mock('../../api/git.api', () => ({ apiStageAll: vi.fn(), apiUnstageAll: vi.fn() }))

const { lastHeaderProps, fileListCalls, lastWipPanelProps } = vi.hoisted(() => ({
  lastHeaderProps: { current: null as Record<string, unknown> | null },
  fileListCalls: { current: [] as Record<string, unknown>[] },
  lastWipPanelProps: { current: null as Record<string, unknown> | null },
}))
vi.mock('./components/CommitHeaderInfo', () => ({
  CommitHeaderInfo: (props: Record<string, unknown>) => {
    lastHeaderProps.current = props
    return <div data-testid="commit-header-info" />
  },
}))
vi.mock('./components/CommitFileList', () => ({
  CommitFileList: (props: Record<string, unknown>) => {
    fileListCalls.current.push(props)
    return <div data-testid="commit-file-list" data-title={String(props.title ?? '')} />
  },
}))
vi.mock('./components/WipStagingPanel', () => ({
  WipStagingPanel: (props: Record<string, unknown>) => {
    lastWipPanelProps.current = props
    return <div data-testid="wip-staging-panel" />
  },
}))

import { apiStageAll, apiUnstageAll } from '../../api/git.api'
import { CommitDetailsPanel } from './CommitDetailsPanel'
import { useRepoDataStore } from '../../stores/repoData.store'

const mockedStageAll = apiStageAll as unknown as ReturnType<typeof vi.fn>
const mockedUnstageAll = apiUnstageAll as unknown as ReturnType<typeof vi.fn>
const INITIAL_REPO_DATA = useRepoDataStore.getState()

function node(overrides: Partial<GitGraphNode> = {}): GitGraphNode {
  return {
    commit: {
      oid: 'abc123',
      shortOid: 'abc123',
      message: 'msg',
      subject: 'Subject',
      body: '',
      author: {} as never,
      committer: {} as never,
      parentOids: [],
    },
    column: 0,
    color: '#000',
    connections: [],
    refs: [],
    ...overrides,
  }
}

function gitStatus(overrides: Partial<GitStatus> = {}): GitStatus {
  return { staged: [], unstaged: [], untracked: [], conflicted: [], ...overrides }
}

beforeEach(() => {
  vi.clearAllMocks()
  lastHeaderProps.current = null
  fileListCalls.current = []
  lastWipPanelProps.current = null
  useRepoDataStore.setState({ ...INITIAL_REPO_DATA, repoCache: {} })
  useCommitDiff.mockReturnValue({ data: undefined })
  useGitStatus.mockReturnValue({ data: undefined })
})

function findFileList(title: string) {
  return fileListCalls.current.find((p) => p.title === title)
}

describe('CommitDetailsPanel — WIP vs commit detection', () => {
  it('treats the special WIP oid as the working tree, not a real commit', () => {
    useGitStatus.mockReturnValue({ data: gitStatus() })
    render(
      <CommitDetailsPanel
        node={node({ commit: { ...node().commit, oid: 'WIP' } })}
        repoPath="/repo"
      />
    )
    expect(lastHeaderProps.current!.isWip).toBe(true)
    expect(screen.getByTestId('wip-staging-panel')).toBeInTheDocument()
  })

  it('does not render the WIP staging panel for a real commit', () => {
    render(<CommitDetailsPanel node={node()} repoPath="/repo" />)
    expect(lastHeaderProps.current!.isWip).toBe(false)
    expect(screen.queryByTestId('wip-staging-panel')).not.toBeInTheDocument()
  })

  it('derives isHead from the node refs when no isHead prop is given', () => {
    render(
      <CommitDetailsPanel
        node={node({
          refs: [{ name: 'HEAD', shortName: 'HEAD', type: 'HEAD', commitOid: 'abc123' }],
        })}
        repoPath="/repo"
      />
    )
    expect(lastHeaderProps.current!.isHead).toBe(true)
  })

  it('prefers an explicit isHead prop over the refs', () => {
    render(<CommitDetailsPanel node={node({ refs: [] })} repoPath="/repo" isHead />)
    expect(lastHeaderProps.current!.isHead).toBe(true)
  })

  it('detects a stash node from its refs', () => {
    render(
      <CommitDetailsPanel
        node={node({
          refs: [{ name: 'stash@{0}', shortName: 'stash@{0}', type: 'stash', commitOid: 'abc123' }],
        })}
        repoPath="/repo"
      />
    )
    expect(lastHeaderProps.current!.isStash).toBe(true)
  })
})

describe('CommitDetailsPanel — remote URL derivation', () => {
  it('is null when the repo has no cached remotes', () => {
    render(<CommitDetailsPanel node={node()} repoPath="/repo" />)
    expect(lastHeaderProps.current!.remoteUrl).toBeNull()
  })

  it('converts an SSH GitHub remote to an HTTPS URL', () => {
    useRepoDataStore.setState({
      repoCache: {
        '/repo': {
          path: '/repo',
          name: 'repo',
          head: 'main',
          isDetached: false,
          isDirty: false,
          remotes: ['git@github.com:owner/repo.git'],
        },
      },
    })
    render(<CommitDetailsPanel node={node()} repoPath="/repo" />)
    expect(lastHeaderProps.current!.remoteUrl).toBe('https://github.com/owner/repo')
  })

  it('strips ".git" from an HTTPS remote as-is', () => {
    useRepoDataStore.setState({
      repoCache: {
        '/repo': {
          path: '/repo',
          name: 'repo',
          head: 'main',
          isDetached: false,
          isDirty: false,
          remotes: ['https://gitlab.com/owner/repo.git'],
        },
      },
    })
    render(<CommitDetailsPanel node={node()} repoPath="/repo" />)
    expect(lastHeaderProps.current!.remoteUrl).toBe('https://gitlab.com/owner/repo')
  })

  it('ignores remotes that are neither github.com nor gitlab.com', () => {
    useRepoDataStore.setState({
      repoCache: {
        '/repo': {
          path: '/repo',
          name: 'repo',
          head: 'main',
          isDetached: false,
          isDirty: false,
          remotes: ['git@bitbucket.org:owner/repo.git'],
        },
      },
    })
    render(<CommitDetailsPanel node={node()} repoPath="/repo" />)
    expect(lastHeaderProps.current!.remoteUrl).toBeNull()
  })
})

describe('CommitDetailsPanel — refresh wiring', () => {
  it('invalidates git-status/git-log and mutates the git-stashes SWR key on refresh', () => {
    render(<CommitDetailsPanel node={node()} repoPath="/repo" />)
    ;(lastHeaderProps.current!.onRefresh as () => void)()
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['git-status', '/repo'] })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['git-log', '/repo'] })
    expect(swrMutate).toHaveBeenCalledWith(['git-stashes', '/repo'])
  })
})

describe('CommitDetailsPanel — non-WIP file list', () => {
  it('builds processed files from the commit diff, falling back to oldPath when newPath is empty', () => {
    useCommitDiff.mockReturnValue({
      data: {
        files: [
          {
            newPath: 'b.ts',
            oldPath: 'a.ts',
            status: 'renamed',
            additions: 2,
            deletions: 1,
            isBinary: false,
            hunks: [],
          },
          {
            newPath: '',
            oldPath: 'deleted.ts',
            status: 'deleted',
            additions: 0,
            deletions: 5,
            isBinary: false,
            hunks: [],
          },
        ],
      },
    })
    render(<CommitDetailsPanel node={node()} repoPath="/repo" />)
    expect(fileListCalls.current).toHaveLength(1)
    expect(fileListCalls.current[0].processedFiles).toEqual([
      { path: 'b.ts', status: 'renamed', additions: 2, deletions: 1, staged: false },
      { path: 'deleted.ts', status: 'deleted', additions: 0, deletions: 5, staged: false },
    ])
  })

  it('fetches the commit diff by the real oid (not the WIP sentinel)', () => {
    render(
      <CommitDetailsPanel
        node={node({ commit: { ...node().commit, oid: 'deadbeef' } })}
        repoPath="/repo"
      />
    )
    expect(useCommitDiff).toHaveBeenCalledWith('/repo', 'deadbeef')
  })
})

describe('CommitDetailsPanel — WIP file lists', () => {
  function wipNode() {
    return node({ commit: { ...node().commit, oid: 'WIP' } })
  }

  it('splits working-tree status into staged/unstaged/untracked processed file lists', () => {
    useGitStatus.mockReturnValue({
      data: gitStatus({
        staged: [{ path: 'staged.ts', status: 'modified' }],
        unstaged: [{ path: 'unstaged.ts', status: 'modified' }],
        untracked: ['new.ts'],
      }),
    })
    render(<CommitDetailsPanel node={wipNode()} repoPath="/repo" />)

    const staged = findFileList('workingTree.staged:{"count":1}')!
    expect(staged.processedFiles).toEqual([{ path: 'staged.ts', status: 'modified', staged: true }])

    const unstaged = findFileList('workingTree.unstaged:{"count":2}')!
    expect(unstaged.processedFiles).toEqual([
      { path: 'unstaged.ts', status: 'modified', staged: false },
      { path: 'new.ts', status: 'untracked', staged: false },
    ])
  })

  it('only renders the unmerged file list when there are conflicted files', () => {
    useGitStatus.mockReturnValue({ data: gitStatus() })
    render(<CommitDetailsPanel node={wipNode()} repoPath="/repo" />)
    expect(findFileList(/workingTree\.unmerged/ as unknown as string)).toBeUndefined()
    expect(fileListCalls.current).toHaveLength(2) // staged + unstaged, no unmerged
  })

  it('renders the unmerged list from gitStatus.conflicted when present', () => {
    useGitStatus.mockReturnValue({ data: gitStatus({ conflicted: ['conflict.ts'] }) })
    render(<CommitDetailsPanel node={wipNode()} repoPath="/repo" />)
    const unmerged = findFileList('workingTree.unmerged:{"count":1}')!
    expect(unmerged.processedFiles).toEqual([
      { path: 'conflict.ts', status: 'conflicted', staged: false },
    ])
    expect(fileListCalls.current).toHaveLength(3)
  })

  it("wires the staged list's bulk action to unstage-all, and the unstaged list's to stage-all", async () => {
    mockedStageAll.mockResolvedValue(undefined)
    mockedUnstageAll.mockResolvedValue(undefined)
    useGitStatus.mockReturnValue({
      data: gitStatus({
        staged: [{ path: 's.ts', status: 'modified' }],
        unstaged: [{ path: 'u.ts', status: 'modified' }],
      }),
    })
    render(<CommitDetailsPanel node={wipNode()} repoPath="/repo" />)

    await (findFileList('workingTree.staged:{"count":1}')!.onBulkStage as () => Promise<void>)()
    expect(mockedUnstageAll).toHaveBeenCalledWith('/repo')

    await (findFileList('workingTree.unstaged:{"count":1}')!.onBulkStage as () => Promise<void>)()
    expect(mockedStageAll).toHaveBeenCalledWith('/repo')
  })

  it('passes all WIP changes and status through to the WipStagingPanel', () => {
    useGitStatus.mockReturnValue({
      data: gitStatus({ staged: [{ path: 's.ts', status: 'modified' }] }),
    })
    render(<CommitDetailsPanel node={wipNode()} repoPath="/repo" />)
    expect(lastWipPanelProps.current!.gitStatus).toEqual(
      gitStatus({ staged: [{ path: 's.ts', status: 'modified' }] })
    )
    expect(lastWipPanelProps.current!.allWipChanges).toEqual([
      { path: 's.ts', status: 'modified', staged: true },
    ])
  })
})
