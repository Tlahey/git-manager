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
 * Narrows a tree to the nodes matching `query` (case-insensitive, matched on the full path).
 *
 * A directory survives when it matches itself — it then keeps all of its contents — or when one of
 * its descendants does, in which case only the matching branch is kept. Filtering the tree rather
 * than the flat path list is what lets a folder name be searched for, and it pairs with the
 * sidebar rendering matches expanded: a filtered tree the user still has to unfold by hand hides
 * the very results it just found.
 */
export function filterFileTree(nodes: FileNode[], query: string): FileNode[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return nodes

  const filtered: FileNode[] = []
  for (const node of nodes) {
    if (node.path.toLowerCase().includes(needle)) {
      filtered.push(node)
      continue
    }
    if (node.isDir && node.children) {
      const children = filterFileTree(node.children, needle)
      if (children.length > 0) filtered.push({ ...node, children })
    }
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
