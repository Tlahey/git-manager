import type { GitBranch } from '@git-manager/git-types'

/** A folder level in a remote's branch tree — one path segment, holding whatever is below it. */
export interface RemoteTreeFolder {
  kind: 'folder'
  /** The segment itself, e.g. `build` — what the row displays. */
  name: string
  /**
   * Every branch below this folder, at any depth, by remote-qualified name (`origin/build/ci`) —
   * what its visibility toggle acts on. Qualified because that is how the graph names a remote
   * ref, and because two remotes can carry the same branch.
   */
  branchNames: string[]
  children: RemoteTreeNode[]
}

export interface RemoteTreeBranch {
  kind: 'branch'
  branch: GitBranch
  /** Name with every folder above it stripped: `origin/build/ci/lint` → `lint`. */
  displayName: string
}

export type RemoteTreeNode = RemoteTreeFolder | RemoteTreeBranch

interface Entry {
  branch: GitBranch
  /** What is left of the name once the folders already walked are stripped. */
  path: string
}

function build(entries: Entry[]): RemoteTreeNode[] {
  const loose: RemoteTreeBranch[] = []
  const folders = new Map<string, Entry[]>()

  for (const entry of entries) {
    const slash = entry.path.indexOf('/')
    if (slash <= 0) {
      loose.push({ kind: 'branch', branch: entry.branch, displayName: entry.path })
      continue
    }
    const segment = entry.path.slice(0, slash)
    folders.set(segment, [
      ...(folders.get(segment) ?? []),
      { branch: entry.branch, path: entry.path.slice(slash + 1) },
    ])
  }

  const folderNodes: RemoteTreeFolder[] = Array.from(folders.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, below]) => ({
      kind: 'folder',
      name,
      branchNames: below.map((e) => e.branch.name),
      children: build(below),
    }))

  // Loose branches first, then folders — the order the local section already uses.
  return [...loose, ...folderNodes]
}

/**
 * Builds the folder tree under one remote node: every `/` in a branch's name is a level, so
 * `origin/build/ci/lint` reads as `origin › build › ci › lint`.
 *
 * Unlike the local list, a folder is formed even when it holds a single branch: under a remote the
 * folders are the remote's own namespaces, and a `build/` that appears or disappears depending on
 * how many branches happen to be pushed under it would not be a stable place to look.
 *
 * `nameOf` gives the name to split on — the name *relative to the remote*, so the remote's own
 * segment doesn't become a folder inside its own node.
 */
export function buildRemoteBranchTree(
  branches: GitBranch[],
  nameOf: (branch: GitBranch) => string
): RemoteTreeNode[] {
  return build(branches.map((branch) => ({ branch, path: nameOf(branch) })))
}
