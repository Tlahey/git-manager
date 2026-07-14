import { useCallback, type MutableRefObject } from 'react'
import type { editor, IRange } from 'monaco-editor'
import type { MergeBlock } from '../../types'
import {
  type BlockPlacement,
  type MergeSide,
  changeKindForBlock,
  centerLinesForBlock,
  computeInitialCenterText,
  computeInitialPlacements,
  placementOverridesAfterAutoMerge,
  recomputeAllPlacements,
  updatePlacementAfterToggle,
  updatePlacementBothFlags,
} from '../../mergeBlockLayout'
import { buildRangeEdit, checkTextChanges } from '../monacoInterop'
import { buildCenterTextFromPlacements } from '../centerText'
import type { MergeEditorRefs } from './useMergeEditorRefs'

interface UseMergeActionsParams {
  editors: MergeEditorRefs
  blocksRef: MutableRefObject<MergeBlock[]>
  placementsRef: MutableRefObject<Map<number, BlockPlacement>>
  updatePlacementsStateAndRef: (next: Map<number, BlockPlacement>) => void
  executeWithScrollPreservation: (action: () => void) => void
  recordEntry: (entry: {
    prePlacements: Map<number, BlockPlacement>
    postPlacements: Map<number, BlockPlacement>
    altIdBefore: number
    altIdAfter: number
    textChange: boolean
  }) => void
  applyTrackedEdit: (
    centerEditor: editor.IStandaloneCodeEditor,
    model: editor.ITextModel,
    source: string,
    edit: { range: IRange; text: string },
    opts?: { pushStack?: boolean }
  ) => void
  onAutoMerge?: () => Promise<string>
}

/** Every placement-changing user action: the connector-gap accept/ignore buttons, the header's
 * apply-non-conflicting / reset buttons, the wand (auto-merge), and the bulk accept-left/right
 * used by the imperative ref API. All of them run through one transaction shape — snapshot the
 * placements and the model's alternative-version id, apply the (possibly empty) text edit
 * through `applyTrackedEdit`, record the history entry, commit the new placements — so a single
 * Ctrl+Z always reverts one whole decision. */
