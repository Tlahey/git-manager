import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { apiUnpinObject, apiObjectsExist } from '../api/undoSupport.api'
import {
  executeUndo,
  executeRedo,
  collectActionOids,
  type UndoAction,
  type UndoLabel,
} from '../lib/undoActions'

export type { UndoAction, UndoLabel }

const MAX_HISTORY = 50

interface RepoHistory {
  stack: UndoAction[]
  pointer: number
}

interface UndoHistoryState {
  byRepo: Record<string, RepoHistory>
  push: (repoPath: string, action: UndoAction) => void
  undo: (repoPath: string) => Promise<void>
  redo: (repoPath: string) => Promise<void>
  clearRedo: (repoPath: string) => void
  canUndo: (repoPath: string) => boolean
  canRedo: (repoPath: string) => boolean
  peekUndoLabel: (repoPath: string) => UndoLabel | null
  peekRedoLabel: (repoPath: string) => UndoLabel | null
  /** Checks that the Git objects the stack references still exist (startup / reopening a repo)
   * and silently drops the entries that have become invalid. */
  validateAndPrune: (repoPath: string) => Promise<void>
}

/**
 * The entries belonging to the same user gesture as the one at `pointer - 1`, oldest first.
 *
 * One gesture can perform several git operations — "create a branch here" creates the ref and
 * checks it out — and `pushAction` stamps each with the gesture's correlation id. Undo takes the
 * whole run back at once, so a single ⌘Z matches a single thing the user did. Entries with no
 * correlation id (anything not wrapped in `runActivity`) stand alone, which keeps every existing
 * one-operation action behaving exactly as before — and is also why other multi-operation
 * gestures are still only half-undoable until they are wrapped too (issue #270).
 */
function groupEndingAt(stack: UndoAction[], pointer: number): UndoAction[] {
  const last = stack[pointer - 1]
  if (!last) return []
  if (!last.correlationId) return [last]
  let start = pointer - 1
  while (start > 0 && stack[start - 1]?.correlationId === last.correlationId) start--
  return stack.slice(start, pointer)
}

/** The mirror of {@link groupEndingAt} for redo: the gesture starting at `pointer`, oldest first. */
function groupStartingAt(stack: UndoAction[], pointer: number): UndoAction[] {
  const first = stack[pointer]
  if (!first) return []
  if (!first.correlationId) return [first]
  let end = pointer + 1
  while (end < stack.length && stack[end]?.correlationId === first.correlationId) end++
  return stack.slice(pointer, end)
}

function emptyHistory(): RepoHistory {
  return { stack: [], pointer: 0 }
}

/** Repairs a persisted history: drops any null/invalid entries (a corrupted snapshot could hold
 * `null` holes serialized from `undefined`) and re-aligns the pointer to the surviving entries. */
function sanitizeHistory(raw: unknown): RepoHistory {
  const h = (raw ?? {}) as Partial<RepoHistory>
  const rawStack = Array.isArray(h.stack) ? h.stack : []
  const rawPointer = Math.min(Math.max(typeof h.pointer === 'number' ? h.pointer : 0, 0), rawStack.length)
  const stack: UndoAction[] = []
  let pointer = 0
  rawStack.forEach((action, i) => {
    if (action && typeof action === 'object' && 'label' in action) {
      stack.push(action as UndoAction)
      if (i < rawPointer) pointer++
    }
  })
  return { stack, pointer }
}

function unpinEntries(repoPath: string, entries: UndoAction[]) {
  for (const entry of entries) {
    for (const refName of entry.pinnedRefs) {
      apiUnpinObject(repoPath, refName).catch(() => {})
    }
  }
}

