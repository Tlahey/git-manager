import { AnnotateTagDialog } from '../AnnotateTagDialog'
import { DeleteRemoteTagDialog } from '../DeleteRemoteTagDialog'
import type { PendingTagAction } from '../../../hooks/useTagContextMenu'

interface TagDialogsManagerProps {
  repoPath: string
  /** The tag-specific dialog to show (annotate / remote delete), or `null` for none. */
  pendingTagAction: PendingTagAction
  onClearPendingTagAction: () => void
}

/**
 * Renders the tag-only dialogs driven by {@link useTagContextMenu}'s `pendingTagAction` — the two
 * tag actions that need their own input/confirmation rather than the commit-scoped dialogs handled
 * by {@link GitGraphOverlayManager}.
 */
export function TagDialogsManager({
  repoPath,
  pendingTagAction,
  onClearPendingTagAction,
}: TagDialogsManagerProps) {
  if (!pendingTagAction) return null

  if (pendingTagAction.kind === 'annotate') {
    return (
      <AnnotateTagDialog
        repoPath={repoPath}
        tagName={pendingTagAction.tagName}
        oid={pendingTagAction.oid}
        open
        onClose={onClearPendingTagAction}
      />
    )
  }

  return (
    <DeleteRemoteTagDialog
      repoPath={repoPath}
      tagName={pendingTagAction.tagName}
      remote={pendingTagAction.remote}
      open
      onClose={onClearPendingTagAction}
    />
  )
}
