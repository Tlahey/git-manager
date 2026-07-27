import type { AiActivityCommit, JsonSchema } from '../config'
import type { CompletionFeature } from '../runtime'
import { languageName } from './language'
import type { FileSummary } from './fileSummary'
import { renderSummaryList } from './summaryGrouping'
import { diffCharBudget } from './diffCoverage'
import { estimateTokens, RESERVED_OUTPUT_TOKENS } from '../promptSize'

/**
 * The typed result of the daily-summary feature: a one-line headline plus the bullets describing
 * what landed **that day**.
 *
 * It used to carry a third field, `today`, holding suggested next steps inferred from the current
 * uncommitted work. That was a stand-up briefing, not a record of a day: asking for Monday's summary
 * produced a section about what is uncommitted *now*, which is neither Monday nor a fact about it.
 * Once the archive became browsable by date, a briefing describing two different moments could not
 * be read back honestly — so the day is all there is.
 */
export interface DailySummary {
  /** A single-sentence recap of the day (e.g. "Shipped the daily-summary archive"). */
  headline: string
  /** Bullet points describing what was accomplished that day, grounded in the actual commits. */
  highlights: string[]
}

export const DAILY_SUMMARY_INSTRUCTION = `You are a focused engineering assistant writing a short record of ONE day's work on ONE git repository.

You are given the commits that landed on the project's main branch that day, and a summary of EVERY file those commits touched (read from the code, not from the commit messages). From these, produce:
- headline: a single, plain sentence recapping the day. No trailing period is required.
- highlights: 2-6 bullet points summarizing what was actually accomplished. Group the files by the area they serve into one outcome-focused bullet per theme, rather than restating every commit or every file. Describe impact ("added X", "fixed Y"), not commit hashes or paths.

Rules (STRICT):
- Describe ONLY that day. Do not speculate about what comes next, do not propose follow-up work, and do not mention anything that is not in the commits you were given.
- Base every statement ONLY on the provided commits and file summaries. Do not fabricate features, tickets, or file names that are not present.
- Prefer the file summaries over the commit subjects when the two disagree: the summaries were read from the actual change, the subjects are the author's claim about it.
- Keep each bullet to one short line — a past-tense phrase, no sub-lists, no markdown formatting inside a bullet.
- Never mention that you were given summaries, or how you were asked to work. This is a record, not a report about writing one.
- Write ALL text in the language requested by the user prompt.`

/**
 * What the reduce call is given: the day's commits as the narrative spine, and a summary of every
 * file those commits touched as the evidence.
 *
 * The file summaries are what make this worth more than reading `git log`. A commit subject is the
 * author's own claim about their change; it is often accurate, sometimes stale, and — on a day of
 * `wip` and `fix review comments` commits — says nothing at all. The per-file summaries are read
 * from the code itself, so the record describes what actually landed.
 */
export interface DailySummaryInput {
  repoName: string
  /** The branch the day was read from — the main branch, not whatever is checked out. */
  branch: string
  /** The day being summarized, `YYYY-MM-DD`. */
  date: string
  /** Non-merge commits that landed that day, newest first. */
  commits: AiActivityCommit[]
  /** One entry per file those commits touched. A file whose summary call failed has empty
   * `intent`/`area`. */
  summaries: FileSummary[]
  language: string
  /** True when the day held more commits than the backend's cap, so the model can hedge. */
  truncated?: boolean
  contextTokens?: number
}

/** JSON Schema constraining the structured output to {@link DailySummary}. Root is an object (many
 * providers reject a bare-array root under strict mode). */
export const DAILY_SUMMARY_SCHEMA: JsonSchema = {
  name: 'daily_summary',
  schema: {
    type: 'object',
    properties: {
      headline: {
        type: 'string',
        description: 'One-sentence recap of the day.',
      },
      highlights: {
        type: 'array',
        description: 'What was accomplished that day, one short bullet each.',
        items: { type: 'string' },
      },
    },
    required: ['headline', 'highlights'],
    additionalProperties: false,
  },
  strict: true,
}