export const useUndoHistoryStore = create<UndoHistoryState>()(
  persist(
    (set, get) => ({
      byRepo: {},

      push: (repoPath, action) =>
        set((state) => {
          const current = state.byRepo[repoPath] ?? emptyHistory()
          const droppedRedoTail = current.stack.slice(current.pointer)
          let stack = [...current.stack.slice(0, current.pointer), action]

          let evicted: UndoAction[] = []
          if (stack.length > MAX_HISTORY) {
            evicted = stack.slice(0, stack.length - MAX_HISTORY)
            stack = stack.slice(stack.length - MAX_HISTORY)
          }

          unpinEntries(repoPath, [...droppedRedoTail, ...evicted])

          return {
            byRepo: { ...state.byRepo, [repoPath]: { stack, pointer: stack.length } },
          }
        }),

      undo: async (repoPath) => {
        const history = get().byRepo[repoPath]
        if (!history || history.pointer <= 0) return
        const group = groupEndingAt(history.stack, history.pointer)
        if (group.length === 0) return
        // Newest operation first: a gesture's steps have to come apart in the reverse order they
        // were performed, or a step undoes into a state its predecessor has not left yet.
        for (let i = group.length - 1; i >= 0; i--) {
          await executeUndo(repoPath, group[i]!)
        }
        set((state) => {
          const h = state.byRepo[repoPath]
          if (!h) return state
          return {
            byRepo: { ...state.byRepo, [repoPath]: { ...h, pointer: h.pointer - group.length } },
          }
        })
      },

      redo: async (repoPath) => {
        const history = get().byRepo[repoPath]
        if (!history || history.pointer >= history.stack.length) return
        const group = groupStartingAt(history.stack, history.pointer)
        if (group.length === 0) return
        // Oldest first — the order they originally happened in.
        for (const action of group) {
          await executeRedo(repoPath, action)
        }
        set((state) => {
          const h = state.byRepo[repoPath]
          if (!h) return state
          return {
            byRepo: { ...state.byRepo, [repoPath]: { ...h, pointer: h.pointer + group.length } },
          }
        })
      },

      clearRedo: (repoPath) =>
        set((state) => {
          const current = state.byRepo[repoPath]
          if (!current || current.pointer >= current.stack.length) return state
          const dropped = current.stack.slice(current.pointer)
          unpinEntries(repoPath, dropped)
          return {
            byRepo: {
              ...state.byRepo,
              [repoPath]: {
                stack: current.stack.slice(0, current.pointer),
                pointer: current.pointer,
              },
            },
          }
        }),

      canUndo: (repoPath) => {
        const history = get().byRepo[repoPath]
        return !!history && history.pointer > 0
      },

      canRedo: (repoPath) => {
        const history = get().byRepo[repoPath]
        return !!history && history.pointer < history.stack.length
      },

      // Both peeks name the *gesture*, i.e. the oldest entry of the group about to be undone or
      // redone — "create branch", not the checkout that followed it. `?.` guards against a
      // corrupted/out-of-bounds entry so a bad persisted stack can't crash the toolbar on render
      // (see the sanitizing `merge` below).
      peekUndoLabel: (repoPath) => {
        const history = get().byRepo[repoPath]
        if (!history || history.pointer <= 0) return null
        return groupEndingAt(history.stack, history.pointer)[0]?.label ?? null
      },

      peekRedoLabel: (repoPath) => {
        const history = get().byRepo[repoPath]
        if (!history || history.pointer >= history.stack.length) return null
        return groupStartingAt(history.stack, history.pointer)[0]?.label ?? null
      },

      validateAndPrune: async (repoPath) => {
        const history = get().byRepo[repoPath]
        if (!history || history.stack.length === 0) return

        const allOids = Array.from(new Set(history.stack.flatMap((a) => collectActionOids(a))))
        if (allOids.length === 0) return

        let existsList: boolean[]
        try {
          existsList = await apiObjectsExist(repoPath, allOids)
        } catch {
          // Repo not found, or a transient IPC error: don't throw the history away on a doubt.
          return
        }
        const validOids = new Set(allOids.filter((_, i) => existsList[i]))

        const pointerBefore = history.pointer
        const keptIndices: number[] = []
        const dropped: UndoAction[] = []

        history.stack.forEach((action, i) => {
          const oids = collectActionOids(action)
          if (oids.every((oid) => validOids.has(oid))) {
            keptIndices.push(i)
          } else {
            dropped.push(action)
          }
        })

        if (dropped.length === 0) return

        unpinEntries(repoPath, dropped)

        set((state) => {
          const h = state.byRepo[repoPath]
          // `keptIndices` were computed from `history.stack` before the async check above. If the
          // stack was replaced in the meantime (a concurrent push/undo), those indices no longer
          // align — bail rather than map them onto a different array (which would leave `undefined`
          // holes that JSON persists as `null` and later crash `peekUndoLabel`).
          if (!h || h.stack !== history.stack) return state
          const newStack = keptIndices.map((i) => h.stack[i]).filter((a): a is UndoAction => !!a)
          const newPointer = keptIndices.filter((i) => i < pointerBefore).length
          return {
            byRepo: { ...state.byRepo, [repoPath]: { stack: newStack, pointer: newPointer } },
          }
        })
      },
    }),
    {
      name: 'git-manager-undo-history',
      // Sanitize the persisted snapshot on rehydration so a corrupted stack (null holes / a pointer
      // out of sync with the stack) can't crash the toolbar. Rebuilds each repo's history cleanly.
      merge: (persisted, current) => {
        const p = persisted as { byRepo?: Record<string, unknown> } | undefined
        const byRepo: Record<string, RepoHistory> = {}
        for (const [repoPath, raw] of Object.entries(p?.byRepo ?? {})) {
          byRepo[repoPath] = sanitizeHistory(raw)
        }
        return { ...current, byRepo }
      },
    }
  )
)
