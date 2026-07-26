import type { GitDiffFile } from '@git-manager/git-types'

/**
 * Renders a structured {@link GitDiffFile} back into unified-diff text — the inverse of
 * `parseUnifiedDiff`, and the format every model has seen millions of times.
 *
 * The backend hands the frontend hunks and typed lines (good for rendering, useless as a prompt), so
 * the AI change-explanation feature needs the text form rebuilt here rather than fetching the same
 * diff a second time in raw form. Hunk headers come through verbatim (`@@ -a,b +c,d @@ context`);
 * each line is its origin character followed by its content, exactly as `git diff` prints it.
 *
 * A binary file has no textual patch: its hunks are empty, so only the `---`/`+++` header is
 * produced and callers decide whether that is worth sending anywhere.
 */
export function formatUnifiedPatch(file: GitDiffFile): string {
  // An added file has no old path and a deleted one no new path; the `diff --git` line still names
  // both sides (git repeats the known one), which is what makes the output re-parsable.
  const oldPath = file.oldPath || file.newPath
  const newPath = file.newPath || file.oldPath

  const isNew = file.status === 'added' || file.status === 'untracked'
  const oldSide = isNew ? '/dev/null' : `a/${oldPath}`
  const newSide = file.status === 'deleted' ? '/dev/null' : `b/${newPath}`

  const lines: string[] = [
    `diff --git a/${oldPath} b/${newPath}`,
    `--- ${oldSide}`,
    `+++ ${newSide}`,
  ]

  for (const hunk of file.hunks) {
    lines.push(hunk.header)
    for (const line of hunk.lines) {
      // `\` marks git's "\ No newline at end of file" note, which is already the line's content.
      lines.push(line.origin === '\\' ? `\\ ${line.content}` : `${line.origin}${line.content}`)
    }
  }

  return lines.join('\n')
}
