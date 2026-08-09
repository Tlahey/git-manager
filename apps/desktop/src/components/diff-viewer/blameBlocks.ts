import type { BlameHunk } from '@git-manager/git-types'

/** A contiguous run of lines attributed to a single commit (one or more merged `BlameHunk`s). */
export interface BlameBlock {
  commitOid: string
  shortOid: string
  authorName: string
  authorEmail: string
  timestamp: number
  summary: string
  body: string
  /** 1-based inclusive line range. */
  startLine: number
  endLine: number
}

/** Number of distinct blame border colors — must match `.blame-border-N` classes in the stylesheet. */
export const BLAME_COLOR_COUNT = 12

/**
 * Merges blame hunks into contiguous same-commit blocks, sorted by line. Adjacent hunks attributed
 * to the same commit are coalesced so each block gets a single avatar and one continuous border.
 */
export function blameBlocks(hunks: BlameHunk[]): BlameBlock[] {
  const sorted = [...hunks].filter((h) => h.lineCount > 0).sort((a, b) => a.startLine - b.startLine)
  const blocks: BlameBlock[] = []

  for (const h of sorted) {
    const end = h.startLine + h.lineCount - 1
    const last = blocks[blocks.length - 1]
    if (last && last.commitOid === h.commitOid && h.startLine === last.endLine + 1) {
      last.endLine = end
    } else {
      blocks.push({
        commitOid: h.commitOid,
        shortOid: h.shortOid,
        authorName: h.authorName,
        authorEmail: h.authorEmail,
        timestamp: h.timestamp,
        summary: h.summary,
        body: h.body,
        startLine: h.startLine,
        endLine: end,
      })
    }
  }

  return blocks
}

/**
 * Truncates a commit summary for the blame column: up to 31 chars shown as-is; longer summaries are
 * cut to 28 chars plus an ellipsis (`...`), for a fixed 31-char width.
 */
export function truncateCommitName(summary: string): string {
  return summary.length <= 31 ? summary : `${summary.slice(0, 28)}...`
}

/** Deterministic border-color index (0..BLAME_COLOR_COUNT-1) derived from a commit oid. */
export function blameColorIndex(commitOid: string): number {
  let hash = 0
  for (let i = 0; i < commitOid.length; i++) {
    hash = commitOid.charCodeAt(i) + ((hash << 5) - hash)
    hash |= 0
  }
  return Math.abs(hash) % BLAME_COLOR_COUNT
}