export function useMergeActions({
  editors,
  blocksRef,
  placementsRef,
  updatePlacementsStateAndRef,
  executeWithScrollPreservation,
  recordEntry,
  applyTrackedEdit,
  onAutoMerge,
}: UseMergeActionsParams) {
  /** The shared transaction core. `computeEdit` decides both the next placements and the text
   * edit to apply (or `null` for "nothing to do — abort without touching history"). */
  const runTransaction = useCallback(
    (
      source: string,
      computeEdit: (
        centerEditor: editor.IStandaloneCodeEditor,
        model: editor.ITextModel
      ) => {
        nextPlacements: Map<number, BlockPlacement>
        edit: { range: IRange; text: string } | null
      } | null,
      { pushStack = true, focus = true }: { pushStack?: boolean; focus?: boolean } = {}
    ) => {
      executeWithScrollPreservation(() => {
        const centerEditor = editors.centerEditorRef.current
        const model = centerEditor?.getModel()
        if (!centerEditor || !model) return

        const altIdBefore = model.getAlternativeVersionId()
        const prePlacements = placementsRef.current

        const result = computeEdit(centerEditor, model)
        if (!result) return
        const { nextPlacements, edit } = result

        if (edit) {
          applyTrackedEdit(centerEditor, model, source, edit, { pushStack })
        }

        const altIdAfter = model.getAlternativeVersionId()

        recordEntry({
          prePlacements,
          postPlacements: nextPlacements,
          altIdBefore,
          altIdAfter,
          textChange: edit !== null,
        })
        updatePlacementsStateAndRef(nextPlacements)
        if (focus) centerEditor.focus()
      })
    },
    [
      editors,
      placementsRef,
      executeWithScrollPreservation,
      applyTrackedEdit,
      recordEntry,
      updatePlacementsStateAndRef,
    ]
  )

  /** Full-buffer replacement edit, or `null` when the buffer already holds `mergedText`. */
  const fullTextEdit = useCallback(
    (model: editor.ITextModel, mergedText: string): { range: IRange; text: string } | null => {
      if (model.getValue() === mergedText) return null
      return { range: model.getFullModelRange(), text: mergedText }
    },
    []
  )

  /** Independent per-side toggle for genuine conflicts — accepting ours doesn't exclude theirs,
   * so both can end up in the result together. */
  const handleToggle = useCallback(
    (block: MergeBlock, side: MergeSide, included: boolean) => {
      runTransaction('merge-gutter-action', (_centerEditor, model) => {
        const currentPlacement = placementsRef.current.get(block.blockId)
        if (!currentPlacement) return null

        const postPlacements = updatePlacementAfterToggle(
          placementsRef.current,
          blocksRef.current,
          block,
          side,
          included
        )
        const updatedPlacement = postPlacements.get(block.blockId)
        if (!updatedPlacement) return null

        const newLines = centerLinesForBlock(
          block,
          updatedPlacement.oursIncluded,
          updatedPlacement.theirsIncluded
        )
        const hasTextChange = checkTextChanges(
          model,
          currentPlacement.centerStartLine,
          currentPlacement.centerLineCount,
          newLines
        )
        const edit = buildRangeEdit(
          model,
          currentPlacement.centerStartLine,
          currentPlacement.centerLineCount,
          newLines
        )

        return { nextPlacements: postPlacements, edit: hasTextChange ? edit : null }
      })
    },
    [runTransaction, placementsRef, blocksRef]
  )

  // One-sided blocks resolve exclusively, WebStorm-style: their buttons only exist on the
  // side that authored the change (see `isChangeSource`), so accept means "the block becomes
  // exactly this side's content" and ignore means "restore the other side" — which mirrors
  // the untouched ancestor, i.e. puts the base text back. Without the restore, ignoring a
  // one-sided *modification* would just empty the block (its old independent-toggle
  // semantics), leaving no button anywhere to bring the original line back. Both flag flips
  // land in ONE placements update and ONE model edit, so a single Ctrl+Z reverts the whole
  // decision. Genuine conflicts keep the independent per-side toggles (handleToggle) — both
  // gaps are actionable and "keep both" stays possible.
  const applyOneSidedDecision = useCallback(
    (block: MergeBlock, source: MergeSide, apply: boolean) => {
      runTransaction('merge-gutter-action', (_centerEditor, model) => {
        const current = placementsRef.current.get(block.blockId)
        if (!current) return null

        const mirror: MergeSide = source === 'ours' ? 'theirs' : 'ours'
        let next = updatePlacementAfterToggle(
          placementsRef.current,
          blocksRef.current,
          block,
          source,
          apply
        )
        next = updatePlacementAfterToggle(next, blocksRef.current, block, mirror, !apply)
        const flags = next.get(block.blockId)
        if (!flags) return null

        const newLines = centerLinesForBlock(block, flags.oursIncluded, flags.theirsIncluded)
        const hasTextChange = checkTextChanges(
          model,
          current.centerStartLine,
          current.centerLineCount,
          newLines
        )
        const edit = buildRangeEdit(
          model,
          current.centerStartLine,
          current.centerLineCount,
          newLines
        )

        return { nextPlacements: next, edit: hasTextChange ? edit : null }
      })
    },
    [runTransaction, placementsRef, blocksRef]
  )

  // The connector-gap accept/ignore buttons (MergeConnectorOverlay) only know a block's id,
  // not the `MergeBlock` object itself.
  const handleActionById = useCallback(
    (blockId: number, side: MergeSide, included: boolean) => {
      const block = blocksRef.current.find((b) => b.blockId === blockId)
      if (!block) return
      if (block.kind === 'ours-only' || block.kind === 'theirs-only') {
        applyOneSidedDecision(block, side, included)
      } else {
        handleToggle(block, side, included)
      }
    },
    [blocksRef, handleToggle, applyOneSidedDecision]
  )

  // Apply non-conflicting changes (Left, Right, or both sides)
  const applyNonConflicting = useCallback(
    (side: 'left' | 'right' | 'all') => {
      runTransaction('merge-bulk-accept-non-conflicting', (_centerEditor, model) => {
        const prePlacements = placementsRef.current
        let nextPlacements = new Map(prePlacements)
        let changedAny = false

        for (const block of blocksRef.current) {
          const current = prePlacements.get(block.blockId)
          if (!current || current.oursTouched || current.theirsTouched) continue

          const isLeftChange = block.kind === 'theirs-only'
          const isRightChange = block.kind === 'ours-only'

          if (isLeftChange && (side === 'left' || side === 'all')) {
            const kind = changeKindForBlock(block)
            const theirsInc = kind !== 'deletion'
            nextPlacements = updatePlacementBothFlags(
              nextPlacements,
              blocksRef.current,
              block,
              false,
              theirsInc
            )
            changedAny = true
          } else if (isRightChange && (side === 'right' || side === 'all')) {
            const kind = changeKindForBlock(block)
            const oursInc = kind !== 'deletion'
            nextPlacements = updatePlacementBothFlags(
              nextPlacements,
              blocksRef.current,
              block,
              oursInc,
              false
            )
            changedAny = true
          }
        }

        if (!changedAny) return null

        const mergedText = buildCenterTextFromPlacements(blocksRef.current, nextPlacements)
        return { nextPlacements, edit: fullTextEdit(model, mergedText) }
      })
    },
    [runTransaction, placementsRef, blocksRef, fullTextEdit]
  )

  /** Bulk-resolve every block to one side — the imperative ref API's acceptLeft/acceptRight. */
  const acceptAllForSide = useCallback(
    (side: 'left' | 'right') => {
      runTransaction('merge-bulk-accept', (_centerEditor, model) => {
        let nextPlacements = new Map(placementsRef.current)
        for (const block of blocksRef.current) {
          nextPlacements =
            side === 'left'
              ? updatePlacementBothFlags(nextPlacements, blocksRef.current, block, false, true)
              : updatePlacementBothFlags(nextPlacements, blocksRef.current, block, true, false)
        }

        const mergedText = buildCenterTextFromPlacements(blocksRef.current, nextPlacements)
        return { nextPlacements, edit: fullTextEdit(model, mergedText) }
      })
    },
    [runTransaction, placementsRef, blocksRef, fullTextEdit]
  )

  // Reset merge state completely
  const handleResetMerge = useCallback(() => {
    runTransaction('merge-reset', (_centerEditor, model) => {
      const initialText = computeInitialCenterText(blocksRef.current)
      const initialPlacements = computeInitialPlacements(blocksRef.current)
      return { nextPlacements: initialPlacements, edit: fullTextEdit(model, initialText) }
    })
  }, [runTransaction, blocksRef, fullTextEdit])

  /** The magic wand: the host computes the merged text (e.g. `git merge-file`-style), we apply
   * it wholesale and settle every non-conflicting block's flags to match. No undo stop of its
   * own and no focus steal — historical behavior the tests pin down. */
  const applyAutoMerge = useCallback(async () => {
    if (!onAutoMerge) return
    const mergedText = await onAutoMerge()
    const centerEditor = editors.centerEditorRef.current
    const model = centerEditor?.getModel()
    if (!centerEditor || !model) return

    runTransaction(
      'merge-auto-merge',
      (_ce, m) => {
        const postPlacements = recomputeAllPlacements(
          blocksRef.current,
          placementOverridesAfterAutoMerge(blocksRef.current, placementsRef.current)
        )
        return { nextPlacements: postPlacements, edit: fullTextEdit(m, mergedText) }
      },
      { pushStack: false, focus: false }
    )
  }, [onAutoMerge, editors, runTransaction, blocksRef, placementsRef, fullTextEdit])

  return {
    handleActionById,
    applyNonConflicting,
    acceptAllForSide,
    handleResetMerge,
    applyAutoMerge,
  }
}
