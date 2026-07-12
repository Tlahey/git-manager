import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { GitGraphNode } from '@git-manager/git-types'
import { useCommitSelection } from './useCommitSelection'

function node(oid: string): GitGraphNode {
  return { commit: { oid } } as GitGraphNode
}

function clickEvent(
  overrides: Partial<{ shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }> = {}
) {
  return { shiftKey: false, metaKey: false, ctrlKey: false, ...overrides } as React.MouseEvent
}

const NODES = [node('a'), node('b'), node('c'), node('d'), node('e')]

describe('useCommitSelection', () => {
  it('selectSingle selects one commit and notifies the callback', () => {
    const onSelectCommit = vi.fn()
    const { result } = renderHook(() => useCommitSelection(NODES, onSelectCommit))
    act(() => result.current.selectSingle('b'))
    expect(result.current.selected).toEqual(new Set(['b']))
    expect(result.current.primaryOid).toBe('b')
    expect(onSelectCommit).toHaveBeenCalledWith('b')
  })

  it('clearSelection resets state and notifies with an empty string', () => {
    const onSelectCommit = vi.fn()
    const { result } = renderHook(() => useCommitSelection(NODES, onSelectCommit))
    act(() => result.current.selectSingle('b'))
    act(() => result.current.clearSelection())
    expect(result.current.selected).toEqual(new Set())
    expect(result.current.primaryOid).toBeNull()
    expect(onSelectCommit).toHaveBeenLastCalledWith('')
  })

  describe('handleRowSelect — plain click', () => {
    it('selects the clicked row', () => {
      const { result } = renderHook(() => useCommitSelection(NODES))
      act(() => result.current.handleRowSelect(clickEvent(), 1))
      expect(result.current.selected).toEqual(new Set(['b']))
      expect(result.current.primaryOid).toBe('b')
    })

    it('clicking the already-primary row clears the selection (toggle off)', () => {
      const { result } = renderHook(() => useCommitSelection(NODES))
      act(() => result.current.handleRowSelect(clickEvent(), 1))
      act(() => result.current.handleRowSelect(clickEvent(), 1))
      expect(result.current.selected).toEqual(new Set())
      expect(result.current.primaryOid).toBeNull()
    })
  })

  describe('handleRowSelect — shift-click range select', () => {
    it('selects the inclusive range from the anchor to the clicked row', () => {
      const { result } = renderHook(() => useCommitSelection(NODES))
      act(() => result.current.handleRowSelect(clickEvent(), 1)) // anchor = b
      act(() => result.current.handleRowSelect(clickEvent({ shiftKey: true }), 3)) // shift to d
      expect(result.current.selected).toEqual(new Set(['b', 'c', 'd']))
      expect(result.current.primaryOid).toBe('d')
    })

    it('selects the range regardless of click direction (backwards shift-click)', () => {
      const { result } = renderHook(() => useCommitSelection(NODES))
      act(() => result.current.handleRowSelect(clickEvent(), 3)) // anchor = d
      act(() => result.current.handleRowSelect(clickEvent({ shiftKey: true }), 1)) // shift to b
      expect(result.current.selected).toEqual(new Set(['b', 'c', 'd']))
    })

    it('falls back to selecting just the clicked row when there is no anchor yet', () => {
      const { result } = renderHook(() => useCommitSelection(NODES))
      act(() => result.current.handleRowSelect(clickEvent({ shiftKey: true }), 2))
      expect(result.current.selected).toEqual(new Set(['c']))
    })
  })

  describe('handleRowSelect — ctrl/cmd-click multi-toggle', () => {
    it('adds the clicked row to the selection', () => {
      const { result } = renderHook(() => useCommitSelection(NODES))
      act(() => result.current.handleRowSelect(clickEvent(), 1))
      act(() => result.current.handleRowSelect(clickEvent({ metaKey: true }), 3))
      expect(result.current.selected).toEqual(new Set(['b', 'd']))
      expect(result.current.primaryOid).toBe('d')
    })

    it('removes an already-selected row on ctrl/cmd-click', () => {
      const { result } = renderHook(() => useCommitSelection(NODES))
      act(() => result.current.handleRowSelect(clickEvent(), 1))
      act(() => result.current.handleRowSelect(clickEvent({ ctrlKey: true }), 3))
      act(() => result.current.handleRowSelect(clickEvent({ ctrlKey: true }), 3))
      expect(result.current.selected).toEqual(new Set(['b']))
    })

    it('moves the anchor to the ctrl/cmd-clicked row', () => {
      const { result } = renderHook(() => useCommitSelection(NODES))
      act(() => result.current.handleRowSelect(clickEvent(), 1)) // anchor = b
      act(() => result.current.handleRowSelect(clickEvent({ metaKey: true }), 3)) // anchor -> d, selects b+d
      act(() => result.current.handleRowSelect(clickEvent({ shiftKey: true }), 4)) // shift from d to e
      expect(result.current.selected).toEqual(new Set(['d', 'e']))
    })
  })

  describe('handleRowSelect — WIP/CONFLICT synthetic rows', () => {
    it('treats WIP as a single-select toggle, ignoring shift/ctrl modifiers', () => {
      const nodes = [node('WIP'), ...NODES]
      const { result } = renderHook(() => useCommitSelection(nodes))
      act(() => result.current.handleRowSelect(clickEvent({ shiftKey: true, metaKey: true }), 0))
      expect(result.current.selected).toEqual(new Set(['WIP']))
    })

    it('clicking the already-selected WIP row again clears the selection', () => {
      const nodes = [node('WIP'), ...NODES]
      const { result } = renderHook(() => useCommitSelection(nodes))
      act(() => result.current.handleRowSelect(clickEvent(), 0))
      act(() => result.current.handleRowSelect(clickEvent(), 0))
      expect(result.current.selected).toEqual(new Set())
    })

    it('treats CONFLICT the same way as WIP', () => {
      const nodes = [node('CONFLICT'), ...NODES]
      const { result } = renderHook(() => useCommitSelection(nodes))
      act(() => result.current.handleRowSelect(clickEvent(), 0))
      expect(result.current.selected).toEqual(new Set(['CONFLICT']))
    })
  })
})
