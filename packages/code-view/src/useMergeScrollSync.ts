import { useCallback, useRef, type MutableRefObject } from 'react'
import type { editor } from 'monaco-editor'
import type { MergeBlock } from './types'
import type { BlockPlacement } from './mergeBlockLayout'
import type { Monaco } from '@monaco-editor/react'

type Editor = editor.IStandaloneCodeEditor
export type PaneIndex = 0 | 1 | 2

function getPaneLineRange(
  block: MergeBlock,
  placement: BlockPlacement | undefined,
  paneIndex: PaneIndex
): { startLine: number; lineCount: number } {
  if (paneIndex === 0) {
    return { startLine: block.theirsStartLine, lineCount: block.theirsLineCount }
  } else if (paneIndex === 1) {
    return {
      startLine: placement?.centerStartLine ?? 1,
      lineCount: placement?.centerLineCount ?? 0,
    }
  } else {
    return { startLine: block.oursStartLine, lineCount: block.oursLineCount }
  }
}

function getPaneYCoords(
  editor: Editor,
  startLine: number,
  lineCount: number
): { yStart: number; yEnd: number } {
  const model = editor.getModel()
  const totalLines = model ? model.getLineCount() : 1

  const safeStart = Math.max(1, Math.min(startLine, totalLines + 1))
  const yStart = editor.getTopForLineNumber(safeStart)

  if (lineCount === 0) {
    return { yStart, yEnd: yStart }
  }

  const safeEnd = Math.max(1, Math.min(startLine + lineCount, totalLines + 1))
  const yEnd = editor.getTopForLineNumber(safeEnd)

  return { yStart, yEnd }
}

function findActiveBlock(
  editor: Editor,
  blocks: MergeBlock[],
  placements: Map<number, BlockPlacement>,
  paneIndex: PaneIndex,
  scrollTop: number
): { block: MergeBlock; yStart: number; yEnd: number; index: number } | null {
  if (blocks.length === 0) return null

  const mapped = blocks.map((block, index) => {
    const placement = placements.get(block.blockId)
    const { startLine, lineCount } = getPaneLineRange(block, placement, paneIndex)
    const { yStart, yEnd } = getPaneYCoords(editor, startLine, lineCount)
    return { block, yStart, yEnd, index }
  })

  // Find the first block containing the scrollTop (where height > 0)
  for (const item of mapped) {
    if (item.yStart < item.yEnd && scrollTop >= item.yStart && scrollTop < item.yEnd) {
      return item
    }
  }

  // If scrollTop is at or before the first block
  if (scrollTop <= mapped[0].yStart) {
    return mapped[0]
  }

  // If scrollTop is at or after the last block
  const lastItem = mapped[mapped.length - 1]
  if (scrollTop >= lastItem.yEnd) {
    return lastItem
  }

  // If scrollTop is exactly at a boundary between blocks
  for (const item of mapped) {
    if (scrollTop <= item.yStart) {
      return item
    }
  }

  return lastItem
}

export function getScrollCoordinatesForContent(
  masterEditor: Editor,
  slaveEditor: Editor,
  masterScrollTop: number,
  blocks: MergeBlock[],
  placements: Map<number, BlockPlacement>,
  masterIndex: PaneIndex,
  slaveIndex: PaneIndex
): number {
  if (blocks.length === 0) return masterScrollTop

  const active = findActiveBlock(masterEditor, blocks, placements, masterIndex, masterScrollTop)
  if (!active) return masterScrollTop

  const block = active.block
  const placement = placements.get(block.blockId)

  const masterRange = getPaneLineRange(block, placement, masterIndex)
  const slaveRange = getPaneLineRange(block, placement, slaveIndex)

  const masterCoords = getPaneYCoords(masterEditor, masterRange.startLine, masterRange.lineCount)
  const slaveCoords = getPaneYCoords(slaveEditor, slaveRange.startLine, slaveRange.lineCount)

  const masterHeight = masterCoords.yEnd - masterCoords.yStart
  const slaveHeight = slaveCoords.yEnd - slaveCoords.yStart

  // Extrapolate past the end of the document if we are at the last block
  if (active.index === blocks.length - 1 && masterScrollTop >= masterCoords.yEnd) {
    const deltaPx = masterScrollTop - masterCoords.yEnd
    return slaveCoords.yEnd + deltaPx
  }

  // Extrapolate/clamp before the document if we are at the first block
  if (active.index === 0 && masterScrollTop <= masterCoords.yStart) {
    return Math.max(0, slaveCoords.yStart + (masterScrollTop - masterCoords.yStart))
  }

  if (masterHeight === 0) {
    return slaveCoords.yStart
  }

  const fraction = Math.max(0, Math.min(1, (masterScrollTop - masterCoords.yStart) / masterHeight))
  return slaveCoords.yStart + fraction * slaveHeight
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
  _monacoRef: MutableRefObject<Monaco | null>,
  ignoreScrollSyncRef?: MutableRefObject<boolean>
) {
  const editorsRef = useRef<(Editor | null)[]>([null, null, null])
  const isSyncingScroll = useRef(false)

  const attach = useCallback((editorInstance: Editor, index: PaneIndex) => {
    editorsRef.current[index] = editorInstance
    editorInstance.onDidScrollChange((e) => {
      if (isSyncingScroll.current || ignoreScrollSyncRef?.current) return

      if (e.scrollLeftChanged) {
        isSyncingScroll.current = true
        try {
          editorsRef.current.forEach((other, i) => {
            if (i === index || !other) return
            other.setScrollLeft(e.scrollLeft)
          })
        } finally {
          isSyncingScroll.current = false
        }
      }

      if (e.scrollTopChanged) {
        isSyncingScroll.current = true
        try {
          const masterScrollTop = e.scrollTop

          editorsRef.current.forEach((other, i) => {
            if (i === index || !other) return

            const targetScrollTop = getScrollCoordinatesForContent(
              editorInstance,
              other,
              masterScrollTop,
              blocksRef.current,
              placementsRef.current,
              index,
              i as PaneIndex
            )

            other.setScrollTop(targetScrollTop)
          })
        } finally {
          isSyncingScroll.current = false
        }
      }
    })
  }, [blocksRef, placementsRef, ignoreScrollSyncRef])

  return { attach, editorsRef }
}
