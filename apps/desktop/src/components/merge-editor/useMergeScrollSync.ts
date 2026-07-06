import { useCallback, useRef, type MutableRefObject } from 'react'
import type { editor } from 'monaco-editor'
import type { MergeBlock } from '@git-manager/git-types'
import type { BlockPlacement } from './mergeBlockLayout'
import type { Monaco } from '@monaco-editor/react'

type Editor = editor.IStandaloneCodeEditor
export type PaneIndex = 0 | 1 | 2

interface AlignedCoordinates {
  theirsLine: number
  theirsFrozen: boolean
  centerLine: number
  centerFrozen: boolean
  oursLine: number
  oursFrozen: boolean
}

function getVirtualOffset(
  block: MergeBlock,
  placement: BlockPlacement,
  offset: number,
  masterPane: PaneIndex
): number {
  if (block.kind === 'unchanged' || block.kind === 'both-same') {
    return offset
  }
  if (masterPane === 1) { // Center
    return offset
  }
  if (masterPane === 0) { // Theirs
    if (placement.theirsIncluded) {
      return (placement.oursIncluded ? block.oursLineCount : 0) + offset
    }
    return offset
  }
  if (masterPane === 2) { // Ours
    return offset
  }
  return offset
}

function getCoordinatesForBlockOffset(
  block: MergeBlock,
  placement: BlockPlacement,
  offset: number
): AlignedCoordinates {
  const oursCount = block.oursLineCount
  const theirsCount = block.theirsLineCount
  const centerCount = placement.centerLineCount

  if (block.kind === 'unchanged' || block.kind === 'both-same') {
    return {
      theirsLine: block.theirsStartLine + offset,
      theirsFrozen: false,
      oursLine: block.oursStartLine + offset,
      oursFrozen: false,
      centerLine: placement.centerStartLine + offset,
      centerFrozen: false,
    }
  }

  if (placement.oursIncluded && placement.theirsIncluded) {
    if (offset < oursCount) {
      return {
        theirsLine: block.theirsStartLine,
        theirsFrozen: true,
        oursLine: block.oursStartLine + offset,
        oursFrozen: false,
        centerLine: placement.centerStartLine + offset,
        centerFrozen: false,
      }
    } else {
      return {
        theirsLine: block.theirsStartLine + (offset - oursCount),
        theirsFrozen: false,
        oursLine: block.oursStartLine + oursCount,
        oursFrozen: true,
        centerLine: placement.centerStartLine + offset,
        centerFrozen: false,
      }
    }
  } else if (placement.oursIncluded) {
    return {
      theirsLine: block.theirsStartLine,
      theirsFrozen: true,
      oursLine: block.oursStartLine + Math.min(offset, oursCount),
      oursFrozen: offset >= oursCount,
      centerLine: placement.centerStartLine + Math.min(offset, centerCount),
      centerFrozen: offset >= centerCount,
    }
  } else if (placement.theirsIncluded) {
    return {
      theirsLine: block.theirsStartLine + Math.min(offset, theirsCount),
      theirsFrozen: offset >= theirsCount,
      oursLine: block.oursStartLine,
      oursFrozen: true,
      centerLine: placement.centerStartLine + Math.min(offset, centerCount),
      centerFrozen: offset >= centerCount,
    }
  } else {
    return {
      theirsLine: block.theirsStartLine,
      theirsFrozen: true,
      oursLine: block.oursStartLine,
      oursFrozen: true,
      centerLine: placement.centerStartLine,
      centerFrozen: true,
    }
  }
}

