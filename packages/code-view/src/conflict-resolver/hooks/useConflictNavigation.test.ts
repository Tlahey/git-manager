import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { editor } from 'monaco-editor'
import type { MergeBlock } from '../../types'
import { computeInitialPlacements } from '../../mergeBlockLayout'
import type { MergeEditorRefs } from './useMergeEditorRefs'
import { useConflictNavigation } from './useConflictNavigation'

function fakeCenterEditor(topVisibleLine = 1) {
  const calls = { revealed: [] as number[], positions: [] as number[], focused: 0 }
  const instance = {
    getVisibleRanges: () => [{ startLineNumber: topVisibleLine, startColumn: 1, endLineNumber: topVisibleLine + 20, endColumn: 1 }],
    revealLineInCenter: (line: number) => calls.revealed.push(line),
    setPosition: (pos: { lineNumber: number; column: number }) => calls.positions.push(pos.lineNumber),
    focus: () => {
      calls.focused += 1
    },
  } as unknown as editor.IStandaloneCodeEditor
  return { instance, calls }
}

function editorsWith(center: editor.IStandaloneCodeEditor | null): MergeEditorRefs {
  return {
    monacoRef: { current: null },
    oursEditorRef: { current: null },
    centerEditorRef: { current: center },
    theirsEditorRef: { current: null },
    oursDecorationsRef: { current: null },
    centerDecorationsRef: { current: null },
    theirsDecorationsRef: { current: null },
    oursZoneIdsRef: { current: [] },
    centerZoneIdsRef: { current: [] },
    theirsZoneIdsRef: { current: [] },
    oursCollapsedViewZonesRef: { current: [] },
    centerCollapsedViewZonesRef: { current: [] },
    theirsCollapsedViewZonesRef: { current: [] },
  }
}

function makeBlocks(): MergeBlock[] {
  const unchanged = (blockId: number, start: number): MergeBlock => ({
    blockId,
    kind: 'unchanged',
    oursStartLine: start,
    oursLineCount: 1,
    theirsStartLine: start,
    theirsLineCount: 1,
    oursLines: [`u${start}`],
    theirsLines: [`u${start}`],
  })
  const conflict = (blockId: number, start: number): MergeBlock => ({
    blockId,
    kind: 'both-different',
    oursStartLine: start,
    oursLineCount: 1,
    theirsStartLine: start,
    theirsLineCount: 1,
    oursLines: [`ours ${start}`],
    theirsLines: [`theirs ${start}`],
  })
  return [unchanged(1, 1), conflict(2, 2), unchanged(3, 3), conflict(4, 4)]
}

describe('useConflictNavigation', () => {
  it('filters changeBlocks to non-unchanged blocks', () => {
    const blocks = makeBlocks()
    const placementsRef = { current: computeInitialPlacements(blocks) }
    const { result } = renderHook(() => useConflictNavigation(blocks, placementsRef, editorsWith(fakeCenterEditor().instance)))

    expect(result.current.changeBlocks.map((b) => b.blockId)).toEqual([2, 4])
  })

  it('navigates next/prev between change blocks, revealing and focusing the center pane, and stops at boundaries', () => {
    const blocks = makeBlocks()
    const placementsRef = { current: computeInitialPlacements(blocks) }
    const { instance, calls } = fakeCenterEditor()
    const { result } = renderHook(() => useConflictNavigation(blocks, placementsRef, editorsWith(instance)))

    // Starts on the first change block (index 0 = block 2); next goes to block 4.
    act(() => result.current.navigateConflict('next'))
    expect(calls.revealed).toEqual([4])
    expect(calls.positions).toEqual([4])
    expect(calls.focused).toBe(1)
    expect(result.current.activeBlockIndex).toBe(1)

    // Boundary: already on the last change block.
    act(() => result.current.navigateConflict('next'))
    expect(calls.revealed).toEqual([4])

    act(() => result.current.navigateConflict('prev'))
    expect(calls.revealed).toEqual([4, 2])
    expect(result.current.activeBlockIndex).toBe(0)

    // Boundary: already on the first change block.
    act(() => result.current.navigateConflict('prev'))
    expect(calls.revealed).toEqual([4, 2])
  })

  it('updateActiveBlockIndex picks the change block at or after the top visible line', () => {
    const blocks = makeBlocks()
    const placementsRef = { current: computeInitialPlacements(blocks) }
    const { instance } = fakeCenterEditor(3) // scrolled so line 3 is on top
    const { result } = renderHook(() => useConflictNavigation(blocks, placementsRef, editorsWith(instance)))

    act(() => result.current.updateActiveBlockIndex())
    expect(result.current.activeBlockIndex).toBe(1) // block 4 (center line 4 >= 3)
  })

  it('updateActiveBlockIndex falls back to the last change block when scrolled past everything', () => {
    const blocks = makeBlocks()
    const placementsRef = { current: computeInitialPlacements(blocks) }
    const { instance } = fakeCenterEditor(50)
    const { result } = renderHook(() => useConflictNavigation(blocks, placementsRef, editorsWith(instance)))

    act(() => result.current.updateActiveBlockIndex())
    expect(result.current.activeBlockIndex).toBe(1)
  })

  it('reports -1 when there are no change blocks, and navigation is a no-op', () => {
    const blocks: MergeBlock[] = [
      {
        blockId: 1,
        kind: 'unchanged',
        oursStartLine: 1,
        oursLineCount: 1,
        theirsStartLine: 1,
        theirsLineCount: 1,
        oursLines: ['x'],
        theirsLines: ['x'],
      },
    ]
    const placementsRef = { current: computeInitialPlacements(blocks) }
    const { instance, calls } = fakeCenterEditor()
    const { result } = renderHook(() => useConflictNavigation(blocks, placementsRef, editorsWith(instance)))

    act(() => result.current.updateActiveBlockIndex())
    expect(result.current.activeBlockIndex).toBe(-1)

    act(() => result.current.navigateConflict('next'))
    expect(calls.revealed).toEqual([])
  })
})
