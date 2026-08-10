import type { GitRef } from '@git-manager/git-types'

/**
 * Pure helpers over a ref's name, shared by the menus rather than owned by one.
 *
 * They live apart because putting them in whichever menu happened to declare them first made
 * the branch, sidebar and commit modules import each other in a circle — three files that only
 * ever needed the same four one-liners.
 */

/** The repo's protected primary branch (local `main`/`master` or its remote counterpart). */
export const isMainBranchName = (shortName: string): boolean =>
  shortName === 'main' ||
  shortName === 'master' ||
  shortName.endsWith('/main') ||
  shortName.endsWith('/master')

/** A branch ref's short name without the remote prefix (`origin/x` → `x`). */
export const logicalBranchName = (ref: GitRef): string =>
  ref.type === 'remote' ? ref.shortName.split('/').slice(1).join('/') : ref.shortName

/**
 * A remote ref's `{ remote, branchName }`, split from its remote-qualified short name
 * (`origin/feature` → `{ remote: 'origin', branchName: 'feature' }`) — what the remote-branch
 * delete confirmation needs to name the push (`git push <remote> :refs/heads/<branchName>`) it is
 * about to run. Only meaningful for a `type: 'remote'` ref.
 */
export function remoteBranchTarget(ref: GitRef): { remote: string; branchName: string } {
  const [remote, ...rest] = ref.shortName.split('/')
  return { remote, branchName: rest.join('/') }
}

/**
 * The single logical branch a commit represents, or `null` when it has none or several. A local
 * branch and its remote-tracking counterpart (`main` + `origin/main`) share a logical name and so
 * count as ONE branch — that's what makes a *pushed* branch tip (two refs) still use the flat
 * single-branch layout instead of splitting into per-ref submenus. The local ref is preferred so
 * the flat menu exposes the local-branch actions (pull/push/rename/delete).
 */
export function soleLogicalBranch(branchLike: GitRef[]): GitRef | null {
  if (branchLike.length === 0) return null
  const names = new Set(branchLike.map(logicalBranchName))
  if (names.size !== 1) return null
  return branchLike.find((r) => r.type === 'branch') ?? branchLike[0]
}
