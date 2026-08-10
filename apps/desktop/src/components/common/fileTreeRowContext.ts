import type { TreeNode } from '@git-manager/components'

/**
 * What every row of a {@link CommitFileList} tree needs from the list around it.
 *
 * One object rather than a dozen props per row, for the same reason the WIP panel's forms take one
 * state: the rows are not reusable components but two halves of one list, and every field here is
 * either the list's configuration or an action that belongs to it. Splitting it per row would say
 * three times over that they are coupled, and drift the first time the list gains an option.
 */
export interface FileTreeRowContext {
  /** Whether this list shows the working tree — gates every staging control. */
  isWip: boolean
  /** Commit the list belongs to; `undefined` on the working tree's own diffs. */
  commitOid: string
  /**
   * Folder rows gain a checkbox (and its leading gap), which pushes their name right — the file
   * rows read this to indent by the same step and stay aligned under the folder's *name* rather
   * than under its checkbox.
   */
  folderCheckboxes?: boolean
  /**
   * Replaces the persistent stage checkbox with a hover-revealed +/- at the end of the row.
   * `'add'` stages, `'remove'` unstages; every file in the list is assumed to share the direction.
   */
  hoverStage?: 'add' | 'remove'
  expandedFolders: Set<string>
  toggleFolder: (path: string) => void
  onSelectFileDiff?: (file: { path: string; staged: boolean; oid?: string }) => void
  onStage: (path: string) => void
  onUnstage: (path: string) => void
  onDiscard: (path: string) => void
  /** Stages or unstages every file under a folder, depending on whether they all already are. */
  onToggleFolderStage: (node: TreeNode, allStaged: boolean) => void
  /** The hover +/- on a folder row: applies `hoverStage`'s direction to everything below it. */
  onHoverStageFolder: (node: TreeNode) => void
}
