/** Whether `currentBranch` is one of `protectedBranches` — the single source of truth for the
 * "is the current branch protected" guard behind destructive-action confirmations. Accepts
 * `null`/`undefined`/`''` uniformly so an unknown branch is never mistaken for an unprotected one. */
export function isProtectedBranch(
  currentBranch: string | null | undefined,
  protectedBranches: string[]
): boolean {
  return !!currentBranch && protectedBranches.includes(currentBranch)
}
