import type { Board } from '@git-manager/git-types'

/**
 * Whether a board is one iteration of a repeating cycle — a sprint — as opposed to a standing board.
 *
 * The distinction is what gates closing: a close freezes a report, carries the leftovers into a
 * successor and turns the board read-only, which only describes a period that ended. A backlog a
 * ticket sits in *before* it reaches a sprint has no such period, and offering to close it offers to
 * end something that does not end.
 *
 * **Absent means yes.** Both backends can hand back a board written before the field existed — the
 * local one from a commit in its ref, the remote one from `.git-manager/board.json` in the working
 * tree — and every one of those was created when closing was the only behaviour there was. Reading
 * them as standing boards would quietly remove an action they have always had. The default lives here
 * rather than at each call site so the two backends cannot drift on it.
 */
export function isIterationBoard(board: Pick<Board, 'iteration'>): boolean {
  return board.iteration ?? true
}

/**
 * The name a *first* iteration takes, given what the user typed.
 *
 * "Sprint" becomes "Sprint 1", so the sprint after it can be "Sprint 2" — see `nextSprintName`, which
 * bumps a trailing number and is what the close dialog proposes. A name that already ends in a number
 * is left exactly as typed: someone who wrote "Sprint 4" is continuing a count that started before
 * this app, and renaming it to "Sprint 4 1" would be absurd.
 *
 * Applies only to iterations. A standing board is not the first of anything, so "Backlog" stays
 * "Backlog".
 */
export function firstIterationName(name: string, iteration: boolean): string {
  const trimmed = name.trim()
  if (!iteration || /\d\s*$/.test(trimmed)) return trimmed
  return `${trimmed} 1`
}
