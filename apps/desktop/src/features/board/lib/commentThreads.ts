import type { BoardComment } from '@git-manager/git-types'

export interface CommentThreadNode {
  comment: BoardComment
  children: CommentThreadNode[]
}

/**
 * Nests a card's comments into reply trees for the activity panel's "Comments" tab — arbitrary
 * depth, newest-first at both the top level and within every reply list, matching
 * `buildActivityTimeline`'s ordering for the "All" tab (which stays flat instead — see that
 * module's doc comment).
 *
 * A comment whose `parentCommentId` doesn't resolve to another comment in the list (unknown id, or
 * points at itself) renders as top-level rather than being dropped — nothing a user wrote should
 * silently disappear because of stale or foreign data. The `visited` guard exists for the
 * self-referencing case specifically (a comment naming its own id as parent, which becomes a root by
 * the rule above and would otherwise recurse into itself once looked up by id in `childrenOf`); a
 * cycle between two or more *distinct* comments can't reach `build()` at all under this grouping —
 * every member of such a cycle has a real parent, so none of them is ever selected as a root, and the
 * whole disconnected set is simply absent from the output. The write path (`add_card_comment` in
 * Rust) can never produce either case, since a reply's parent must already exist when the reply is
 * created — but a card's JSON is a plain file a user could hand-edit, so this doesn't trust that
 * invariant unconditionally at render time.
 */
export function buildCommentThreads(comments: BoardComment[]): CommentThreadNode[] {
  const byId = new Map(comments.map((comment) => [comment.id, comment]))
  const childrenOf = new Map<string, BoardComment[]>()
  const roots: BoardComment[] = []

  for (const comment of comments) {
    const parentId = comment.parentCommentId
    if (parentId && parentId !== comment.id && byId.has(parentId)) {
      const siblings = childrenOf.get(parentId) ?? []
      siblings.push(comment)
      childrenOf.set(parentId, siblings)
    } else {
      roots.push(comment)
    }
  }

  const newestFirst = (list: BoardComment[]) =>
    [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  function build(comment: BoardComment, visited: ReadonlySet<string>): CommentThreadNode {
    if (visited.has(comment.id)) return { comment, children: [] }
    const nextVisited = new Set(visited).add(comment.id)
    return {
      comment,
      children: newestFirst(childrenOf.get(comment.id) ?? []).map((child) =>
        build(child, nextVisited)
      ),
    }
  }

  return newestFirst(roots).map((root) => build(root, new Set()))
}
