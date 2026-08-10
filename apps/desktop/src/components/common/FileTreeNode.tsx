import { getSortedNodes, type TreeNode } from '@git-manager/components'
import { FileTreeFolderRow } from './FileTreeFolderRow'
import { FileTreeFileRow } from './FileTreeFileRow'
import type { FileTreeRowContext } from './fileTreeRowContext'

interface FileTreeNodeProps {
  node: TreeNode
  /** Nesting level, 0 at the root. Each row turns it into its own left padding. */
  depth?: number
  ctx: FileTreeRowContext
}

/**
 * One node of a {@link CommitFileList} tree, folder or file, and the recursion between them.
 *
 * The recursion lives here rather than in the folder row so that the folder row draws a folder and
 * nothing else: it receives its expanded subtree as `children`, already rendered. A collapsed
 * folder is not rendered at all below its own row — that is what keeps a deep tree cheap, and it is
 * why the walk is a component rather than a flattening pass.
 */
export function FileTreeNode({ node, depth = 0, ctx }: FileTreeNodeProps) {
  if (!node.isFolder) {
    return <FileTreeFileRow node={node} depth={depth} ctx={ctx} />
  }

  // Checked here as well as in the row, cheaply, so a collapsed folder's children are not sorted
  // and not turned into elements at all — the row would drop them, but the work would still be done.
  const isExpanded = ctx.expandedFolders.has(node.path)

  return (
    <FileTreeFolderRow node={node} depth={depth} ctx={ctx}>
      {isExpanded &&
        node.children &&
        getSortedNodes(node.children).map((child) => (
          <FileTreeNode key={child.path} node={child} depth={depth + 1} ctx={ctx} />
        ))}
    </FileTreeFolderRow>
  )
}
