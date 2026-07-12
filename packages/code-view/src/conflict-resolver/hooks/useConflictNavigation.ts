import { useCallback, useMemo, useState, type MutableRefObject } from 'react'
import type { MergeBlock } from '../../types'
import type { BlockPlacement } from '../../mergeBlockLayout'
import type { MergeEditorRefs } from './useMergeEditorRefs'

/** Tracks which change block the center pane is currently "on" (derived from its topmost
 * visible line) and drives the header's prev/next arrows: navigating reveals the target block's
 * center range and moves the cursor there, stopping at the first/last change block. */
export function useConflictNavigation(
  blocks: MergeBlock[],
  placementsRef: MutableRefObject<Map<number, BlockPlacement>>,
  editors: MergeEditorRefs
) {
  const [activeBlockIndex, setActiveBlockIndex] = useState<number>(0)

  const changeBlocks = useMemo(() => {
    return blocks.filter((b) => b.kind !== 'unchanged')
  }, [blocks])

  const updateActiveBlockIndex = useCallback(() => {
    const centerEditor = editors.centerEditorRef.current
    if (!centerEditor) return

    if (changeBlocks.length === 0) {
      setActiveBlockIndex(-1)
      return
    }

    const visibleRanges =
      typeof centerEditor.getVisibleRanges === 'function' ? centerEditor.getVisibleRanges() : []
    const currentLine = visibleRanges.length > 0 ? visibleRanges[0].startLineNumber : 1

    let foundIndex = -1
    for (let i = 0; i < changeBlocks.length; i++) {
      const p = placementsRef.current.get(changeBlocks[i].blockId)
      if (p) {
        if (p.centerStartLine >= currentLine) {
          foundIndex = i
          break
        }
        if (
          currentLine >= p.centerStartLine &&
          currentLine < p.centerStartLine + p.centerLineCount
        ) {
          foundIndex = i
          break
        }
      }
    }

    if (foundIndex === -1) {
      foundIndex = changeBlocks.length - 1
    }

    setActiveBlockIndex(foundIndex)
  }, [changeBlocks, editors, placementsRef])

  // Scroll and focus next/prev conflict
  const navigateConflict = useCallback(
    (direction: 'next' | 'prev') => {
      const centerEditor = editors.centerEditorRef.current
      if (!centerEditor || changeBlocks.length === 0) return

      let targetIndex = activeBlockIndex
      if (direction === 'next') {
        if (activeBlockIndex < changeBlocks.length - 1) {
          targetIndex = activeBlockIndex + 1
        } else {
          return // Boundary reached
        }
      } else {
        if (activeBlockIndex > 0) {
          targetIndex = activeBlockIndex - 1
        } else {
          return // Boundary reached
        }
      }

      const targetBlock = changeBlocks[targetIndex]
      if (targetBlock) {
        const p = placementsRef.current.get(targetBlock.blockId)
        if (p) {
          centerEditor.revealLineInCenter(p.centerStartLine)
          centerEditor.setPosition({ lineNumber: p.centerStartLine, column: 1 })
          centerEditor.focus()
          setActiveBlockIndex(targetIndex)
        }
      }
    },
    [activeBlockIndex, changeBlocks, editors, placementsRef]
  )

  return { activeBlockIndex, changeBlocks, updateActiveBlockIndex, navigateConflict }
}
