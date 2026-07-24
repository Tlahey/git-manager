export interface FileNode {
  name: string
  path: string
  isDir: boolean
  children?: FileNode[]
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
