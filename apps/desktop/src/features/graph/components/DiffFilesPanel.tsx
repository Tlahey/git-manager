import { Spinner } from '@git-manager/ui'
import type { GitDiff } from '@git-manager/git-types'
import { DiffFileList } from './DiffFileList'

interface DiffFilesPanelProps {
  diff: GitDiff | undefined
  isLoading: boolean
  /** Shown when the diff came back with no file at all — each caller words its own "no changes". */
  emptyMessage: string
  /** The scroll container's test id. Defaults to this panel's own; the compare-branches dialog
   * keeps the id its e2e steps already look up. */
  testId?: string
}

/**
 * The scrollable body every "here is a diff" dialog shares: a spinner while it loads, the diff
 * itself, or the caller's empty message.
 *
 * Extracted the moment a second dialog needed it (compare against the working directory, compare
 * against a merge parent) — the two ask for different diffs and say different things about an empty
 * one, but the *rendering* of a `GitDiff` is not what either of them is about. The compare-branches
 * dialog had drifted into its own copy of this and now goes through it too, which is the point:
 * {@link DiffFileList} is virtualized, and a second copy of the list would be a second place for
 * the freeze it fixes to come back.
 */
export function DiffFilesPanel({
  diff,
  isLoading,
  emptyMessage,
  testId = 'diff-files-panel',
}: DiffFilesPanelProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8" data-testid="diff-files-loading">
        <Spinner className="h-5 w-5" />
      </div>
    )
  }

  return <DiffFileList files={diff?.files ?? []} emptyMessage={emptyMessage} testId={testId} />
}