export function getAlignedCoordinatesForPaneLine(
  line: number,
  sourcePane: PaneIndex,
  blocks: MergeBlock[],
  placements: Map<number, BlockPlacement>
): AlignedCoordinates {
  let foundBlock: MergeBlock | null = null
  let offset = 0

  for (const block of blocks) {
    const start =
      sourcePane === 0
        ? block.theirsStartLine
        : sourcePane === 1
        ? placements.get(block.blockId)?.centerStartLine
        : block.oursStartLine

    const count =
      sourcePane === 0
        ? block.theirsLineCount
        : sourcePane === 1
        ? placements.get(block.blockId)?.centerLineCount
        : block.oursLineCount

    if (
      start !== undefined &&
      count !== undefined &&
      count > 0 &&
      line >= start &&
      line < start + count
    ) {
      foundBlock = block
      offset = line - start
      break
    }
  }

  if (foundBlock) {
    const placement = placements.get(foundBlock.blockId)
    if (placement) {
      const virtualOffset = getVirtualOffset(foundBlock, placement, offset, sourcePane)
      return getCoordinatesForBlockOffset(foundBlock, placement, virtualOffset)
    }
  }

  // Fallback: past the end or not inside any block with lineCount > 0
  if (blocks.length > 0) {
    const lastBlock = blocks[blocks.length - 1]
    const lastPlacement = placements.get(lastBlock.blockId)
    if (lastPlacement) {
      const sourceStart =
        sourcePane === 0
          ? lastBlock.theirsStartLine
          : sourcePane === 1
          ? lastPlacement.centerStartLine
          : lastBlock.oursStartLine
      const sourceCount =
        sourcePane === 0
          ? lastBlock.theirsLineCount
          : sourcePane === 1
          ? lastPlacement.centerLineCount
          : lastBlock.oursLineCount
      const sourceTotal = sourceStart + sourceCount

      const delta = line - sourceTotal
      return {
        theirsLine: lastBlock.theirsStartLine + lastBlock.theirsLineCount + delta,
        theirsFrozen: false,
        centerLine: lastPlacement.centerStartLine + lastPlacement.centerLineCount + delta,
        centerFrozen: false,
        oursLine: lastBlock.oursStartLine + lastBlock.oursLineCount + delta,
        oursFrozen: false,
      }
    }
  }

  return {
    theirsLine: line,
    theirsFrozen: false,
    centerLine: line,
    centerFrozen: false,
    oursLine: line,
    oursFrozen: false,
  }
}

/** Pixel-offset (not line-based) scroll sync across the 3 panes — panes have different total
 * lengths (center shrinks/grows as blocks resolve), so line-for-line sync would fight the fact
 * that a block's start line differs per pane. The `syncingRef` guard prevents the classic
 * reentrant feedback loop (A scrolls B, which fires B's own scroll listener, which tries to
 * scroll A and C again) but is cleared synchronously right after the propagation loop below,
 * not deferred to the next animation frame: Monaco's `setScrollTop` fires `onDidScrollChange`
 * synchronously (`Scrollable._setState` in monaco-editor's `scrollable.js` calls `_onScroll.fire`
 * directly, no micro/macrotask involved), so the reentrant echo is already fully resolved by the
 * time the loop returns — there's nothing async left to guard against. Deferring the reset to
 * `requestAnimationFrame` (as this used to) left the guard up for up to a whole frame, which
 * silently swallowed any *further* genuine scroll events from the pane actually being scrolled
 * during fast/inertial trackpad scrolling (wheel events can fire faster than rAF) — the other two
 * panes, and the connector overlay that reads their live `getScrollTop()`, would then visibly lag
 * until scrolling slowed down enough for an event to land after the guard finally cleared. */
export function useMergeScrollSync(
  blocksRef: MutableRefObject<MergeBlock[]>,
  placementsRef: MutableRefObject<Map<number, BlockPlacement>>,
  monacoRef: MutableRefObject<Monaco | null>
) {
  const editorsRef = useRef<(Editor | null)[]>([null, null, null])
  const syncingRef = useRef(false)

  const attach = useCallback((editorInstance: Editor, index: PaneIndex) => {
    editorsRef.current[index] = editorInstance
    editorInstance.onDidScrollChange((e) => {
      if (syncingRef.current) return

      if (e.scrollLeftChanged) {
        syncingRef.current = true
        try {
          editorsRef.current.forEach((other, i) => {
            if (i === index || !other) return
            other.setScrollLeft(e.scrollLeft)
          })
        } finally {
          syncingRef.current = false
        }
      }

      if (e.scrollTopChanged) {
        syncingRef.current = true
        try {
          const monaco = monacoRef.current
          const lineHeight = monaco ? editorInstance.getOption(monaco.editor.EditorOption.lineHeight) : 19

          const masterScrollTop = e.scrollTop
          const currentLine = Math.floor(masterScrollTop / lineHeight) + 1
          const remainderPx = masterScrollTop % lineHeight

          const coords = getAlignedCoordinatesForPaneLine(
            currentLine,
            index,
            blocksRef.current,
            placementsRef.current
          )

          editorsRef.current.forEach((other, i) => {
            if (i === index || !other) return

            let targetLine = 1
            let frozen = false

            if (i === 0) {
              targetLine = coords.theirsLine
              frozen = coords.theirsFrozen
            } else if (i === 1) {
              targetLine = coords.centerLine
              frozen = coords.centerFrozen
            } else if (i === 2) {
              targetLine = coords.oursLine
              frozen = coords.oursFrozen
            }

            const targetRemainder = frozen ? 0 : remainderPx
            const targetScrollTop = (targetLine - 1) * lineHeight + targetRemainder

            other.setScrollTop(targetScrollTop)
          })
        } finally {
          syncingRef.current = false
        }
      }
    })
  }, [blocksRef, placementsRef, monacoRef])

  return { attach, editorsRef }
}
