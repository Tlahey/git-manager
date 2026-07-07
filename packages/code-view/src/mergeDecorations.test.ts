import { describe, expect, it } from 'vitest'
import type { MergeBlock } from './types'
import { computeInitialPlacements, updatePlacementAfterToggle } from './mergeBlockLayout'
import { blockDecorationSpecs, computeMergeVisuals } from './mergeDecorations'

function block(overrides: Partial<MergeBlock> & Pick<MergeBlock, 'blockId' | 'kind'>): MergeBlock {
  return {
    oursStartLine: 1,
    oursLineCount: 0,
    theirsStartLine: 1,
    theirsLineCount: 0,
    oursLines: [],
    theirsLines: [],
    baseLines: [],
    ...overrides,
  }
}

describe('blockDecorationSpecs — hermetic border splitting', () => {
  it('gives a single-line block both borders on its one decoration', () => {
    expect(blockDecorationSpecs(5, 1, 'conflict', true, true)).toEqual([
      {
        startLine: 5,
        endLine: 5,
        className: 'merge-text-conflict merge-border-top-conflict merge-border-bottom-conflict',
        marginClassName: 'merge-vivid-conflict merge-border-top-conflict merge-border-bottom-conflict',
      },
    ])
  })

  it('splits a two-line block into a top-bordered first line and a bottom-bordered last line', () => {
    expect(blockDecorationSpecs(5, 2, 'modification', true, true)).toEqual([
      {
        startLine: 5,
        endLine: 5,
        className: 'merge-text-modification merge-border-top-modification',
        marginClassName: 'merge-vivid-modification merge-border-top-modification',
      },
      {
        startLine: 6,
        endLine: 6,
        className: 'merge-text-modification merge-border-bottom-modification',
        marginClassName: 'merge-vivid-modification merge-border-bottom-modification',
      },
    ])
  })

  it('leaves the middle lines of a taller block borderless (no horizontal grid inside the block)', () => {
    const specs = blockDecorationSpecs(10, 4, 'addition', true, true)
    expect(specs).toHaveLength(3)
    expect(specs[1]).toEqual({
      startLine: 11,
      endLine: 12,
      className: 'merge-text-addition',
      marginClassName: 'merge-vivid-addition',
    })
  })

  it('collapses to a single plain decoration when neither edge is drawn', () => {
    expect(blockDecorationSpecs(10, 4, 'addition', false, false)).toEqual([
      { startLine: 10, endLine: 13, className: 'merge-text-addition', marginClassName: 'merge-vivid-addition' },
    ])
  })

  it('suppresses an edge on request (something else — another sub-range or a filler zone — closes it)', () => {
    const [only] = blockDecorationSpecs(3, 1, 'conflict', true, false)
    expect(only.className).toBe('merge-text-conflict merge-border-top-conflict')
  })

  it('emits nothing for an empty range', () => {
    expect(blockDecorationSpecs(3, 0, 'conflict', true, true)).toEqual([])
  })
})

// An unchanged header plus a real two-sided conflict — the same minimal shape the component
// tests use, exercised here directly against the pure spec computation.
function conflictBlocks(): MergeBlock[] {
  return [
    block({
      blockId: 1,
      kind: 'unchanged',
      oursStartLine: 1,
      oursLineCount: 1,
      theirsStartLine: 1,
      theirsLineCount: 1,
      oursLines: ['header'],
      theirsLines: ['header'],
    }),
    block({
      blockId: 2,
      kind: 'both-different',
      oursStartLine: 2,
      oursLineCount: 1,
      theirsStartLine: 2,
      theirsLineCount: 1,
      oursLines: ['ours conflict'],
      theirsLines: ['theirs conflict'],
    }),
  ]
}

