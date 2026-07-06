import { useEffect, useMemo, useState } from 'react'

export interface FileTreeInputFile {
  path: string
  status: string
  additions?: number
  deletions?: number
  staged?: boolean
}

export interface TreeNode {
  name: string
  path: string
  isFolder: boolean
  status?: string
  additions?: number
  deletions?: number
  staged?: boolean
  children?: Record<string, TreeNode>
  stats?: {
    added: number
    modified: number
    deleted: number
    renamed: number
  }
}

function buildFileTree(files: FileTreeInputFile[]): Record<string, TreeNode> {
  const root: Record<string, TreeNode> = {}

  for (const file of files) {
    const parts = file.path.split('/')
    let current = root
    let cumulativePath = ''

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      cumulativePath = cumulativePath ? `${cumulativePath}/${part}` : part
      const isLast = i === parts.length - 1

      if (!current[part]) {
        current[part] = {
          name: part,
          path: cumulativePath,
          isFolder: !isLast,
          status: isLast ? file.status : undefined,
          additions: isLast ? file.additions : undefined,
          deletions: isLast ? file.deletions : undefined,
          staged: isLast ? file.staged : undefined,
          children: isLast ? undefined : {},
        }
      }

      if (!isLast && current[part].children) {
        current = current[part].children!
      }
    }
  }

  function computeFolderStats(node: TreeNode) {
    if (!node.isFolder) return

    const stats = { added: 0, modified: 0, deleted: 0, renamed: 0 }

    if (node.children) {
      for (const childName in node.children) {
        const child = node.children[childName]
        computeFolderStats(child)

        if (child.isFolder && child.stats) {
          stats.added += child.stats.added
          stats.modified += child.stats.modified
          stats.deleted += child.stats.deleted
          stats.renamed += child.stats.renamed
        } else if (!child.isFolder) {
          if (child.status === 'added' || child.status === 'untracked') {
            stats.added++
          } else if (child.status === 'modified') {
            stats.modified++
          } else if (child.status === 'deleted') {
            stats.deleted++
          } else if (child.status === 'renamed') {
            stats.renamed++
          }
        }
      }
    }

    node.stats = stats
  }

  for (const key in root) {
    computeFolderStats(root[key])
  }

  return root
}

export function getSortedNodes(nodes: Record<string, TreeNode>): TreeNode[] {
  return Object.values(nodes).sort((a, b) => {
    if (a.isFolder && !b.isFolder) return -1
    if (!a.isFolder && b.isFolder) return 1
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })
  })
}

function findNodeByPath(root: Record<string, TreeNode>, path: string): TreeNode | null {
  if (!path) return null
  const parts = path.split('/')
  let current: Record<string, TreeNode> | undefined = root
  let node: TreeNode | null = null

  for (const part of parts) {
    if (!part) continue
    if (!current || !current[part]) {
      return null
    }
    node = current[part]
    current = node.children
  }
  return node
}

/**
 * Builds a Composite file tree (folders containing files/folders, with aggregated per-folder
 * stats) from a flat file list, plus the search/expand-collapse UI state that goes with
 * rendering it. `resetKey` clears the expanded-folders state when it changes (e.g. switching
 * commit/repo).
 */
export function useFileTree<T extends FileTreeInputFile>(files: T[], resetKey: string) {
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [buttonState, setButtonState] = useState<'expand' | 'collapse'>('expand')

  const filteredFiles = useMemo(() => {
    if (!searchQuery.trim()) return files
    const query = searchQuery.toLowerCase()
    return files.filter((file) => file.path.toLowerCase().includes(query))
  }, [files, searchQuery])

  const allFolderPaths = useMemo(() => {
    const folders = new Set<string>()
    files.forEach((file) => {
      const parts = file.path.split('/')
      let current = ''
      for (let i = 0; i < parts.length - 1; i++) {
        current = current ? `${current}/${parts[i]}` : parts[i]
        folders.add(current)
      }
    })
    return folders
  }, [files])

  const treeRoot = useMemo(() => buildFileTree(filteredFiles), [filteredFiles])

  // Auto-expand folders when typing a search query
  useEffect(() => {
    if (searchQuery.trim()) {
      const foldersToExpand = new Set<string>()
      filteredFiles.forEach((file) => {
        const parts = file.path.split('/')
        let current = ''
        for (let i = 0; i < parts.length - 1; i++) {
          current = current ? `${current}/${parts[i]}` : parts[i]
          foldersToExpand.add(current)
        }
      })
      setExpandedFolders(foldersToExpand)
      setButtonState('collapse')
    }
  }, [searchQuery, filteredFiles])

  // Reset expanded folders when the tree's identity changes (e.g. switching commit/repo)
  useEffect(() => {
    setExpandedFolders(new Set())
    setButtonState('expand')
  }, [resetKey])

  function toggleFolder(folderPath: string) {
    const isExpanding = !expandedFolders.has(folderPath)
    let wasExpanded = false

    const foldersToToggle = new Set<string>()
    foldersToToggle.add(folderPath)

    if (isExpanding) {
      // Auto-expand single-child folders recursively
      const node = findNodeByPath(treeRoot, folderPath)
      if (node) {
        let current = node
        while (current.isFolder && current.children) {
          const keys = Object.keys(current.children)
          if (keys.length === 1) {
            const child = current.children[keys[0]]
            if (child && child.isFolder) {
              foldersToToggle.add(child.path)
              current = child
            } else {
              break
            }
          } else {
            break
          }
        }
      }
    }

    setExpandedFolders((prev) => {
      const next = new Set(prev)
      if (isExpanding) {
        foldersToToggle.forEach((path) => next.add(path))
      } else {
        next.delete(folderPath)
        wasExpanded = true
      }
      return next
    })

    if (wasExpanded) {
      setButtonState('expand')
    }
  }

  function toggleExpandAll() {
    if (buttonState === 'expand') {
      setExpandedFolders(new Set(allFolderPaths))
      setButtonState('collapse')
    } else {
      setExpandedFolders(new Set())
      setButtonState('expand')
    }
  }

  return {
    searchQuery,
    setSearchQuery,
    filteredFiles,
    treeRoot,
    allFolderPaths,
    expandedFolders,
    buttonState,
    toggleFolder,
    toggleExpandAll,
  }
}
