import type { GitDiffFile, GitDiffLine } from '@git-manager/git-types'

/** Every row height, in pixels. These are not estimates: the virtualizer positions rows from
 * these numbers alone, so the rendered markup has to be pinned to exactly the same values (see the
 * `h-*` classes in DiffRow.tsx) or rows drift out of their reserved slot as you scroll.
 *
 * Fixed heights are only sound because diff rows never wrap: the content span is `whitespace-pre`
 * inside an `overflow-x-auto` container, so a long line scrolls sideways instead of growing taller.
 * Any change that lets a row wrap (or that adds a variable-height element to one) has to move this
 * list to measured sizes — `@tanstack/react-virtual`'s `measureElement` — rather than nudge the
 * constants. */
export const DIFF_ROW_HEIGHTS = {
  /** The file's path + status badge + counts strip. */
  file: 28,
  /** `@@ -1,3 +1,4 @@`. */
  hunk: 20,
  /** One added/removed/context line. */
  line: 20,
  /** The "Binary file" placeholder that replaces a binary file's (absent) hunks. */
  binary: 32,
  /** Breathing room between two files' bordered boxes — the old `space-y-3`. */
  gap: 12,
} as const

export type DiffRow =
  | {
      kind: 'file'
      height: number
      key: string
      file: GitDiffFile
      displayPath: string
      /** No body row follows (a file with neither hunks nor a binary placeholder), so the header
       * row has to draw the box's closing edge itself. */
      isLastOfFile: boolean
    }
  | { kind: 'hunk'; height: number; key: string; header: string; isLastOfFile: boolean }
  | { kind: 'line'; height: number; key: string; line: GitDiffLine; isLastOfFile: boolean }
  | { kind: 'binary'; height: number; key: string; isLastOfFile: boolean }
  | { kind: 'gap'; height: number; key: string }

/** How a file's path reads in its header: a rename shows both sides, everything else just the path
 * it ends up at. Also the key behind the `diff-viewer-file-<path>` test id the e2e suite looks up. */
export function diffFileDisplayPath(file: GitDiffFile): string {
  return file.status === 'renamed' ? `${file.oldPath} → ${file.newPath}` : file.newPath
}

/** Flattens a whole multi-file diff into one linear list of fixed-height rows.
 *
 * This is what makes the diff view virtualizable at all. Rendering it as nested
 * `files.map(hunks.map(lines.map(...)))` built a DOM node per line of every file up front — a
 * branch-to-branch comparison of a few thousand lines froze the window for seconds. One flat list
 * with known heights means the virtualizer can place any row without measuring anything, so only
 * the rows on screen exist.
 *
 * `isLastOfFile` exists because the per-file bordered box survives the flattening: the box is drawn
 * by the rows themselves (left/right edges on every row, the closing edge on the last one), since
 * absolutely-positioned rows can't sit inside a shared wrapper element. */
export function buildDiffRows(files: GitDiffFile[]): DiffRow[] {
  const rows: DiffRow[] = []

  files.forEach((file, fileIndex) => {
    const displayPath = diffFileDisplayPath(file)
    // Keyed by index as well as path: a diff can legitimately carry the same path twice (a rename
    // reported alongside its own source), and React keys have to stay unique regardless.
    const fileKey = `${fileIndex}:${displayPath}`

    if (fileIndex > 0) {
      rows.push({ kind: 'gap', height: DIFF_ROW_HEIGHTS.gap, key: `${fileKey}:gap` })
    }

    rows.push({
      kind: 'file',
      height: DIFF_ROW_HEIGHTS.file,
      key: `${fileKey}:header`,
      file,
      displayPath,
      // A non-binary file with no hunk at all (e.g. a pure mode change) has no body row below it,
      // so its header is the whole box and closes it.
      isLastOfFile: !file.isBinary && file.hunks.length === 0,
    })

    if (file.isBinary) {
      rows.push({
        kind: 'binary',
        height: DIFF_ROW_HEIGHTS.binary,
        key: `${fileKey}:binary`,
        isLastOfFile: true,
      })
      return
    }

    const bodyStart = rows.length
    file.hunks.forEach((hunk, hunkIndex) => {
      rows.push({
        kind: 'hunk',
        height: DIFF_ROW_HEIGHTS.hunk,
        key: `${fileKey}:hunk:${hunkIndex}`,
        header: hunk.header,
        isLastOfFile: false,
      })
      hunk.lines.forEach((line, lineIndex) => {
        rows.push({
          kind: 'line',
          height: DIFF_ROW_HEIGHTS.line,
          key: `${fileKey}:hunk:${hunkIndex}:line:${lineIndex}`,
          line,
          isLastOfFile: false,
        })
      })
    })

    const last = rows[rows.length - 1]
    if (rows.length > bodyStart && (last.kind === 'hunk' || last.kind === 'line')) {
      last.isLastOfFile = true
    }
  })

  return rows
}
