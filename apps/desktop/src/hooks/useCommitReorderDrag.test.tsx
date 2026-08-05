import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { GitGraphNode, GitRef } from '@git-manager/git-types'

vi.mock('../api/git.api', () => ({
  apiListRebaseCommits: vi.fn(),
  apiRunInteractiveRebase: vi.fn(),
  apiGetRebaseState: vi.fn(),
}))
vi.mock('@git-manager/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@git-manager/ui')>()),
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { toast } from '@git-manager/ui'
import { apiListRebaseCommits, apiRunInteractiveRebase, apiGetRebaseState } from '../api/git.api'
import { useCommitReorderDrag } from './useCommitReorderDrag'

const mocked = {
  range: apiListRebaseCommits as unknown as ReturnType<typeof vi.fn>,
  rebase: apiRunInteractiveRebase as unknown as ReturnType<typeof vi.fn>,
  state: apiGetRebaseState as unknown as ReturnType<typeof vi.fn>,
  success: toast.success as unknown as ReturnType<typeof vi.fn>,
  error: toast.error as unknown as ReturnType<typeof vi.fn>,
}

function node(oid: string, parents: string[] = [], refs: GitRef[] = []): GitGraphNode {
  return {
    commit: {
      oid,
      shortOid: oid,
      subject: `subject ${oid}`,
      message: `subject ${oid}`,
      parentOids: parents,
    },
    refs,
    column: 0,
    color: '#fff',
    connections: [],
  } as unknown as GitGraphNode
}

/** Newest first, as the graph holds them: `a` is HEAD (on `main`), `d` the oldest. */
const nodes = [
  node('a', ['b'], [{ name: 'main', shortName: 'main', type: 'branch', commitOid: 'a' }]),
  node('b', ['c']),
  node('c', ['d']),
  node('d', []),
]

