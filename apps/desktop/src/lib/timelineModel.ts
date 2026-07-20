import type { UndoAction, UndoLabel } from './undoActions'

/** The `type` discriminant of a real action, plus a synthetic `base` for the pre-history state. */
export type TimelineStepType = UndoAction['type'] | 'base'

export interface TimelineStep {
  /** Position on the timeline: 0 = initial state, i = state after applying `stack[i - 1]`. */
  index: number
  /** i18n label of the action that produced this state — `null` for the base (index 0). */
  label: UndoLabel | null
  type: TimelineStepType
  /** When the action ran (epoch ms, from `Date.now()`) — `null` for the base (index 0). */
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
 * Turns the raw undo `stack` + `pointer` into a navigable timeline: `stack.length + 1` steps, the
 * first being the initial ("base") state before any action. Each step carries the label of the
 * action that led to it and, when it maps to a commit, the resulting HEAD OID (for read-only
 * preview). `currentIndex` mirrors the pointer so the UI can mark where "actual" is.
 */
export function deriveTimeline(stack: UndoAction[], pointer: number): TimelineModel {
  const baseHeadOid = stack.length > 0 ? headBefore(stack[0]) : null
  const steps: TimelineStep[] = [
    { index: 0, label: null, type: 'base', headOid: baseHeadOid, timestamp: null },
  ]

  let lastHeadOid = baseHeadOid
  stack.forEach((action, i) => {
    const after = headAfter(action)
    // Carry the previous known HEAD forward across HEAD-less actions so preview stays on the last
    // real commit instead of dropping to null (which would blank the graph mid-history).
    lastHeadOid = after ?? lastHeadOid
    steps.push({
      index: i + 1,
      label: action.label,
      type: action.type,
      headOid: lastHeadOid,
      timestamp: action.timestamp,
    })
  })

  const currentIndex = Math.min(Math.max(pointer, 0), steps.length - 1)
  return { steps, currentIndex }
}
