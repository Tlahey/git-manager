import { getRebaseState, getBranches, pinObject } from '../../lib/tauri'
import { closeActivitySession, getActiveCorrelation } from '../../lib/activityCorrelation'
import { i18next, type TFunction } from '@git-manager/i18n'
import { useUndoHistoryStore } from '../../stores/undoHistory.store'
import { useNotchQueueStore } from '../../stores/notchQueue.store'
import { hookFailureFrom, hookFailureNotchModel } from '../../lib/notifications/hookNotch'
import { repoNameOf } from '../../lib/notifications/remoteNotch'
import type { UndoAction } from '../../lib/undoActions'

// ─── Undo/Redo helpers ──────────────────────────────────────────────────────
//
// Shared kernel reused by every git/*.api.ts domain file: undo/redo bookkeeping and the
// hook-failure notch card. Split out of the former monolithic git.api.ts (2026-08) precisely
// because these cut across all 9 domains below — extracting a domain file without this kernel
// would mean duplicating pushAction/clearRedo/settleRebase in each one.

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/**
 * Records an undoable action, tagged with the user gesture in scope.
 *
 * The tag is what lets one ⌘Z take back a gesture that performed several git operations — see
 * `ActionBase.correlationId`. Callers never pass it: it is read from the ambient activity
 * correlation, so any action already wrapped in `runActivity` groups for free.
 */
export function pushAction(repoPath: string, action: UndoAction) {
  const correlation = getActiveCorrelation()
  useUndoHistoryStore
    .getState()
    .push(repoPath, correlation ? { ...action, correlationId: correlation.id } : action)
}

export function clearRedo(repoPath: string) {
  useUndoHistoryStore.getState().clearRedo(repoPath)
}

// Pre-rebase HEAD captured by apiRunInteractiveRebase/apiRunAutosquash, keyed by repoPath —
// survives a conflict/edit pause (both git2's rebase-related flows and the shelled-out
// `git rebase -i --autosquash` land in the same .git/rebase-merge state) so
// apiRebaseContinue/apiRebaseSkip can still record the undo entry once the rebase they finish
// actually settles back to idle. Cleared by settleRebase or on abort.
export type PendingRebaseKind = 'interactiveRebase' | 'autosquash'
export const pendingRebasePreviousOid = new Map<
  string,
  { previousOid: string | null; kind: PendingRebaseKind }
>()

/**
 * Called after every step of a rebase, to do the two things that can only be decided once git is
 * asked whether the rebase is *over*: record the undo entry, and close the activity-log session.
 *
 * They are settled together because they turn on the same question and it costs one IPC call to
 * answer. `kind !== 'idle'` means the rebase paused rather than landed — a conflict resolves without
 * throwing (`err_unless_paused`), so the call returning successfully proves nothing on its own.
 *
 * Unlike before, the state is read even with no pending undo entry: a plain `rebase_onto_commit`
 * registers none, and its session still has to be closed or every later action in that repository
 * would be swallowed into the finished rebase's block.
 */
export async function settleRebase(path: string) {
  const rebaseState = await getRebaseState(path).catch(() => null)
  const stillRebasing = rebaseState ? rebaseState.kind !== 'idle' : false
  if (stillRebasing) return

  // Back to idle: the operation is over, so the journal's block for it ends here.
  closeActivitySession(path)

  const pending = pendingRebasePreviousOid.get(path)
  if (!pending) return

  pendingRebasePreviousOid.delete(path)
  const { previousOid, kind } = pending

  let newOid: string | null = null
  if (previousOid) {
    try {
      const branches = await getBranches(path, false)
      newOid = branches.find((b) => b.isHead)?.commitOid ?? null
    } catch {
      newOid = null
    }
  }

  if (previousOid && newOid && newOid !== previousOid) {
    const id = generateId()
    // The rebased HEAD isn't a descendant of the old tip, so both ends need their own pin to
    // survive GC.
    await Promise.all([
      pinObject(path, `${id}-previous`, previousOid).catch(() => {}),
      pinObject(path, `${id}-new`, newOid).catch(() => {}),
    ])
    pushAction(path, {
      id,
      timestamp: Date.now(),
      label: { key: kind === 'autosquash' ? 'undoRedo.autosquash' : 'undoRedo.interactiveRebase' },
      pinnedRefs: [`${id}-previous`, `${id}-new`],
      type: kind,
      previousOid,
      newOid,
    })
  } else {
    clearRedo(path)
  }
}

/**
 * Puts a failed hook on the notch, if that is what the error was.
 *
 * Reads the translator off the i18n instance rather than a hook, because this runs from the API
 * layer where there is no component in scope — the same reason `notificationRouting.ts` reaches
 * for stores imperatively. Best-effort throughout: the caller is already on its way to rethrowing,
 * and a card that fails to render must not replace the real error.
 */
export function raiseHookFailureCard(repoPath: string, error: unknown): void {
  try {
    const failure = hookFailureFrom(error)
    if (!failure) return
    const t = i18next.getFixedT(null, 'git') as unknown as TFunction
    useNotchQueueStore.getState().enqueue({
      model: hookFailureNotchModel(failure, repoNameOf(repoPath), t),
      importance: 'key',
    })
  } catch {
    // Nothing here is worth losing the commit error over.
  }
}

/**
 * Runs a push that has no transfer card of its own, putting a refused `pre-push` on the notch.
 *
 * The main Push button gets this for free: it goes through `trackTransfer`, whose failure card
 * already renders a hook's output rather than the error's own text. Dragging a ref onto another,
 * publishing a tag and deleting a remote tag do not go through it — their callers show
 * `String(error)`, which for a hook failure is the serialized `AppError` JSON, not the three lines
 * the hook actually printed. Until those paths get progress cards of their own, this is what keeps
 * a hook that refused them readable.
 *
 * The error is rethrown untouched: every caller here has its own dialog or toast to drive.
 */
export async function withHookFailureCard<T>(repoPath: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    raiseHookFailureCard(repoPath, error)
    throw error
  }
}
