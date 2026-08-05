import type { DailySummary } from '@git-manager/ai'

/**
 * The markdown file format for an archived daily briefing — render and parse, kept side by side so
 * the round trip is one file's responsibility.
 *
 * The file, not a store, is the source of truth: the whole point of writing markdown is that the
 * user can open it in an editor, grep the folder, or keep it after uninstalling. That means the
 * parser has to tolerate a file someone edited by hand — a missing section, reordered front matter,
 * a bullet turned into a sentence — and degrade rather than throw. It also means the format has to
 * stay readable: a flat `key: value` front matter and two `##` sections, nothing that needs a
 * library to make sense of.
 */

/** One archived briefing, as the app works with it in memory. */
export interface DailySummaryEntry {
  repoPath: string
  repoName: string
  /** The day covered, `YYYY-MM-DD`. Also the filename. */
  date: string
  /** The branch the window was taken over. */
  branch: string
  /** Epoch milliseconds the briefing was produced. */
  generatedAt: number
  /** How many commits and files the briefing was built from — shown as provenance in the UI. */
  commitCount: number
  fileCount: number
  summary: DailySummary
}

/**
 * Heading the body is split on. English and stable on purpose: this is a file format, not UI copy,
 * so a user switching the app's language must not orphan their existing archive.
 *
 * {@link LEGACY_HIGHLIGHTS_HEADING} is what the section was called while a briefing still described
 * "yesterday and today". Those files are still in people's archives for another two months, and a
 * reader that silently returned no bullets for them would look like data loss.
 */
const HIGHLIGHTS_HEADING = 'Highlights'
const LEGACY_HIGHLIGHTS_HEADING = 'Yesterday'

/** Formats a value for the flat front matter, collapsing newlines so one entry stays one line. */
function frontMatterLine(key: string, value: string | number): string {
  return `${key}: ${String(value).replace(/\r?\n/g, ' ').trim()}`
}

function renderBullets(items: string[]): string {
  if (items.length === 0) return '_(nothing)_'
  return items.map((item) => `- ${item}`).join('\n')
}

/** Renders one briefing as the markdown file archived on disk. */
export function renderDailySummaryMarkdown(entry: DailySummaryEntry): string {
  const frontMatter = [
    frontMatterLine('repo', entry.repoName),
    frontMatterLine('repoPath', entry.repoPath),
    frontMatterLine('date', entry.date),
    frontMatterLine('branch', entry.branch),
    frontMatterLine('generatedAt', new Date(entry.generatedAt).toISOString()),
    frontMatterLine('commits', entry.commitCount),
    frontMatterLine('files', entry.fileCount),
  ].join('\n')

  return `---
${frontMatter}
---

# ${entry.date} — ${entry.repoName}

${entry.summary.headline}

## ${HIGHLIGHTS_HEADING}

${renderBullets(entry.summary.highlights)}
`
}

/** Splits the file into its front matter block and its body. A file without front matter is all
 * body — a hand-written note still renders, it just carries no metadata. */
function splitFrontMatter(markdown: string): { frontMatter: string; body: string } {
  const normalized = markdown.replace(/\r\n/g, '\n')
  if (!normalized.startsWith('---\n')) return { frontMatter: '', body: normalized }
  const end = normalized.indexOf('\n---', 4)
  if (end === -1) return { frontMatter: '', body: normalized }
  return {
    frontMatter: normalized.slice(4, end),
    body: normalized.slice(end + 4).replace(/^\n+/, ''),
  }
}

function readFrontMatter(frontMatter: string): Record<string, string> {
  const values: Record<string, string> = {}
  for (const line of frontMatter.split('\n')) {
    const separator = line.indexOf(':')
    if (separator === -1) continue
    values[line.slice(0, separator).trim()] = line.slice(separator + 1).trim()
  }
  return values
}

/** Reads the bullets under a `## <heading>` section, stopping at the next heading of any level.
 * Accepts `-` and `*` markers, and the `_(nothing)_` placeholder renders back as an empty list. */
function readSection(body: string, heading: string): string[] {
  const lines = body.split('\n')
  const start = lines.findIndex(
    (line) => line.trim().toLowerCase() === `## ${heading}`.toLowerCase()
  )
  if (start === -1) return []

  const items: string[] = []
  for (const line of lines.slice(start + 1)) {
    const trimmed = line.trim()
    if (trimmed.startsWith('#')) break
    const bullet = /^[-*]\s+(.*)$/.exec(trimmed)
    if (bullet?.[1].trim()) items.push(bullet[1].trim())
  }
  return items
}

/** The headline is the first non-empty paragraph after the `#` title, before the first `##`. */
function readHeadline(body: string): string {
  const lines = body.split('\n')
  const start = lines.findIndex((line) => line.trim().startsWith('# '))
  for (const line of lines.slice(start + 1)) {
    const trimmed = line.trim()
    if (trimmed.startsWith('##')) break
    if (trimmed) return trimmed
  }
  return ''
}

/**
 * Parses an archived markdown file back into an entry.
 *
 * `filePath` supplies the fallbacks the front matter can't: a file whose metadata was stripped still
 * yields a usable entry, because its date is its filename and its repo is its folder. Returns `null`
 * only when there is no date at all to file it under, which is the one thing the archive is indexed
 * by.
 */
export function parseDailySummaryMarkdown(
  markdown: string,
  fallback: { date?: string; repoPath?: string; repoName?: string } = {}
): DailySummaryEntry | null {
  const { frontMatter, body } = splitFrontMatter(markdown)
  const meta = readFrontMatter(frontMatter)

  const date = meta.date || fallback.date || ''
  if (!date) return null

  const generatedAt = Date.parse(meta.generatedAt ?? '')
  const commitCount = Number.parseInt(meta.commits ?? '', 10)
  const fileCount = Number.parseInt(meta.files ?? '', 10)

  return {
    repoPath: meta.repoPath || fallback.repoPath || '',
    repoName: meta.repo || fallback.repoName || '',
    date,
    branch: meta.branch || '',
    generatedAt: Number.isNaN(generatedAt) ? 0 : generatedAt,
    commitCount: Number.isNaN(commitCount) ? 0 : commitCount,
    fileCount: Number.isNaN(fileCount) ? 0 : fileCount,
    summary: {
      headline: readHeadline(body),
      highlights: readHighlights(body),
    },
  }
}

/** The day's bullets, falling back to the heading older archived files used. An empty array is
 * truthy, so this needs an explicit length check rather than `a || b`. */
function readHighlights(body: string): string[] {
  const current = readSection(body, HIGHLIGHTS_HEADING)
  return current.length > 0 ? current : readSection(body, LEGACY_HIGHLIGHTS_HEADING)
}

/** Flattens a briefing to the plain text the shortlister ranks and the LLM search reads. */
export function summaryPlainText(summary: DailySummary): string {
  return [summary.headline, ...summary.highlights].filter((line) => line.trim()).join('\n')
}
