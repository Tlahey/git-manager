import type { GitCommit, RebaseTodoAction, RebaseTodoStep } from '@git-manager/git-types'

/**
 * Pure state + transitions of the "Rebasing Commit" editor's todo list.
 * Steps are kept in rebase order (oldest first — the order `git rebase -i`
 * consumes); every mutation returns a new array. The window component owns the
 * state via `useState` and calls these helpers.
 */

export interface RebasePlanStep {
  commit: GitCommit
  action: RebaseTodoAction
  /** Replacement message (reword, or custom squash result message). */
  message?: string
}

/** Initial plan: every commit picked, oldest first. */
export function initPlan(commits: GitCommit[]): RebasePlanStep[] {
  return commits.map((commit) => ({ commit, action: 'pick' as const }))
}

/** Moves the step at `from` to position `to` (drag-reorder). */
export function moveStep(steps: RebasePlanStep[], from: number, to: number): RebasePlanStep[] {
  if (from === to || from < 0 || to < 0 || from >= steps.length || to >= steps.length) return steps
  const next = [...steps]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

/** Applies `action` to the given commits (drop / restore to pick). */
export function setAction(
  steps: RebasePlanStep[],
  oids: string[],
  action: RebaseTodoAction,
): RebasePlanStep[] {
  const targets = new Set(oids)
  return steps.map((s) =>
    targets.has(s.commit.oid) ? { ...s, action, message: action === 'pick' ? undefined : s.message } : s,
  )
}

/** Marks a commit for reword with its replacement message. */
export function rewordStep(steps: RebasePlanStep[], oid: string, message: string): RebasePlanStep[] {
  return steps.map((s) => (s.commit.oid === oid ? { ...s, action: 'reword', message } : s))
}

/**
 * Combines commits into `targetOid` (squash keeps messages, fixup discards):
 * the others are re-inserted directly below the target, in their current
 * relative order, with the combine action — the list mirrors what the rebase
 * will do, and the rail can draw them folding into the target.
 */
export function combineInto(
  steps: RebasePlanStep[],
  targetOid: string,
  otherOids: string[],
  mode: 'squash' | 'fixup',
): RebasePlanStep[] {
  const others = new Set(otherOids.filter((oid) => oid !== targetOid))
  if (others.size === 0) return steps
  const targetStep = steps.find((s) => s.commit.oid === targetOid)
  if (!targetStep) return steps

  const combined = steps.filter((s) => others.has(s.commit.oid)).map((s) => ({ ...s, action: mode }))
  const rest = steps.filter((s) => !others.has(s.commit.oid))
  const targetIndex = rest.findIndex((s) => s.commit.oid === targetOid)
  return [...rest.slice(0, targetIndex + 1), ...combined, ...rest.slice(targetIndex + 1)]
}

/**
 * Returns an i18n error key when the plan can't run: everything dropped, or a
 * squash/fixup with no picked commit before it (git rejects such todos).
 */
export function validatePlan(steps: RebasePlanStep[]): string | null {
  if (steps.every((s) => s.action === 'drop')) return 'rebaseEditor.errorAllDropped'
  let hasPickBefore = false
  for (const step of steps) {
    if (step.action === 'squash' || step.action === 'fixup') {
      if (!hasPickBefore) return 'rebaseEditor.errorLeadingSquash'
    } else if (step.action !== 'drop') {
      hasPickBefore = true
    }
  }
  return null
}

/** Serializes the plan into the DTO consumed by `run_interactive_rebase`. */
export function toTodoSteps(steps: RebasePlanStep[]): RebaseTodoStep[] {
  return steps.map((s) => ({
    action: s.action,
    oid: s.commit.oid,
    message: s.message?.trim() ? s.message.trim() : undefined,
  }))
}
