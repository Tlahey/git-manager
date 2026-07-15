export type DiffLineType = 'context' | 'add' | 'del'

export interface DiffLine {
  type: DiffLineType
  text: string
  /** 1-based line number on the old side (null for added lines). */
  oldNo: number | null
  /** 1-based line number on the new side (null for removed lines). */
  newNo: number | null
}

export interface DiffHunk {
  header: string
  lines: DiffLine[]
}

const HUNK_RE = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/

/**
 * Parse a GitHub `patch` (unified diff for one file) into hunks with resolved old/new line numbers.
 * Handles `@@` hunk headers, +/-/space lines and `\ No newline at end of file` markers. Returns an
 * empty array for an empty/absent patch.
 */
export function parseUnifiedDiff(patch: string): DiffHunk[] {
  if (!patch) return []
  const hunks: DiffHunk[] = []
  let current: DiffHunk | null = null
  let oldNo = 0
  let newNo = 0

  for (const raw of patch.split('\n')) {
    const hunkMatch = HUNK_RE.exec(raw)
    if (hunkMatch) {
      oldNo = parseInt(hunkMatch[1], 10)
      newNo = parseInt(hunkMatch[2], 10)
      current = { header: raw, lines: [] }
      hunks.push(current)
      continue
    }
    if (!current) continue
    // "\ No newline at end of file", or the trailing empty element from split('\n').
    if (raw === '' || raw.startsWith('\\')) continue

    const marker = raw[0]
    const text = raw.slice(1)
    if (marker === '+') {
      current.lines.push({ type: 'add', text, oldNo: null, newNo })
      newNo++
    } else if (marker === '-') {
      current.lines.push({ type: 'del', text, oldNo, newNo: null })
      oldNo++
    } else {
      current.lines.push({ type: 'context', text, oldNo, newNo })
      oldNo++
      newNo++
    }
  }

  return hunks
}
