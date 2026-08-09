export interface FileNode {
  name: string
  path: string
  isDir: boolean
  children?: FileNode[]
}

/**
 * Returns the children of the directory at `dirPath`, or the tree's roots for an empty path.
 *
 * An unknown path yields an empty list rather than throwing: the browsing state outlives the tree
 * it was captured against (a file deleted outside the app, a `git checkout` swapping the working
 * tree), and an empty directory listing is a better answer than a crash.
 */
export function findDirectoryNodes(nodes: FileNode[], dirPath: string): FileNode[] {
  if (!dirPath) return nodes

  let current = nodes
  for (const part of dirPath.split('/')) {
    const next = current.find((node) => node.name === part && node.isDir)
    if (!next?.children) return []
    current = next.children
  }
  return current
}

/**
 * Narrows a tree to the **files** whose own name contains `query` (case-insensitive), keeping the
 * directories above them as the path to a result and nothing more.
 *
 * **A directory is never a match itself**, and that is the rule the whole shape rests on. It used
 * to be one — matched on its full path, and kept whole with every file under it — which made a
 * result mean two different things: a file you asked for, or a file that happened to sit under a
 * folder you asked for. Searching `src` then "found" the entire source tree, so the row you clicked
 * was rarely the row you wanted, and the highlight had nothing to mark on it because the match was
 * three levels up in the path.
 *
 * Matching the *name* rather than the path follows from that: `src/Button.tsx` must not answer a
 * query of `src` either, or the folder rule comes back in through the path. Every surviving row is
 * a file that contains what you typed, and carries the mark to prove it. Pair with the sidebar
 * rendering matches expanded — a filtered tree the user still has to unfold by hand hides the very
 * results it just found.
 */
export function filterFileTree(nodes: FileNode[], query: string): FileNode[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return nodes

  const filtered: FileNode[] = []
  for (const node of nodes) {
    if (node.isDir) {
      const children = filterFileTree(node.children ?? [], needle)
      if (children.length > 0) filtered.push({ ...node, children })
      continue
    }
    if (node.name.toLowerCase().includes(needle)) filtered.push(node)
  }
  return filtered
}

export function buildFileTree(paths: string[]): FileNode[] {
  const root: FileNode = { name: 'root', path: '', isDir: true, children: [] }

  for (const path of paths) {
    const parts = path.split('/')
    let current = root

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const isLast = i === parts.length - 1
      const currentPath = parts.slice(0, i + 1).join('/')

      if (!current.children) {
        current.children = []
      }

      let existing = current.children.find((c) => c.name === part)
      if (!existing) {
        existing = {
          name: part,
          path: currentPath,
          isDir: !isLast,
          ...(isLast ? {} : { children: [] }),
        }
        current.children.push(existing)
      }

      current = existing
    }
  }

  // Sort: directories first, then files alphabetically
  const sortNodes = (nodes: FileNode[]) => {
    nodes.sort((a, b) => {
      if (a.isDir && !b.isDir) return -1
      if (!a.isDir && b.isDir) return 1
      return a.name.localeCompare(b.name)
    })
    nodes.forEach((node) => {
      if (node.children) {
        sortNodes(node.children)
      }
    })
  }

  if (root.children) {
    sortNodes(root.children)
  }

  return root.children || []
}
