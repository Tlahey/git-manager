import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { createRef, type MutableRefObject } from 'react'
import type { MergeBlock } from '../../types'
import type { BlockPlacement } from '../../mergeBlockLayout'
import { useLineTopGeometry } from './useLineTopGeometry'

const LINE_HEIGHT = 19
/** Long enough that `collapsedRegionForRange` actually collapses its middle. */
const UNCHANGED_LINES = 40

function unchangedBlock(blockId: number, startLine: number): MergeBlock {
  return {
    blockId,
    kind: 'unchanged',
    oursStartLine: startLine,
    oursLineCount: UNCHANGED_LINES,
    theirsStartLine: startLine,
    theirsLineCount: UNCHANGED_LINES,
    oursLines: [],
    theirsLines: [],
  }
}

function placementFor(block: MergeBlock): BlockPlacement {
  return {
    blockId: block.blockId,
    centerStartLine: block.oursStartLine,
    centerLineCount: block.oursLineCount,
    oursIncluded: false,
    theirsIncluded: false,
    oursTouched: false,
    theirsTouched: false,
  }
}

function setup(collapseUnchanged = true) {
  const blocks = [unchangedBlock(0, 1)]
  const placements = new Map(blocks.map((block) => [block.blockId, placementFor(block)]))

  const blocksRef = createRef() as MutableRefObject<MergeBlock[]>
  blocksRef.current = blocks
  const placementsRef = createRef() as MutableRefObject<Map<number, BlockPlacement>>
  placementsRef.current = placements

  const { result, rerender } = renderHook(
    (props: { collapseUnchanged: boolean; expandedBlocks: Set<number> }) =>
      useLineTopGeometry({
        blocksRef,
        placementsRef,
        expandedBlocks: props.expandedBlocks,
        collapseUnchanged: props.collapseUnchanged,
        isTwoWay: true,
        showBlockBorders: false,
        highlightMode: 'words',
      }),
    { initialProps: { collapseUnchanged, expandedBlocks: new Set<number>() } }
  )

  return { blocksRef, placementsRef, result, rerender }
}

describe('useLineTopGeometry', () => {
  it('stacks plain lines when nothing is collapsed', () => {
    const { result } = setup(false)
    expect(result.current('theirs', 10, LINE_HEIGHT)).toBe(9 * LINE_HEIGHT)
  })

  it('skips the hidden middle of a collapsed unchanged block', () => {
    const { result } = setup(true)
    // Collapsing hides lines in the middle of the 40-line block, so the last line's top is well
    // below the uncollapsed 39 * lineHeight — and the banner zone adds its own height back.
    const collapsedTop = result.current('theirs', UNCHANGED_LINES, LINE_HEIGHT)
    expect(collapsedTop).toBeLessThan(39 * LINE_HEIGHT)
    expect(collapsedTop).toBeGreaterThan(0)
  })

  it('keeps a stable callback identity across re-renders', () => {
    const { result, rerender } = setup(true)
    const first = result.current
    rerender({ collapseUnchanged: false, expandedBlocks: new Set<number>() })
    expect(result.current).toBe(first)
  })

  it('recomputes when the collapse state changes', () => {
    const { result, rerender } = setup(true)
    const collapsed = result.current('theirs', UNCHANGED_LINES, LINE_HEIGHT)
    rerender({ collapseUnchanged: false, expandedBlocks: new Set<number>() })
    const expanded = result.current('theirs', UNCHANGED_LINES, LINE_HEIGHT)

    expect(expanded).toBe(39 * LINE_HEIGHT)
    expect(expanded).not.toBe(collapsed)
  })

  it('recomputes when the line height changes', () => {
    const { result } = setup(false)
    expect(result.current('theirs', 10, LINE_HEIGHT)).toBe(9 * LINE_HEIGHT)
    expect(result.current('theirs', 10, 24)).toBe(9 * 24)
  })

  it('caches per placements identity, not per placements contents', () => {
    const { placementsRef, result } = setup(true)
    const cached = result.current('center', UNCHANGED_LINES, LINE_HEIGHT)

    // Mutating in place must NOT be picked up — the resolver always replaces the map wholesale,
    // and relying on identity is what makes the cache cheap enough to call per scroll event.
    placementsRef.current.get(0)!.centerLineCount = 4
    expect(result.current('center', UNCHANGED_LINES, LINE_HEIGHT)).toBe(cached)

    // Replacing it invalidates.
    placementsRef.current = new Map(placementsRef.current)
    expect(result.current('center', UNCHANGED_LINES, LINE_HEIGHT)).not.toBe(cached)
  })

  it('resolves each pane independently', () => {
    const { blocksRef, placementsRef, result } = setup(true)
    // Shift the center pane's copy of the block down, leaving the left pane's untouched.
    const shifted = new Map(placementsRef.current)
    shifted.set(0, { ...shifted.get(0)!, centerStartLine: 5 })
    placementsRef.current = shifted
    blocksRef.current = blocksRef.current.slice()

    expect(result.current('center', 30, LINE_HEIGHT)).not.toBe(
      result.current('theirs', 30, LINE_HEIGHT)
    )
  })
})
