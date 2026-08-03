import type { UndoAction } from './undoActions'

/**
 * The one place that decides where a *gesture* starts and ends in an undo stack.
 *
 * A gesture is what the user did; an entry is one git operation. They are not the same thing —
 * "create a branch here" creates the ref *and* checks it out — and `pushAction` stamps every entry
 * of one gesture with the activity log's correlation id (`lib/activityCorrelation.ts`). The rule
 * here is the whole definition: **consecutive entries sharing a correlation id are one gesture; an
 * entry without one stands alone.**
 *
 * It lives in its own module because two consumers must agree on it and would break in opposite,
 * silent ways if they drifted apart:
 *
 * - `stores/undoHistory.store.ts` moves its pointer by whole gestures.
 * - `lib/timelineModel.ts` draws one step per gesture, and the timeline overlay walks to a step by
 *   calling `undo()`/`redo()` once per step. A timeline that still counted raw entries would ask
 *   for two undos where the store performs one gesture each time, and sail straight past the step
 *   the user picked.
 */
function sameGesture(a: UndoAction, b: UndoAction): boolean {
  return !!a.correlationId && a.correlationId === b.correlationId
}

/** Every gesture in the stack, in order, each holding its entries oldest first. */
export function splitIntoGestures(stack: UndoAction[]): UndoAction[][] {
  const gestures: UndoAction[][] = []
  for (const action of stack) {
    const current = gestures[gestures.length - 1]
    const head = current?.[0]
    if (current && head && sameGesture(head, action)) current.push(action)
    else gestures.push([action])
  }
  return gestures
}

/**
 * The gesture ending at `pointer` — what ⌘Z takes back — oldest entry first, or `[]` at the
 * bottom of the stack.
 *
 * Scanning backwards from the pointer rather than indexing into {@link splitIntoGestures} is
 * deliberate: it still returns a sane group if the pointer ever lands mid-gesture (a pruned or
 * hand-edited persisted stack), where a boundary lookup would find nothing and undo would go dead.
 */
export function gestureEndingAt(stack: UndoAction[], pointer: number): UndoAction[] {
  const last = stack[pointer - 1]
  if (!last) return []
  let start = pointer - 1
  while (start > 0 && stack[start - 1] && sameGesture(last, stack[start - 1]!)) start--
  return stack.slice(start, pointer)
}

/** The mirror of {@link gestureEndingAt} for redo: the gesture starting at `pointer`. */
export function gestureStartingAt(stack: UndoAction[], pointer: number): UndoAction[] {
  const first = stack[pointer]
  if (!first) return []
  let end = pointer + 1
  while (end < stack.length && stack[end] && sameGesture(first, stack[end]!)) end++
  return stack.slice(pointer, end)
}
