import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { toast } from '@git-manager/ui'
import type { GitGraphNode } from '@git-manager/git-types'
import { useGraphScrollSync } from './useGraphScrollSync'

const { virtualizerScrollToIndex } = vi.hoisted(() => ({ virtualizerScrollToIndex: vi.fn() }))
// jsdom reports a 0-height scroll container, so the real @tanstack/react-virtual would only
// produce virtual items that fit a 0px viewport — mocked the same way GitGraph.test.tsx does, so
// this hook's own scroll-sync effects (not react-virtual's windowing) are what's under test.
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (opts: { count: number; estimateSize: () => number }) => ({
    getTotalSize: () => opts.count * opts.estimateSize(),
    getVirtualItems: () => [],
    scrollToIndex: virtualizerScrollToIndex,
  }),
}))

vi.mock('@git-manager/ui', async () => {
  const actual = await vi.importActual<typeof import('@git-manager/ui')>('@git-manager/ui')
  return { ...actual, toast: { ...actual.toast, error: vi.fn() } }
})

function node(oid: string, refs: GitGraphNode['refs'] = []): GitGraphNode {
  return {
    commit: {
      oid,
      shortOid: oid.slice(0, 7),
      message: oid,
      subject: oid,
      body: '',
      author: { name: 'a', email: 'a@x.com', timestamp: 0 },
      committer: { name: 'a', email: 'a@x.com', timestamp: 0 },
      parentOids: [],
    },
    column: 0,
    color: '#000',
    connections: [],
    refs,
  }
}

const t = (key: string, opts?: Record<string, unknown>) => `${key}:${JSON.stringify(opts ?? {})}`

function renderSync(overrides: Partial<Parameters<typeof useGraphScrollSync>[0]> = {}) {
  const parentRef = { current: document.createElement('div') }
  const nodes = overrides.nodes ?? [node('a'), node('b')]
  const selectSingle = vi.fn(overrides.selectSingle)
  const setPendingGraphSelection = vi.fn(overrides.setPendingGraphSelection)
  const props = {
    parentRef,
    rowHeight: 40,
    nodes,
    filteredNodes: overrides.filteredNodes ?? nodes,
    conflictNode: overrides.conflictNode ?? null,
    isRebasePaused: overrides.isRebasePaused ?? false,
    branch: overrides.branch,
    repoPath: overrides.repoPath ?? '/repo',
    primaryOid: overrides.primaryOid ?? null,
    selectSingle,
    matchingOids: overrides.matchingOids ?? null,
    clampedMatchIndex: overrides.clampedMatchIndex ?? 0,
    pendingGraphSelection: overrides.pendingGraphSelection ?? null,
    setPendingGraphSelection,
    t,
  }
  const view = renderHook((p) => useGraphScrollSync(p), { initialProps: props })
  return {
    ...view,
    selectSingle,
    setPendingGraphSelection,
    props,
    rerender: () => view.rerender(props),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useGraphScrollSync', () => {
  it('selects and scrolls to the active search match', () => {
    const { selectSingle, rerender } = renderSync({ matchingOids: ['b'], clampedMatchIndex: 0 })
    rerender()
    expect(selectSingle).toHaveBeenCalledWith('b')
    expect(virtualizerScrollToIndex).toHaveBeenCalledWith(1, { align: 'center' })
  })

  it('resolves an abbreviated SHA from a pending graph selection and scrolls to it', () => {
    const { selectSingle, setPendingGraphSelection } = renderSync({
      nodes: [node('abcdef1'), node('other')],
      pendingGraphSelection: 'abcd',
    })
    expect(setPendingGraphSelection).toHaveBeenCalledWith(null)
    expect(selectSingle).toHaveBeenCalledWith('abcdef1')
    expect(virtualizerScrollToIndex).toHaveBeenCalledWith(0, { align: 'center' })
  })

  it('reports a SHA that matches nothing in the loaded window', () => {
    renderSync({ nodes: [node('abcdef1')], pendingGraphSelection: 'zzzz' })
    expect(toast.error).toHaveBeenCalled()
  })

  it('auto-selects the synthetic CONFLICT row once per pause', () => {
    const conflictNode = node('CONFLICT')
    const { selectSingle, rerender } = renderSync({ isRebasePaused: true, conflictNode })
    expect(selectSingle).toHaveBeenCalledWith('CONFLICT')
    selectSingle.mockClear()

    // Re-rendering while still paused must not re-select — that would fight the user navigating
    // away to inspect another commit mid-resolution.
    rerender()
    expect(selectSingle).not.toHaveBeenCalled()
  })

  it('auto-selects the branch-matching node on a branch change', () => {
    const feat = node('feat-tip', [{ name: 'refs/heads/feat', shortName: 'feat', type: 'branch', commitOid: 'feat-tip' }])
    const { selectSingle } = renderSync({ nodes: [node('main-tip'), feat], branch: 'feat' })
    expect(selectSingle).toHaveBeenCalledWith('feat-tip')
  })

  it('falls back to primaryOid when no branch is given', () => {
    const { selectSingle } = renderSync({ nodes: [node('a'), node('b')], primaryOid: 'b' })
    expect(selectSingle).toHaveBeenCalledWith('b')
  })
})