describe('computeMergeVisuals — alignment view zones', () => {
  it('produces no zones while every pane shows the same line count per block', () => {
    const blocks = conflictBlocks()
    const visuals = computeMergeVisuals(blocks, computeInitialPlacements(blocks))
    expect(visuals.ours.viewZones).toEqual([])
    expect(visuals.center.viewZones).toEqual([])
    expect(visuals.theirs.viewZones).toEqual([])
  })

  it('draws no border classes by default — plain fills and plain hatched zones only', () => {
    const blocks = conflictBlocks()
    const placements = updatePlacementAfterToggle(computeInitialPlacements(blocks), blocks, blocks[1], 'theirs', true)

    const visuals = computeMergeVisuals(blocks, placements)

    expect(visuals.ours.viewZones).toEqual([])
    expect(visuals.ours.decorations).toEqual([
      { startLine: 2, endLine: 2, className: 'merge-text-conflict', marginClassName: 'merge-vivid-conflict' },
    ])
    expect(visuals.ours.decorations.some((d) => d.className.includes('merge-border-'))).toBe(false)
    expect(visuals.theirs.decorations).toEqual([
      {
        startLine: 2,
        endLine: 2,
        className: 'merge-text-conflict merge-resolved merge-border-top-conflict merge-resolved merge-border-bottom-conflict merge-resolved',
        marginClassName: 'merge-vivid-conflict merge-resolved merge-border-top-conflict merge-resolved merge-border-bottom-conflict merge-resolved',
      },
    ])
  })

  it('fills both side panes once the center holds both sides of a conflict (borders on)', () => {
    const blocks = conflictBlocks()
    const placements = updatePlacementAfterToggle(computeInitialPlacements(blocks), blocks, blocks[1], 'theirs', true)

    const visuals = computeMergeVisuals(blocks, placements, true)

    // Center block is 2 lines (ours + theirs); each side pane shows 1 → 1 hatched line each,
    // after that pane's own line 2. The zone closes the block's bottom edge; the pane's own
    // content keeps only the top edge.
    expect(visuals.ours.viewZones).toEqual([])
    expect(visuals.theirs.viewZones).toEqual([])
    expect(visuals.center.viewZones).toEqual([])
    expect(visuals.ours.decorations.at(-1)?.className).toBe('merge-text-conflict merge-border-top-conflict merge-border-bottom-conflict')
  })

  it('renders a not-yet-pulled pure addition as a zero-height boundary marker (no space consumed) in the empty panes', () => {
    const blocks = [
      block({
        blockId: 1,
        kind: 'theirs-only',
        oursStartLine: 1,
        oursLineCount: 0,
        theirsStartLine: 1,
        theirsLineCount: 2,
        oursLines: [],
        theirsLines: ['new a', 'new b'],
      }),
    ]
    const visuals = computeMergeVisuals(blocks, computeInitialPlacements(blocks))

    // No hatched zone anywhere (a pure insertion consumes no space in the panes it's absent
    // from, WebStorm-style). The center — where the content would land — gets the intense green
    // boundary line along the top edge of the line at the insertion point; ours, the mirror
    // pane that will never have this content, gets NO decoration at all — untouched code.
    expect(visuals.ours.viewZones).toEqual([])
    expect(visuals.center.viewZones).toEqual([])
    expect(visuals.center.decorations).toEqual([
      { startLine: 1, endLine: 1, className: 'merge-marker-top-addition', marginClassName: 'merge-marker-top-addition' },
    ])
    expect(visuals.ours.decorations).toEqual([])
    // The side that has the content keeps its classic green block.
    expect(visuals.theirs.viewZones).toEqual([])
    expect(visuals.theirs.decorations).toEqual([
      { startLine: 1, endLine: 2, className: 'merge-text-addition', marginClassName: 'merge-vivid-addition' },
    ])
  })

  it('flips the boundary marker to the last line’s bottom edge when the insertion point is past the end of the pane', () => {
    const blocks = [
      block({
        blockId: 1,
        kind: 'unchanged',
        oursStartLine: 1,
        oursLineCount: 1,
        theirsStartLine: 1,
        theirsLineCount: 1,
        oursLines: ['header'],
        theirsLines: ['header'],
      }),
      block({
        blockId: 2,
        kind: 'theirs-only',
        oursStartLine: 2,
        oursLineCount: 0,
        theirsStartLine: 2,
        theirsLineCount: 2,
        oursLines: [],
        theirsLines: ['tail a', 'tail b'],
      }),
    ]
    const visuals = computeMergeVisuals(blocks, computeInitialPlacements(blocks))

    // The addition appends after ours' only line — there's no line 2 to carry a top edge, so
    // the center's marker lands on line 1's bottom edge instead. Ours (the mirror pane) still
    // gets no decoration at all.
    expect(visuals.center.decorations).toEqual([
      { startLine: 1, endLine: 1, className: 'merge-marker-bottom-addition', marginClassName: 'merge-marker-bottom-addition' },
    ])
    expect(visuals.ours.decorations).toEqual([])
    expect(visuals.ours.viewZones).toEqual([])
    expect(visuals.center.viewZones).toEqual([])
  })

  it('fills the hole a pure deletion leaves with a hatched zone (the space existed in the base), not a marker', () => {
    const blocks = [
      block({
        blockId: 1,
        kind: 'theirs-only',
        oursStartLine: 1,
        oursLineCount: 2,
        theirsStartLine: 1,
        theirsLineCount: 0,
        oursLines: ['legacy-cache', 'legacy-session'],
        theirsLines: [],
      }),
    ]
    const visuals = computeMergeVisuals(blocks, computeInitialPlacements(blocks))

    // Theirs deleted these lines: its pane keeps a 2-line hatched zone where they used to be.
    expect(visuals.theirs.decorations).toEqual([
      { startLine: 1, endLine: 1, className: 'merge-marker-top-deletion', marginClassName: 'merge-marker-top-deletion' },
    ])
    // Ours and the center still hold the content — plain gray deletion blocks, no zones.
    expect(visuals.ours.viewZones).toEqual([])
    expect(visuals.center.viewZones).toEqual([])
    expect(visuals.ours.decorations).toEqual([])
  })

  it('mirrors that for an ours-only deletion: OURS (the side that deleted) gets the hatched zone, never the center', () => {
    // ours deleted these lines, theirs still has them. Golden rule: the center never shows a
    // hachured filler — it must default to theirs' still-present content instead (see
    // mergeBlockLayout.ts's defaultFlags exception for this exact case), so the deficit lands
    // on ours alone.
    const blocks = [
      block({
        blockId: 1,
        kind: 'ours-only',
        oursStartLine: 1,
        oursLineCount: 0,
        theirsStartLine: 1,
        theirsLineCount: 2,
        oursLines: [],
        theirsLines: ['legacy-cache', 'legacy-session'],
      }),
    ]
    const visuals = computeMergeVisuals(blocks, computeInitialPlacements(blocks))

    expect(visuals.ours.decorations).toEqual([
      { startLine: 1, endLine: 1, className: 'merge-marker-top-deletion', marginClassName: 'merge-marker-top-deletion' },
    ])
    // Theirs and the center both show the real, kept content — no zone at the center, ever.
    expect(visuals.theirs.viewZones).toEqual([])
    expect(visuals.center.viewZones).toEqual([])
    expect(visuals.center.decorations).toEqual([
      { startLine: 1, endLine: 2, className: 'merge-text-deletion', marginClassName: 'merge-vivid-deletion' },
    ])
  })

  it('never zones or colors auto-merged blocks', () => {
    const blocks = [
      block({
        blockId: 1,
        kind: 'unchanged',
        oursStartLine: 1,
        oursLineCount: 3,
        theirsStartLine: 1,
        theirsLineCount: 3,
        oursLines: ['a', 'b', 'c'],
        theirsLines: ['a', 'b', 'c'],
      }),
    ]
    const visuals = computeMergeVisuals(blocks, computeInitialPlacements(blocks))
    expect(visuals.ours.decorations).toEqual([])
    expect(visuals.ours.viewZones).toEqual([])
    expect(visuals.center.decorations).toEqual([])
    expect(visuals.center.viewZones).toEqual([])
  })

  it('does not highlight the untouched side of a one-sided modification', () => {
    const blocks = [
      block({
        blockId: 1,
        kind: 'ours-only',
        oursStartLine: 1,
        oursLineCount: 1,
        theirsStartLine: 1,
        theirsLineCount: 1,
        oursLines: ['ours modified'],
        theirsLines: ['base content'],
      }),
    ]
    const visuals = computeMergeVisuals(blocks, computeInitialPlacements(blocks))
    // Ours has the change, so ours gets blue (modification) decoration.
    expect(visuals.ours.decorations).toEqual([
      { startLine: 1, endLine: 1, className: 'merge-text-modification', marginClassName: 'merge-vivid-modification' }
    ])
    // Theirs has NO change, so theirs gets NO decoration.
    expect(visuals.theirs.decorations).toEqual([])
  })

  it('colors the center block with both sub-ranges when both sides are included, bordered as one block (borders on)', () => {
    const blocks = conflictBlocks()
    const placements = updatePlacementAfterToggle(computeInitialPlacements(blocks), blocks, blocks[1], 'theirs', true)

    const visuals = computeMergeVisuals(blocks, placements, true)
    const centerBlockDecorations = visuals.center.decorations

    // ours sub-range (line 2, still pending → conflict red) then theirs sub-range (line 3,
    // decided → resolved gray): top edge on the first, bottom edge on the last, none between.
    expect(centerBlockDecorations).toEqual([
      {
        startLine: 2,
        endLine: 2,
        className: 'merge-text-conflict merge-border-top-conflict',
        marginClassName: 'merge-vivid-conflict merge-border-top-conflict',
      },
      {
        startLine: 3,
        endLine: 3,
        className: 'merge-text-conflict merge-resolved merge-border-bottom-conflict merge-resolved',
        marginClassName: 'merge-vivid-conflict merge-resolved merge-border-bottom-conflict merge-resolved',
      },
    ])
  })

  it('handles resolved deletion (accepted): draws deletion marker in source pane and center pane', () => {
    const blocks = [
      block({
        blockId: 1,
        kind: 'ours-only',
        oursStartLine: 1,
        oursLineCount: 0,
        theirsStartLine: 1,
        theirsLineCount: 2,
        oursLines: [],
        theirsLines: ['legacy-cache', 'legacy-session'],
      }),
    ]
    // Accept deletion: ours (source) = true, theirs (mirror) = false
    let placements = computeInitialPlacements(blocks)
    placements = updatePlacementAfterToggle(placements, blocks, blocks[0], 'ours', true)
    placements = updatePlacementAfterToggle(placements, blocks, blocks[0], 'theirs', false)
    const visuals = computeMergeVisuals(blocks, placements)

    // Ours (the side that deleted) should get a resolved deletion marker
    expect(visuals.ours.decorations).toEqual([
      { startLine: 1, endLine: 1, className: 'merge-marker-top-deletion merge-resolved', marginClassName: 'merge-marker-top-deletion merge-resolved' }
    ])
    // Center (since deletion was accepted, centerCount is 0) should also get a resolved deletion marker
    expect(visuals.center.decorations).toEqual([
      { startLine: 1, endLine: 1, className: 'merge-marker-top-deletion merge-resolved', marginClassName: 'merge-marker-top-deletion merge-resolved' }
    ])
  })

  it('handles resolved deletion (ignored): draws deletion marker in source pane but not center pane', () => {
    const blocks = [
      block({
        blockId: 1,
        kind: 'ours-only',
        oursStartLine: 1,
        oursLineCount: 0,
        theirsStartLine: 1,
        theirsLineCount: 2,
        oursLines: [],
        theirsLines: ['legacy-cache', 'legacy-session'],
      }),
    ]
    // Ignore deletion (keep theirs): ours (source) = false, theirs (mirror) = true
    let placements = computeInitialPlacements(blocks)
    placements = updatePlacementAfterToggle(placements, blocks, blocks[0], 'ours', false)
    placements = updatePlacementAfterToggle(placements, blocks, blocks[0], 'theirs', true)
    const visuals = computeMergeVisuals(blocks, placements)

    // Ours still gets the resolved deletion marker
    expect(visuals.ours.decorations).toEqual([
      { startLine: 1, endLine: 1, className: 'merge-marker-top-deletion merge-resolved', marginClassName: 'merge-marker-top-deletion merge-resolved' }
    ])
    // Center does NOT get a marker because center has content (> 0 lines).
    // Instead it gets the resolved deletion decorations for the kept lines.
    expect(visuals.center.decorations).toEqual([
      {
        startLine: 1,
        endLine: 1,
        className: 'merge-text-deletion merge-resolved merge-border-top-deletion merge-resolved',
        marginClassName: 'merge-vivid-deletion merge-resolved merge-border-top-deletion merge-resolved',
      },
      {
        startLine: 2,
        endLine: 2,
        className: 'merge-text-deletion merge-resolved merge-border-bottom-deletion merge-resolved',
        marginClassName: 'merge-vivid-deletion merge-resolved merge-border-bottom-deletion merge-resolved',
      },
    ])
  })

  it('handles unresolved conflict: rejecting one side auto-includes the pending other side in the center', () => {
    const blocks = conflictBlocks()
    let placements = computeInitialPlacements(blocks)
    // Reject ours (ours = false), theirs is not touched (initially false) -> auto-includes theirs
    placements = updatePlacementAfterToggle(placements, blocks, blocks[1], 'ours', false)
    const visuals = computeMergeVisuals(blocks, placements)

    // Center has 1 line (theirs conflict line), and conflict is unresolved.
    // It should render no view zones, but show the theirs block in red (conflict) decoration.
    expect(visuals.center.viewZones).toEqual([])
    expect(visuals.center.decorations).toEqual([
      {
        startLine: 2,
        endLine: 2,
        className: 'merge-text-conflict',
        marginClassName: 'merge-vivid-conflict',
      },
    ])
  })

  it('handles resolved conflict with empty center (both sides rejected): draws resolved marker in center pane', () => {
    const blocks = conflictBlocks()
    let placements = computeInitialPlacements(blocks)
    // Reject both sides
    placements = updatePlacementAfterToggle(placements, blocks, blocks[1], 'ours', false)
    placements = updatePlacementAfterToggle(placements, blocks, blocks[1], 'theirs', false)
    const visuals = computeMergeVisuals(blocks, placements)

    // Center has 0 lines and is resolved.
    // Since it appends after the only remaining line (header, line 1), it renders as a bottom marker on line 1.
    expect(visuals.center.decorations).toEqual([
      {
        startLine: 1,
        endLine: 1,
        className: 'merge-marker-bottom-conflict merge-resolved',
        marginClassName: 'merge-marker-bottom-conflict merge-resolved',
      },
    ])
    expect(visuals.center.viewZones).toEqual([])
  })

  it('handles resolved conflict: when both sides are rejected and base has lines, center reverts to base lines with resolved conflict decorations', () => {
    const blocks = [
      block({
        blockId: 1,
        kind: 'both-different',
        oursStartLine: 1,
        oursLineCount: 1,
        theirsStartLine: 1,
        theirsLineCount: 1,
        oursLines: ['ours conflict'],
        theirsLines: ['theirs conflict'],
        baseLines: ['base content'],
      }),
    ]
    let placements = computeInitialPlacements(blocks)
    placements = updatePlacementAfterToggle(placements, blocks, blocks[0], 'ours', false)
    placements = updatePlacementAfterToggle(placements, blocks, blocks[0], 'theirs', false)
    const visuals = computeMergeVisuals(blocks, placements, true)

    // Center has 1 line (base content) and is resolved.
    // It should render no view zones, and render resolved conflict decorations for the base line.
    expect(visuals.center.viewZones).toEqual([])
    expect(visuals.center.decorations).toEqual([
      {
        startLine: 1,
        endLine: 1,
        className: 'merge-text-conflict merge-resolved merge-border-top-conflict merge-resolved merge-border-bottom-conflict merge-resolved',
        marginClassName: 'merge-vivid-conflict merge-resolved merge-border-top-conflict merge-resolved merge-border-bottom-conflict merge-resolved',
      },
    ])
  })
})
