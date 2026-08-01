import { ScrollArea, Spinner } from '@git-manager/ui'
import type { GitDiff } from '@git-manager/git-types'
import { DiffViewer } from '../DiffViewer'

interface DiffFilesPanelProps {
  diff: GitDiff | undefined
  isLoading: boolean
  /** Shown when the diff came back with no file at all — each caller words its own "no changes". */
  emptyMessage: string
}

/**
 * The scrollable body every "here is a diff" dialog shares: a spinner while it loads, one
 * {@link DiffViewer} per changed file, or the caller's empty message.
 *
 * Extracted the moment a second dialog needed it (compare against the working directory, compare
 * against a merge parent) — the two ask for different diffs and say different things about an empty
 * one, but the *rendering* of a `GitDiff` is not what either of them is about.
 */
export function DiffFilesPanel({ diff, isLoading, emptyMessage }: DiffFilesPanelProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8" data-testid="diff-files-loading">
        <Spinner className="h-5 w-5" />
      </div>
    )
  }

  return (
    <ScrollArea className="min-h-0 flex-1" data-testid="diff-files-panel">
      <div className="space-y-3 pr-3">
        {diff?.files.length ? (
          diff.files.map((file, i) => <DiffViewer key={i} file={file} />)
        ) : (
          <p className="text-xs text-muted-foreground">{emptyMessage}</p>
        )}
      </div>
    </ScrollArea>
  )
}
