/**
 * Picks the branch an "explain branch changes" range should be taken against.
 *
 * The explanation is only as good as its base: diffed against the wrong branch it describes
 * unrelated work, and against no branch at all it cannot run. The repo's configured merge targets
 * (Settings → `targetBranches`, most specific first) are the authority, because that is already the
 * repo's answer to "where does work here land"; the conventional main/master refs are appended as a
 * last resort so a repo that has never been configured still works.
 *
 * Deliberately local: unlike the PR composer's base, which asks GitHub for the repository's default
 * branch, this resolves entirely from refs the clone already has — the feature has to work offline,
 * on a repo with no remote, and without a GitHub token.
 *
 * Returns `null` when no candidate exists, which the caller surfaces rather than guessing.
 *
 * ⚠️ `existingBranchNames` must be **remote-qualified** (`origin/main`, not `main`) — i.e.
 * `GitBranch.name`, not `GitBranch.shortName`. The two differ only for remote branches, where
 * `shortName` has the remote prefix stripped (see `services/git_branch.rs`), and passing those made
 * every `origin/*` candidate unmatchable: on `main` that left nothing but the branch itself and the
 * whole feature reported "no base branch found".
 */
export function resolveExplanationBase(
  branch: string,
  targetBranches: string[],
  existingBranchNames: string[]
): string | null {
  const existing = new Set(existingBranchNames)
  const candidates = [...targetBranches, 'origin/main', 'origin/master', 'main', 'master']

  return (
    candidates.find(
      // A branch is never its own base: `main` vs `main` is an empty range, and `main` vs
      // `origin/main` is the branch's own unpushed commits — which is a legitimate thing to
      // explain, so only the exact same ref is rejected.
      (candidate) => candidate !== branch && existing.has(candidate)
    ) ?? null
  )
}
