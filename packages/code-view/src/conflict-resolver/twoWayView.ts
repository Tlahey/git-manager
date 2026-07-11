import type { editor } from 'monaco-editor'
import type { MergeBlock } from '../types'
import type { BlockPlacement } from '../mergeBlockLayout'
import {
  type DecorationSpec,
  type ViewZoneSpec,
  blockDecorationSpecs,
  computePaneTotalLines,
  markerEdge,
} from '../mergeDecorations'

/** The slice of the app-side ThreeWayMergeView the resolver actually consumes. */
export interface InternalMergeView {
  blocks: MergeBlock[]
  oursText: string
  theirsText: string
}

/** Translates Monaco's own live diff result (2-panel mode) into the resolver's `MergeBlock`
 * shape, so both modes flow through the same placement/decoration pipeline. Every change is
 * carried as a `theirs-only` block whose `ours*` fields hold the *modified* pane's geometry —
 * scroll sync and connector code read them as "the right pane's range". */
export function buildDynamicMergeView(original: string, changes: editor.ILineChange[]): InternalMergeView {
  const originalLines = original.split('\n')

  const blocks: MergeBlock[] = changes.map((change, index) => {
    const originalStartLine = change.originalStartLineNumber
    const originalEndLine = change.originalEndLineNumber
    const modifiedStartLine = change.modifiedStartLineNumber
    const modifiedEndLine = change.modifiedEndLineNumber

    const originalCount = originalEndLine === 0 ? 0 : originalEndLine - originalStartLine + 1
    const modifiedCount = modifiedEndLine === 0 ? 0 : modifiedEndLine - modifiedStartLine + 1

    const theirsLines = originalLines.slice(Math.max(0, originalStartLine - 1), originalEndLine)

    return {
      blockId: index,
      kind: 'theirs-only',
      oursStartLine: modifiedStartLine, // carry modified start line for scroll sync
      oursLineCount: modifiedCount,     // carry modified line count for scroll sync
      theirsStartLine: originalStartLine,
      theirsLineCount: originalCount,
      oursLines: [],
      theirsLines,
      baseLines: theirsLines,
    }
  })

  return {
    blocks,
    oursText: '',
    theirsText: original,
  }
}

export interface PaneVisualSpecs {
  decorations: DecorationSpec[]
  viewZones: ViewZoneSpec[]
}

export interface TwoWayVisuals {
  ours: PaneVisualSpecs
  center: PaneVisualSpecs
  theirs: PaneVisualSpecs
}

/** 2-panel counterpart of `computeMergeVisuals`: original (left/theirs) vs. modified
 * (right/center) block fills, plus the zero-height boundary markers for pure additions and
 * deletions. The `ours` slot stays empty — there is no third pane in this mode. */
export function computeTwoWayVisuals(
  blocks: MergeBlock[],
  placements: Map<number, BlockPlacement>,
  showBlockBorders: boolean
): TwoWayVisuals {
  const theirs: PaneVisualSpecs = { decorations: [], viewZones: [] }
  const center: PaneVisualSpecs = { decorations: [], viewZones: [] }
  const ours: PaneVisualSpecs = { decorations: [], viewZones: [] }

  const paneTotals = computePaneTotalLines(blocks, placements)

  blocks.forEach((block) => {
    const placement = placements.get(block.blockId)
    if (!placement) return

    const originalStartLine = block.theirsStartLine
    const originalCount = block.theirsLineCount
    const modifiedStartLine = placement.centerStartLine
    const modifiedCount = placement.centerLineCount

    let kind: 'addition' | 'deletion' | 'modification' = 'modification'
    if (originalCount === 0) {
      kind = 'addition'
    } else if (modifiedCount === 0) {
      kind = 'deletion'
    }

    // 1. Left (Theirs / Original) pane visuals
    if (originalCount > 0) {
      theirs.decorations.push(...blockDecorationSpecs(originalStartLine, originalCount, kind, showBlockBorders, showBlockBorders, false))
    } else {
      // Pure addition (Left has 0 lines): render boundary marker line
      const afterLine = originalStartLine - 1
      const edge = markerEdge(afterLine, paneTotals.theirs)
      const className = `merge-marker-${edge}-${kind}`
      const line = Math.min(afterLine + 1, Math.max(1, paneTotals.theirs))
      theirs.decorations.push({ startLine: line, endLine: line, className, marginClassName: className })
    }

    // 2. Right (Center / Modified) pane visuals
    if (modifiedCount > 0) {
      center.decorations.push(...blockDecorationSpecs(modifiedStartLine, modifiedCount, kind, showBlockBorders, showBlockBorders, false))
    } else {
      // Pure deletion (Right has 0 lines): render boundary marker line
      const afterLine = modifiedStartLine - 1
      const edge = markerEdge(afterLine, paneTotals.center)
      const className = `merge-marker-${edge}-${kind}`
      const line = Math.min(afterLine + 1, Math.max(1, paneTotals.center))
      center.decorations.push({ startLine: line, endLine: line, className, marginClassName: className })
    }
  })

  return { theirs, center, ours }
}
