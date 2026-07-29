import type { GitBranch } from '@git-manager/git-types'

/** A folder level in a branch tree — one path segment, holding whatever is below it. */
export interface BranchTreeFolder {
  kind: 'folder'
  /** The segment itself, e.g. `build` — what the row displays. */
  name: string
  /** Every branch below this folder, at any depth — what a row acting on the folder acts on. */
  branches: GitBranch[]
  children: BranchTreeNode[]
}

export interface BranchTreeLeaf {
  kind: 'branch'
  branch: GitBranch
  /** Name with every folder above it stripped: `build/ci/lint` → `lint`. */
  displayName: string
}

export type BranchTreeNode = BranchTreeFolder | BranchTreeLeaf

interface Entry {
  branch: GitBranch
  /** What is left of the name once the folders already walked are stripped. */
  path: string
}

function build(entries: Entry[]): BranchTreeNode[] {
  const loose: BranchTreeLeaf[] = []
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

  const folderNodes: BranchTreeFolder[] = Array.from(folders.entries()).map(([name, below]) => ({
    kind: 'folder',
    name,
    branches: below.map((e) => e.branch),
    children: build(below),
  }))

  // One alphabetical list, folders and branches alike: a folder is a namespace the user reads by
  // name, so `build/` sorting away from `bugfix` would be the surprise.
  return [...loose, ...folderNodes].sort((a, b) => labelOf(a).localeCompare(labelOf(b)))
}

/** What a node shows on its row — the name the list is ordered by. */
const labelOf = (node: BranchTreeNode): string =>
  node.kind === 'branch' ? node.displayName : node.name

/**
 * Builds the folder tree of a branch list: every `/` in a branch's name is a level, so
 * `build/ci/lint` reads as `build › ci › lint`. Shared by the sidebar's local and remote sections,
 * the latter building one tree per remote node.
 *
 * A folder is formed even when it holds a single branch: a folder is a namespace of the repo, and
 * one that appears or disappears depending on how many branches happen to live under it would not
 * be a stable place to look.
 *
 * `nameOf` gives the name to split on. For a remote branch that is the name *relative to its
 * remote*, so the remote's own segment doesn't become a folder inside its own node.
 *
 * Every level is one alphabetical list by row label, folders and branches together.
 */
export function buildBranchTree(
  branches: GitBranch[],
  nameOf: (branch: GitBranch) => string
): BranchTreeNode[] {
  return build(branches.map((branch) => ({ branch, path: nameOf(branch) })))
}