/** Renders one commit as a compact prompt line: subject, change volume, and body when present. */
function formatCommit(commit: AiActivityCommit): string {
  const stats = `(${commit.filesChanged} files, +${commit.insertions}/-${commit.deletions})`
  const base = `- ${commit.subject} ${stats}`
  const body = commit.body.trim()
  return body ? `${base}\n    ${body.replace(/\n/g, '\n    ')}` : base
}

/**
 * Everything the prompt carries besides the file-summary list.
 *
 * Note what is absent: the working tree. The uncommitted changes describe *now*, and this is a
 * record of a past day — feeding them in is what used to put today's work in yesterday's briefing.
 */
function buildHeader(input: DailySummaryInput): string {
  const language = languageName(input.language)
  const commitsSection = input.commits.map(formatCommit).join('\n')
  const truncatedNote = input.truncated
    ? '\n\nNote: only the most recent commits are shown; there were more that day.'
    : ''

  return `Repository: ${input.repoName} (branch: ${input.branch})
Day being summarized: ${input.date}
Write the entire record in ${language}.

Commits that landed that day (newest first):
${commitsSection}${truncatedNote}`
}

/** Builds the user-turn prompt: the day's commits as the header, then a summary of every file they
 * touched — trimmed to fit the model's window by `renderSummaryList`, which drops detail before it
 * drops files. */
export function buildDailySummaryPrompt(input: DailySummaryInput): string {
  const header = buildHeader(input)
  const budget = diffCharBudget({
    instruction: DAILY_SUMMARY_INSTRUCTION,
    envelopeTokens: estimateTokens(header),
    contextTokens: input.contextTokens,
    reservedOutputTokens: RESERVED_OUTPUT_TOKENS,
  })

  return `${header}

All ${input.summaries.length} files changed that day:
${renderSummaryList(input.summaries, budget)}

Produce the record of ${input.date} as JSON: a headline and the day's highlights.`
}

/** Coerces an unknown value into a clean string bullet list: keeps non-empty trimmed strings. */
function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter((v) => v.length > 0)
}

/** Parses the model's response into a {@link DailySummary}. Tolerates prose/```json fences around
 * the object so the same parser works whether or not the provider honored `response_format`. Throws
 * on anything without a usable object so callers surface a clear error. */
export function parseDailySummary(raw: string): DailySummary {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end <= start) {
    throw new Error('AI summary response did not contain JSON')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw.slice(start, end + 1))
  } catch {
    throw new Error('AI summary response was not valid JSON')
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('AI summary response was not a JSON object')
  }

  const record = parsed as Record<string, unknown>
  const headline = typeof record.headline === 'string' ? record.headline.trim() : ''
  // `yesterday` is what the schema used to call this list; a model prompted from a cached or stale
  // instruction can still answer with it, and dropping the day's content over a key name would be a
  // poor trade.
  const highlights = toStringList(record.highlights ?? record.yesterday)

  if (!headline && highlights.length === 0) {
    throw new Error('AI summary response was empty')
  }
  return { headline, highlights }
}

/**
 * Completion feature: turn one day's landed work into a short record, using structured JSON output.
 *
 * The **reduce** half of the daily summary — see `composeDailySummary.ts` for the map phase that
 * feeds it. Structured output rather than a stream for the same reason the commit message uses one:
 * this text is stored and re-read weeks later, so a reasoning model's deliberation leaking into it
 * is a permanent defect, not a transient one.
 */
export const dailySummaryFeature: CompletionFeature<DailySummaryInput, DailySummary> = {
  id: 'daily-summary',
  kind: 'completion',
  instruction: DAILY_SUMMARY_INSTRUCTION,
  temperature: 0.3,
  schema: DAILY_SUMMARY_SCHEMA,
  buildPrompt: buildDailySummaryPrompt,
  parse: parseDailySummary,
}
