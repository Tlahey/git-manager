import type { GitBranch } from '@git-manager/git-types'

/** A branch's remote-qualified name without the remote prefix (`origin/main` → `main`). */
function logicalName(remoteQualifiedName: string): string {
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
    (b) => logicalName(b.name) === branchName
  )
  return candidates.length === 1 ? candidates[0].name : null
}
