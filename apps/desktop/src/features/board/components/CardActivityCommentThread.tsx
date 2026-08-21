import type { BoardComment } from '@git-manager/git-types'
import { CardActivityCommentRow } from './CardActivityCommentRow'
import type { CommentThreadNode } from '../lib/commentThreads'

interface CardActivityCommentThreadProps {
  node: CommentThreadNode
  depth: number
  repoPath: string
  repliesEnabled: boolean
  onReply: (comment: BoardComment) => void
}

/** How far indentation keeps growing with depth — a genuinely deep thread should stay readable in
 * the sidebar's fixed width rather than running its replies off the edge. Nesting itself stays
 * unlimited; only the visual indent flattens out past this depth. */
const MAX_INDENT_DEPTH = 6
const INDENT_PX = 14

/** Recursive renderer for the activity panel's "Comments" tab — a card's replies nested under their
 * parent, arbitrarily deep. */
export function CardActivityCommentThread({
  node,
  depth,
  repoPath,
  repliesEnabled,
  onReply,
}: CardActivityCommentThreadProps) {
  return (
    <li style={{ marginLeft: Math.min(depth, MAX_INDENT_DEPTH) * INDENT_PX }}>
      <CardActivityCommentRow
        comment={node.comment}
        repoPath={repoPath}
        onReply={repliesEnabled ? () => onReply(node.comment) : undefined}
      />
      {node.children.length > 0 && (
        <ul className="mt-2 space-y-2">
          {node.children.map((child) => (
            <CardActivityCommentThread
              key={child.comment.id}
              node={child}
              depth={depth + 1}
              repoPath={repoPath}
              repliesEnabled={repliesEnabled}
              onReply={onReply}
            />
          ))}
        </ul>
      )}
    </li>
  )
}
