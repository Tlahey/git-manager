import type { GitDiffFile, GitDiffHunk, GitDiffLine } from '@git-manager/git-types'

/**
 * Rebuilds the "before" and "after" text of a parsed diff file from its hunks,
 * so a patch we only have as text (apply / dependency patches) can be shown in
 * the two-pane Monaco diff editor. Only the hunk regions are reconstructed —
 * unchanged gaps between hunks are elided, which is exactly a patch preview.
 */
export function reconstructDiffSides(file: GitDiffFile): { original: string; modified: string } {
  const original: string[] = []
  const modified: string[] = []
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.origin === '\\') continue
      if (line.origin === ' ') {
        original.push(line.content)
        modified.push(line.content)
      } else if (line.origin === '-') {
        original.push(line.content)
      } else if (line.origin === '+') {
        modified.push(line.content)
      }
    }
  }
  return { original: original.join('\n'), modified: modified.join('\n') }
}

/**
 * Parses raw unified-diff / `git diff` text into the same `GitDiffFile[]` shape
 * the backend produces, so patch previews (apply / dependency patches, which we
 * only have as text) can render through the app's structured `DiffViewer`.
 *
 * Handles multi-file diffs, added/deleted/renamed files, and binary markers. It
 * is deliberately lenient: anything it can't classify falls back to `modified`.
 */
export function parseUnifiedDiff(text: string): GitDiffFile[] {
  const lines = text.split('\n')
  const files: GitDiffFile[] = []
  let current: GitDiffFile | null = null
  let hunk: GitDiffHunk | null = null
  let oldLineno = 0
  let newLineno = 0

  const stripPrefix = (p: string) => p.replace(/^[ab]\//, '').replace(/\t.*$/, '')

  const pushHunk = () => {
    if (current && hunk) current.hunks.push(hunk)
    hunk = null
  }
  const pushFile = () => {
    pushHunk()
    if (current) files.push(current)
    current = null
  }

  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      pushFile()
      // `diff --git a/x b/y` — provisional paths, refined by ---/+++ below.
      const match = line.match(/^diff --git (.+) (.+)$/)
      const oldPath = match ? stripPrefix(match[1]) : ''
      const newPath = match ? stripPrefix(match[2]) : ''
      current = {
        oldPath,
        newPath,
        status: 'modified',
        additions: 0,
        deletions: 0,
        hunks: [],
        isBinary: false,
      }
      continue
    }
    if (!current) continue

    if (line.startsWith('new file mode')) {
      current.status = 'added'
      continue
    }
    if (line.startsWith('deleted file mode')) {
      current.status = 'deleted'
      continue
    }
    if (line.startsWith('rename from') || line.startsWith('rename to')) {
      current.status = 'renamed'
      if (line.startsWith('rename from')) current.oldPath = line.slice('rename from '.length).trim()
      else current.newPath = line.slice('rename to '.length).trim()
      continue
    }
    if (line.startsWith('Binary files') || line.startsWith('GIT binary patch')) {
      current.isBinary = true
      continue
    }
    if (line.startsWith('--- ')) {
      const p = line.slice(4).trim()
      if (p === '/dev/null') current.status = 'added'
      else current.oldPath = stripPrefix(p)
      continue
    }
    if (line.startsWith('+++ ')) {
      const p = line.slice(4).trim()
      if (p === '/dev/null') current.status = 'deleted'
      else current.newPath = stripPrefix(p)
      continue
    }
    if (line.startsWith('@@')) {
      pushHunk()
      const match = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      oldLineno = match ? parseInt(match[1], 10) : 0
      newLineno = match ? parseInt(match[2], 10) : 0
      hunk = { header: line, lines: [] }
      continue
    }
    if (!hunk) continue

    // Hunk body. `\ No newline at end of file` carries no line numbers.
    if (line.startsWith('\\')) {
      hunk.lines.push({ origin: '\\', content: line.slice(2), oldLineno: null, newLineno: null })
      continue
    }
    const origin = line[0] as GitDiffLine['origin']
    const content = line.slice(1)
    if (origin === '+') {
      hunk.lines.push({ origin, content, oldLineno: null, newLineno })
      newLineno++
      current.additions++
    } else if (origin === '-') {
      hunk.lines.push({ origin, content, oldLineno, newLineno: null })
      oldLineno++
      current.deletions++
    } else if (origin === ' ') {
      hunk.lines.push({ origin, content, oldLineno, newLineno })
      oldLineno++
      newLineno++
    }
    // Any other leading char (blank trailing line, etc.) is ignored.
  }
  pushFile()

  // Normalise plain new/deleted display paths.
  for (const f of files) {
    if (f.status === 'added' && !f.newPath) f.newPath = f.oldPath
    if (f.status === 'deleted' && !f.oldPath) f.oldPath = f.newPath
  }
  return files
}
