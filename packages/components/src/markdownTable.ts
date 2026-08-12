export type MarkdownTableAlign = 'left' | 'center' | 'right' | null

export interface MarkdownTable {
  header: string[]
  rows: string[][]
  /** One entry per column, in the order they appear. */
  align: MarkdownTableAlign[]
}

/**
 * Reads a GFM table back out of its own source.
 *
 * The live-preview editor needs the cells to draw a real table, and it has nothing but the text to
 * get them from — the syntax tree marks the table but not which run of characters is a cell. Kept
 * pure and separate so the parsing is testable on its own, rows and pipes and all.
 */

/** Splits a row on its unescaped pipes, dropping the empty edges of `| a | b |`. */
function cells(line: string): string[] {
  const parts: string[] = []
  let current = ''
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (char === '\\' && line[index + 1] === '|') {
      current += '|'
      index += 1
    } else if (char === '|') {
      parts.push(current)
      current = ''
    } else {
      current += char
    }
  }
  parts.push(current)

  // A well-formed row opens and closes with a pipe, which leaves an empty string at each end.
  if (parts.length && parts[0].trim() === '') parts.shift()
  if (parts.length && parts[parts.length - 1].trim() === '') parts.pop()
  return parts.map((cell) => cell.trim())
}

function alignOf(spec: string): MarkdownTableAlign {
  const left = spec.startsWith(':')
  const right = spec.endsWith(':')
  if (left && right) return 'center'
  if (right) return 'right'
  if (left) return 'left'
  return null
}

const DELIMITER = /^:?-{1,}:?$/

/** Returns the table a block of source describes, or `null` when it isn't one. */
export function parseMarkdownTable(source: string): MarkdownTable | null {
  const lines = source.split('\n').filter((line) => line.trim() !== '')
  if (lines.length < 2) return null

  const header = cells(lines[0])
  const delimiters = cells(lines[1])
  if (delimiters.length === 0 || !delimiters.every((cell) => DELIMITER.test(cell))) return null

  return {
    header,
    align: delimiters.map(alignOf),
    rows: lines.slice(2).map(cells),
  }
}