function commit(oid: string) {
  return { oid, shortOid: oid, subject: `subject ${oid}`, message: `subject ${oid}` }
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function setup(overrides: Partial<Parameters<typeof useCommitReorderDrag>[0]> = {}) {
  return renderHook(
    () =>
      useCommitReorderDrag({
        repoPath: '/repo',
        nodes,
        selected: new Set<string>(),
        headBranchName: 'main',
        isRebasing: false,
        ...overrides,
      }),
    { wrapper }
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  // The backend hands the range back oldest first.
  mocked.range.mockResolvedValue([commit('c'), commit('b'), commit('a')])
  mocked.rebase.mockResolvedValue(undefined)
  mocked.state.mockResolvedValue({ kind: 'idle', steps: [] })
})

describe('useCommitReorderDrag — what can be dragged', () => {
  it("exposes HEAD's first-parent line as the draggable window", () => {
    const { result } = setup()
    expect([...result.current.dragContext.reorderable]).toEqual(['a', 'b', 'c', 'd'])
  })

  it('excludes everything from the first merge down', () => {
    const merged = [
      node('a', ['b'], [{ name: 'main', shortName: 'main', type: 'branch', commitOid: 'a' }]),
      node('b', ['c', 'x']),
      node('c', []),
    ]
    const { result } = setup({ nodes: merged })
    expect([...result.current.dragContext.reorderable]).toEqual(['a'])
  })
})

describe('useCommitReorderDrag — dropping', () => {
  it('opens the confirmation with the resulting order rather than acting straight away', () => {
    const { result } = setup()
    act(() => result.current.dragContext.onDrop({ kind: 'gap', oid: 'c', edge: 'above' }, ['a']))

    expect(mocked.rebase).not.toHaveBeenCalled()
    expect(result.current.pending?.operation.kind).toBe('reorder')
    expect(result.current.pending?.preview.map((c) => c.oid)).toEqual(['b', 'a', 'c'])
    expect(result.current.pending?.operation.baseOid).toBe('c')
  })

  it('resolves the dragged commits to their subjects for the dialog', () => {
    const { result } = setup()
    act(() => result.current.dragContext.onDrop({ kind: 'combine', oid: 'c' }, ['a']))
    expect(result.current.pending?.sources).toEqual([
      { oid: 'a', shortOid: 'a', subject: 'subject a' },
    ])
    expect(result.current.pending?.target.subject).toBe('subject c')
  })

  it('flags a rewrite that reaches commits already pushed', () => {
    const withRemote = [
      nodes[0],
      node(
        'b',
        ['c'],
        [{ name: 'origin/main', shortName: 'origin/main', type: 'remote', commitOid: 'b' }]
      ),
      nodes[2],
      nodes[3],
    ]
    const { result } = setup({ nodes: withRemote })
    act(() => result.current.dragContext.onDrop({ kind: 'combine', oid: 'c' }, ['a']))
    expect(result.current.pending?.rewritesPublished).toBe(true)
  })

  it('leaves the flag down when only unpushed commits are rewritten', () => {
    const withRemote = [
      nodes[0],
      nodes[1],
      node(
        'c',
        ['d'],
        [{ name: 'origin/main', shortName: 'origin/main', type: 'remote', commitOid: 'c' }]
      ),
      nodes[3],
    ]
    // Swapping `a` and `b` stops short of `c`, where `origin/main` sits.
    const { result } = setup({ nodes: withRemote })
    act(() => result.current.dragContext.onDrop({ kind: 'gap', oid: 'a', edge: 'above' }, ['b']))
    expect(result.current.pending?.rewritesPublished).toBe(false)
  })

  it('refuses every drop while a rebase is already running', () => {
    const { result } = setup({ isRebasing: true })
    act(() => result.current.dragContext.onDrop({ kind: 'combine', oid: 'c' }, ['a']))
    expect(result.current.pending).toBeNull()
    expect(mocked.error).toHaveBeenCalledWith(
      'Finish or abort the rebase in progress before moving commits.'
    )
  })

  it('explains a drop involving a commit off the current branch', () => {
    const { result } = setup()
    act(() => result.current.dragContext.onDrop({ kind: 'combine', oid: 'c' }, ['zzz']))
    expect(result.current.pending).toBeNull()
    expect(mocked.error).toHaveBeenCalledWith(
      'Only commits on the current branch, above its first merge, can be moved this way.'
    )
  })

  it('says nothing when the drop changes nothing', () => {
    const { result } = setup()
    act(() => result.current.dragContext.onDrop({ kind: 'combine', oid: 'a' }, ['a']))
    expect(result.current.pending).toBeNull()
    expect(mocked.error).not.toHaveBeenCalled()
  })
})

describe('useCommitReorderDrag — running the plan', () => {
  it('submits the reordered todo, oldest first', async () => {
    const { result } = setup()
    act(() => result.current.dragContext.onDrop({ kind: 'gap', oid: 'c', edge: 'above' }, ['a']))
    await act(async () => {
      await result.current.confirm('fixup')
    })

    expect(mocked.range).toHaveBeenCalledWith('/repo', 'c')
    expect(mocked.rebase).toHaveBeenCalledWith('/repo', 'c', [
      { action: 'pick', oid: 'c', message: undefined },
      { action: 'pick', oid: 'a', message: undefined },
      { action: 'pick', oid: 'b', message: undefined },
    ])
    expect(result.current.pending).toBeNull()
    expect(mocked.success).toHaveBeenCalledWith('Commit reordered')
  })

  it('folds a combine into the target with the chosen mode', async () => {
    const { result } = setup()
    act(() => result.current.dragContext.onDrop({ kind: 'combine', oid: 'c' }, ['a']))
    await act(async () => {
      await result.current.confirm('squash')
    })

    expect(mocked.rebase).toHaveBeenCalledWith('/repo', 'c', [
      { action: 'pick', oid: 'c', message: undefined },
      { action: 'squash', oid: 'a', message: undefined },
      { action: 'pick', oid: 'b', message: undefined },
    ])
    expect(mocked.success).toHaveBeenCalledWith('Commit combined')
  })

  it('hands a conflict over to the existing paused-rebase UI, and says so', async () => {
    mocked.state.mockResolvedValue({ kind: 'conflict', steps: [] })
    const { result } = setup()
    act(() => result.current.dragContext.onDrop({ kind: 'combine', oid: 'c' }, ['a']))
    await act(async () => {
      await result.current.confirm('fixup')
    })

    expect(mocked.success).not.toHaveBeenCalled()
    expect(mocked.error).toHaveBeenCalledWith(
      'The rebase stopped on a conflict — resolve the files, then continue it.'
    )
  })

  it('rewrites nothing when the range moved under the drag', async () => {
    // The backend no longer lists `a` — a fetch or a hook changed history mid-gesture.
    mocked.range.mockResolvedValue([commit('c'), commit('b')])
    const { result } = setup()
    act(() => result.current.dragContext.onDrop({ kind: 'gap', oid: 'c', edge: 'above' }, ['a']))
    await act(async () => {
      await result.current.confirm('fixup')
    })

    expect(mocked.rebase).not.toHaveBeenCalled()
    expect(mocked.error).toHaveBeenCalled()
  })

  it('drops the pending drop when the user cancels', () => {
    const { result } = setup()
    act(() => result.current.dragContext.onDrop({ kind: 'combine', oid: 'c' }, ['a']))
    act(() => result.current.cancel())
    expect(result.current.pending).toBeNull()
  })
})
