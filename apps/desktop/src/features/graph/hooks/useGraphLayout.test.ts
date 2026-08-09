import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { GitGraphNode } from '@git-manager/git-types'
import { useGraphLayout } from './useGraphLayout'
import { useRefDragStore } from '../stores/refDrag.store'
import { COLUMN_ORDER, type ColumnKey } from '../lib/columns.config'

function node(
  oid: string,
  column: number,
  connections: GitGraphNode['connections'] = [],
  parentOids: string[] = []
): GitGraphNode {
  return {
    commit: {
      oid,
      shortOid: oid.slice(0, 7),
      message: oid,
      subject: oid,
      body: '',
      author: { name: 'a', email: 'a@x.com', timestamp: 0 },
      committer: { name: 'a', email: 'a@x.com', timestamp: 0 },
      parentOids,
    },
    column,
    color: '#000000',
    connections,
    refs: [],
  }
}

/** Every column visible at its default width — the shape `useGitGraphColumnsStore` persists. */
function defaultColumnState(): Record<ColumnKey, { visible: boolean; width: number }> {
  const state = {} as Record<ColumnKey, { visible: boolean; width: number }>
  for (const key of COLUMN_ORDER) state[key] = { visible: true, width: 200 }
  return state
}

function renderLayout(overrides: Partial<Parameters<typeof useGraphLayout>[0]> = {}) {
  const parentRef = { current: document.createElement('div') }
  const nodes = overrides.nodes ?? [node('a', 0)]
  return renderHook(() =>
    useGraphLayout({
      nodes,
      renderNodes: overrides.renderNodes ?? nodes,
      columnState: overrides.columnState ?? defaultColumnState(),
      rowHeight: overrides.rowHeight ?? 40,
      matchingOids: overrides.matchingOids ?? null,
      authorMatchingOids: overrides.authorMatchingOids ?? null,
      parentRef: overrides.parentRef ?? parentRef,
    })
  )
}

describe('useGraphLayout', () => {
  beforeEach(() => {
    useRefDragStore.setState({ draggingRef: null, hoverRef: null })
  })

  it('derives graphMaxColumn from the widest lane and connection in renderNodes', () => {
    const renderNodes = [
      node('a', 0, [{ fromColumn: 0, toColumn: 2, color: '#000' }]),
      node('b', 1),
    ]
    const { result } = renderLayout({ renderNodes })
    expect(result.current.graphMaxColumn).toBe(2)
  })

  it('resolves avatarSize from rowHeight (small row → 24px, standard → 32px)', () => {
    expect(renderLayout({ rowHeight: 32 }).result.current.avatarSize).toBe(24)
    expect(renderLayout({ rowHeight: 40 }).result.current.avatarSize).toBe(32)
  })

  it('only includes columns marked visible, in COLUMN_ORDER', () => {
    const columnState = defaultColumnState()
    columnState.author.visible = false
    const { result } = renderLayout({ columnState })
    expect(result.current.visibleColumns.map((c) => c.key)).toEqual(
      COLUMN_ORDER.filter((k) => k !== 'author')
    )
  })

  it('derives refsWidth/graphWidth from the resolved refs/graph columns, 0 when hidden', () => {
    const columnState = defaultColumnState()
    columnState.refs.width = 150
    const { result } = renderLayout({ columnState })
    expect(result.current.refsWidth).toBe(150)
    expect(result.current.graphWidth).toBeGreaterThan(0)

    columnState.graph.visible = false
    const hidden = renderLayout({ columnState })
    expect(hidden.result.current.graphWidth).toBe(0)
    expect(hidden.result.current.graphOverflowZone).toBeNull()
  })

  it('caps the graph column width at what graphMaxColumn actually needs', () => {
    const columnState = defaultColumnState()
    columnState.graph.width = 5000
    const renderNodes = [node('a', 0)]
    const { result } = renderLayout({ columnState, renderNodes })
    expect(result.current.graphWidth).toBeLessThan(5000)
  })

  it('builds matchSet/totalMatches from matchingOids, null when there is no active search', () => {
    const none = renderLayout({ matchingOids: null })
    expect(none.result.current.matchSet).toBeNull()
    expect(none.result.current.totalMatches).toBe(0)

    const some = renderLayout({ matchingOids: ['a', 'b'] })
    expect(some.result.current.matchSet).toEqual(new Set(['a', 'b']))
    expect(some.result.current.totalMatches).toBe(2)
  })

  it('builds authorMatchSet from authorMatchingOids, null when no author filter is active', () => {
    const none = renderLayout({ authorMatchingOids: null })
    expect(none.result.current.authorMatchSet).toBeNull()

    const some = renderLayout({ authorMatchingOids: ['a'] })
    expect(some.result.current.authorMatchSet).toEqual(new Set(['a']))
  })

  it('has no drag highlight when nothing is drag-hovered', () => {
    const { result } = renderLayout()
    expect(result.current.dragHighlightSet).toBeNull()
  })

  it('scrollToColumn pans so the target lane centers in the visible width, clamped to maxScrollX', () => {
    const columnState = defaultColumnState()
    columnState.graph.width = 48 // GRAPH_MIN_WIDTH — forces overflow so scrolling has an effect
    const renderNodes = Array.from({ length: 8 }, (_, i) => node(String(i), i))
    const { result } = renderLayout({ columnState, renderNodes })
    expect(result.current.graphColumnBounds.maxScrollX).toBeGreaterThan(0)

    act(() => result.current.scrollToColumn(6))
    expect(result.current.graphScrollX).toBeGreaterThan(0)
    expect(result.current.graphScrollX).toBeLessThanOrEqual(result.current.graphColumnBounds.maxScrollX)
  })

  it('scrollToColumn is a no-op when the graph column is hidden', () => {
    const columnState = defaultColumnState()
    columnState.graph.visible = false
    const { result } = renderLayout({ columnState })
    act(() => result.current.scrollToColumn(3))
    expect(result.current.graphScrollX).toBe(0)
  })

  it("highlights the hovered ref's own lane once a drag-drop target is set", () => {
    const nodes = [
      {
        ...node('tip', 0, [], ['base']),
        refs: [
          { name: 'refs/heads/feat', shortName: 'feat', type: 'branch' as const, commitOid: 'tip' },
        ],
      },
      node('base', 0),
    ]
    useRefDragStore.setState({
      draggingRef: null,
      hoverRef: { name: 'refs/heads/feat', shortName: 'feat', type: 'branch', commitOid: 'tip' },
    })
    const { result } = renderLayout({ nodes, renderNodes: nodes })
    expect(result.current.dragHighlightSet).toEqual(new Set(['tip', 'base']))
  })
})
