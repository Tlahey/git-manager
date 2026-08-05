import type { UndoAction, UndoLabel } from './undoActions'
import { splitIntoGestures } from './undoGestures'

/** The `type` discriminant of a real action, plus a synthetic `base` for the pre-history state. */
export type TimelineStepType = UndoAction['type'] | 'base'

export interface TimelineStep {
  /** Position on the timeline: 0 = initial state, i = state after applying the i-th gesture. */
  index: number
  /** i18n label of the gesture that produced this state — `null` for the base (index 0). */
  label: UndoLabel | null
  type: TimelineStepType
  /** When the gesture ran (epoch ms, from `Date.now()`) — `null` for the base (index 0). */
  timestamp: number | null
  /**
   * HEAD commit OID at this step when it maps to one (commit/reset/fixup/…), else `null`.
   * Actions that don't move HEAD (discard, stash, branch/tag/remote CRUD) have no OID to preview.
   */
  headOid: string | null
}

export interface TimelineModel {
  steps: TimelineStep[]
  /** Index of the step matching the real undo pointer (where "actual" sits). */
  currentIndex: number
}

/** HEAD OID *after* an action was applied, or `null` if the action doesn't move HEAD. */
function headAfter(action: UndoAction): string | null {
  switch (action.type) {
    case 'commit':
    case 'fixup':
    case 'autosquash':
    case 'interactiveRebase':
    case 'revert':
      return action.newOid
    case 'reset':
      return action.targetOid
    default:
      return null
  }
}

/** HEAD OID *before* an action was applied, or `null` if the action doesn't move HEAD. */
function headBefore(action: UndoAction): string | null {
  switch (action.type) {
    case 'commit':
    case 'fixup':
    case 'autosquash':
    case 'interactiveRebase':
    case 'revert':
    case 'reset':
      return action.previousOid
    default:
      return null
  }
}

/**
 * Turns the raw undo `stack` + `pointer` into a navigable timeline: one step per *gesture* plus a
 * leading "base" step for the state before anything happened. Each step carries the label of the
 * gesture that led to it and, when it maps to a commit, the resulting HEAD OID (for read-only
 * preview). `currentIndex` is where "actual" sits.
 *
 * The unit is the gesture, not the stack entry, because the overlay walks to a picked step by
 * calling `undo`/`redo` once per step and the store moves a whole gesture per call — see
 * `lib/undoGestures.ts`. A gesture is named by its *first* entry ("create branch", not the checkout
 * that followed it), matching `peekUndoLabel`, and carries the last HEAD its operations produced.
 */
export function deriveTimeline(stack: UndoAction[], pointer: number): TimelineModel {
  const baseHeadOid = stack.length > 0 ? headBefore(stack[0]) : null
  const steps: TimelineStep[] = [
    { index: 0, label: null, type: 'base', headOid: baseHeadOid, timestamp: null },
  ]

  let lastHeadOid = baseHeadOid
  const gestures = splitIntoGestures(stack)
  gestures.forEach((gesture, i) => {
    const first = gesture[0]
    for (const action of gesture) {
      // Carry the previous known HEAD forward across HEAD-less actions so preview stays on the last
      // real commit instead of dropping to null (which would blank the graph mid-history).
      lastHeadOid = headAfter(action) ?? lastHeadOid
    }
    steps.push({
      index: i + 1,
      label: first.label,
      type: first.type,
      headOid: lastHeadOid,
      timestamp: first.timestamp,
    })
  })

  // The pointer counts entries; a step counts gestures. Walk the gestures until their entries add
  // up to the pointer — a pointer landing mid-gesture (a pruned persisted stack) rounds down to the
  // step whose state is actually reachable.
  let entriesSeen = 0
  let currentIndex = 0
  for (const gesture of gestures) {
    if (entriesSeen + gesture.length > Math.max(pointer, 0)) break
    entriesSeen += gesture.length
    currentIndex++
  }
  return { steps, currentIndex }
}
