import type { GitBranch } from '@git-manager/git-types'

/**
 * A branch's remote-qualified name without the remote prefix (`origin/main` → `main`) — both the
 * logical name two branches share, and the local branch a remote-tracking one is checked out as
 * (the name `git switch main` would create from it). Empty when there is nothing after the remote
 * prefix, which a caller creating a branch must treat as "not checkoutable" rather than naming one
 * after the remote itself.
 *
 * Splits on the FIRST slash only, like every other remote-name split in the app (the backend's own
 * `list_branches` derives `shortName` the same way, and `remoteBranchTarget` splits a `GitRef` the
 * same way): a remote whose name itself contains a slash is not supported anywhere, and guessing
 * differently here would only make this one path disagree with the rest.
 */
export function localBranchNameForRemote(remoteQualifiedName: string): string {
  return remoteQualifiedName.split('/').slice(1).join('/')
}

/** Every remote-tracking branch in the repo — the "Set upstream" picker's candidate list. */
export function remoteTrackingBranches(branches: GitBranch[]): GitBranch[] {
  return branches.filter((b) => b.isRemote)
}

/**
 * The upstream to set for `branchName` without asking, or `null` when the picker dialog should
 * decide instead.
 *
 * "Unambiguous" means exactly one remote-tracking branch anywhere in the repo shares the local
 * branch's logical name — `origin/<name>`, the overwhelmingly common case after a first push, but
 * also e.g. `upstream/<name>` on a fork with a single remote. Deliberately not "there is an
 * `origin` remote": a repo with two remotes that both happen to have a same-named branch is exactly
 * the ambiguity the picker exists for, so it returns `null` and lets the user choose rather than
 * guessing which one they meant.
 */
export function resolveDefaultUpstream(branchName: string, branches: GitBranch[]): string | null {
  const candidates = remoteTrackingBranches(branches).filter(
    (b) => localBranchNameForRemote(b.name) === branchName
  )
  return candidates.length === 1 ? candidates[0].name : null
}
