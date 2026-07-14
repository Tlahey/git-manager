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
 * scroll sync and connector code read them as "the right pane's range". The stretches of
 * identical content BETWEEN changes (and before the first / after the last) are synthesized as
 * `unchanged` blocks too — Monaco's `ILineChange[]` only reports the hunks themselves, but the
 * collapse-unchanged feature (and the "N changes" stat) both key off `kind === 'unchanged'`
 * blocks existing in the array, same as the 3-way backend-driven blocks already provide. */
export function buildDynamicMergeView(
  original: string,
  changes: editor.ILineChange[]
): InternalMergeView {
  const originalLines = original.split('\n')
  const originalTotalLines = originalLines.length

  const blocks: MergeBlock[] = []
  let originalCursor = 1
  let modifiedCursor = 1

  const pushUnchangedGap = (originalEnd: number, modifiedEnd: number) => {
    if (originalEnd < originalCursor) return
    blocks.push({
      blockId: blocks.length,
      kind: 'unchanged',
      oursStartLine: modifiedCursor,
      oursLineCount: modifiedEnd - modifiedCursor + 1,
      theirsStartLine: originalCursor,
      theirsLineCount: originalEnd - originalCursor + 1,
      oursLines: [],
      theirsLines: originalLines.slice(originalCursor - 1, originalEnd),
    })
  }

  for (const change of changes) {
    const rawOriginalStartLine = change.originalStartLineNumber
    const originalEndLine = change.originalEndLineNumber
    const rawModifiedStartLine = change.modifiedStartLineNumber
    const modifiedEndLine = change.modifiedEndLineNumber

    const originalCount =
      originalEndLine === 0 ? 0 : originalEndLine - rawOriginalStartLine + 1
    const modifiedCount =
      modifiedEndLine === 0 ? 0 : modifiedEndLine - rawModifiedStartLine + 1

    // Monaco's `ILineChange` anchors a zero-length (pure add/remove) side on the line BEFORE the
    // gap — "insert after this line" — but every other block source feeding into this shared
    // `MergeBlock` shape (the backend-derived 3-way blocks, and `computeMergeVisuals`/
    // `addPaneBlock`'s `afterLine = start - 1` math) anchors on the line AFTER it instead —
    // "insert before this line". Bump a zero-count side's start by one to match that convention,
    // otherwise the addition/deletion boundary marker (and the connector ribbon funneling to it)
    // renders one line too early — e.g. a deletion inside a block reads as happening right above
    // the block instead of inside it.
    const oursStartLine = modifiedCount === 0 ? rawModifiedStartLine + 1 : rawModifiedStartLine
    const theirsStartLine = originalCount === 0 ? rawOriginalStartLine + 1 : rawOriginalStartLine

    pushUnchangedGap(theirsStartLine - 1, oursStartLine - 1)

    const theirsLines = originalLines.slice(
      Math.max(0, rawOriginalStartLine - 1),
      originalEndLine
    )

    blocks.push({
      blockId: blocks.length,
      kind: 'theirs-only',
      oursStartLine, // carry modified start line for scroll sync
      oursLineCount: modifiedCount, // carry modified line count for scroll sync
      theirsStartLine,
      theirsLineCount: originalCount,
      oursLines: [],
      theirsLines,
      baseLines: theirsLines,
    })

    originalCursor = theirsStartLine + originalCount
    modifiedCursor = oursStartLine + modifiedCount
  }

  pushUnchangedGap(originalTotalLines, modifiedCursor + (originalTotalLines - originalCursor))

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
 * deletions. The `ours` slot stays empty — there is no third pane in this mode. `useVividText`
 * (highlightMode === 'lines') switches the whole-line fill to the louder `merge-vivid-*` classes,
 * same as `computeMergeVisuals` — the host only pairs it with the word-level intra-line pass
 * (`computeTwoWayIntraLineHighlights`) when highlightMode is 'words' instead. */
export function computeTwoWayVisuals(
  blocks: MergeBlock[],
  placements: Map<number, BlockPlacement>,
  showBlockBorders: boolean,
  useVividText = false
): TwoWayVisuals {
  const theirs: PaneVisualSpecs = { decorations: [], viewZones: [] }
  const center: PaneVisualSpecs = { decorations: [], viewZones: [] }
  const ours: PaneVisualSpecs = { decorations: [], viewZones: [] }

  const paneTotals = computePaneTotalLines(blocks, placements)

  blocks.forEach((block) => {
    const placement = placements.get(block.blockId)
    if (!placement) return
    // Unchanged gaps between hunks never get a colored fill — only real diff hunks do. Their
    // collapsed-banner rendering (when the collapse-unchanged toggle is on) is a connector-gap
    // concern, handled entirely by `buildTwoWaySegments`, not by pane decorations.
    if (block.kind === 'unchanged') return

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
      theirs.decorations.push(
        ...blockDecorationSpecs(
          originalStartLine,
          originalCount,
          kind,
          showBlockBorders,
          showBlockBorders,
          false,
          useVividText
        )
      )
    } else {
      // Pure addition (Left has 0 lines): render boundary marker line
      const afterLine = originalStartLine - 1
      const edge = markerEdge(afterLine, paneTotals.theirs)
      const className = `merge-marker-${edge}-${kind}`
      const line = Math.min(afterLine + 1, Math.max(1, paneTotals.theirs))
      theirs.decorations.push({
        startLine: line,
        endLine: line,
        className,
        marginClassName: className,
      })
    }

    // 2. Right (Center / Modified) pane visuals
    if (modifiedCount > 0) {
      center.decorations.push(
        ...blockDecorationSpecs(
          modifiedStartLine,
          modifiedCount,
          kind,
          showBlockBorders,
          showBlockBorders,
          false,
          useVividText
        )
      )
    } else {
      // Pure deletion (Right has 0 lines): render boundary marker line
      const afterLine = modifiedStartLine - 1
      const edge = markerEdge(afterLine, paneTotals.center)
      const className = `merge-marker-${edge}-${kind}`
      const line = Math.min(afterLine + 1, Math.max(1, paneTotals.center))
      center.decorations.push({
        startLine: line,
        endLine: line,
        className,
        marginClassName: className,
      })
    }
  })

  return { theirs, center, ours }
}
