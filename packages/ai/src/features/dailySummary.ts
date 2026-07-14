import type { AiActivity, JsonSchema } from '../config'
import type { CompletionFeature } from '../runtime'

/** The typed result of the daily-summary feature: a one-line headline plus two bullet lists — what
 * was accomplished in the recent window ("yesterday") and a short, actionable plan for the day
 * ("today"). This is exactly the JSON shape the schema below constrains the model to. */
export interface DailySummary {
  /** A single-sentence recap of the period (e.g. "Shipped the daily-summary feature and fixed two
   * flaky tests"). */
  headline: string
  /** Bullet points describing the work done in the window, grounded in the actual commits. */
  yesterday: string[]
  /** Bullet points proposing what to work on next, inferred from in-flight/uncommitted work and the
   * trajectory of recent commits. */
  today: string[]
}

export const DAILY_SUMMARY_INSTRUCTION = `You are a focused engineering assistant writing a short daily stand-up briefing for ONE git repository.

You are given the commits authored in a recent window (the "yesterday" work) and a snapshot of the currently uncommitted changes (work in flight). From these, produce:
- headline: a single, plain sentence recapping the period. No trailing period is required.
- yesterday: 2-6 bullet points summarizing what was actually accomplished. Group related commits into one outcome-focused bullet rather than restating every commit verbatim. Describe impact ("added X", "fixed Y"), not commit hashes.
- today: 2-5 bullet points proposing concrete next steps. Ground them in the uncommitted/in-flight work and the trajectory of the recent commits (e.g. "finish and commit the in-progress changes to <area>", "add tests for <feature> shipped yesterday"). If there is nothing to infer, suggest a sensible small next step; never invent work that has no basis in the data.

Rules (STRICT):
- Base every statement ONLY on the provided commits and pending changes. Do not fabricate features, tickets, or file names that are not present.
- Keep each bullet to one short line — an imperative or past-tense phrase, no sub-lists, no markdown formatting inside a bullet.
- If there are no commits in the window, say so plainly in the headline and leave "yesterday" empty; still propose "today" steps from any pending changes.
- Write ALL text in the language requested by the user prompt.`

/** JSON Schema constraining the structured output to {@link DailySummary}. Root is an object (many
 * providers reject a bare-array root under strict mode). */
export const DAILY_SUMMARY_SCHEMA: JsonSchema = {
  name: 'daily_summary',
  schema: {
    type: 'object',
    properties: {
      headline: {
        type: 'string',
        description: 'One-sentence recap of the period.',
      },
      yesterday: {
        type: 'array',
        description: 'What was accomplished in the window, one short bullet each.',
        items: { type: 'string' },
      },
      today: {
        type: 'array',
        description: 'Concrete next steps proposed for today, one short bullet each.',
        items: { type: 'string' },
      },
    },
    required: ['headline', 'yesterday', 'today'],
    additionalProperties: false,
  },
  strict: true,
}

/** Human-readable language name for the prompt, so the model writes the briefing in the UI language
 * rather than defaulting to English. */
function languageName(tag: string | undefined): string {
  switch (tag) {
    case 'fr':
      return 'French'
    case 'en':
      return 'English'
    default:
      return 'English'
  }
}

/** Renders one commit as a compact prompt line: subject, change volume, and body when present. */
function formatCommit(commit: AiActivity['commits'][number]): string {
  const stats = `(${commit.filesChanged} files, +${commit.insertions}/-${commit.deletions})`
  const base = `- ${commit.subject} ${stats}`
  const body = commit.body.trim()
  return body ? `${base}\n    ${body.replace(/\n/g, '\n    ')}` : base
}

/** Builds the user-turn prompt: the recent commits (the "done" evidence) and the uncommitted work
 * (the "in flight" evidence), plus the target language. */
export function buildDailySummaryPrompt(activity: AiActivity): string {
  const language = languageName(activity.language)

  const commitsSection =
    activity.commits.length > 0
      ? activity.commits.map(formatCommit).join('\n')
      : '(no commits in this window)'

  const pendingSection =
    activity.pending.length > 0
      ? activity.pending.map((p) => `- ${p.path} (${p.status})`).join('\n')
      : '(working tree is clean)'

  const truncatedNote = activity.truncated
    ? '\n\nNote: only the most recent commits are shown; there were more in the window.'
    : ''

  return `Repository: ${activity.repoName} (branch: ${activity.branch})
Write the entire briefing in ${language}.

Commits authored in the window (newest first):
${commitsSection}${truncatedNote}

Uncommitted / in-flight changes:
${pendingSection}

Produce the daily briefing as JSON: a headline, what was done ("yesterday"), and what to plan ("today").`
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
  const yesterday = toStringList(record.yesterday)
  const today = toStringList(record.today)

  if (!headline && yesterday.length === 0 && today.length === 0) {
    throw new Error('AI summary response was empty')
  }
  return { headline, yesterday, today }
}

/** Completion feature: turn a repo's recent git activity into a short "yesterday / today" briefing,
 * using structured JSON output. */
export const dailySummaryFeature: CompletionFeature<AiActivity, DailySummary> = {
  id: 'daily-summary',
  kind: 'completion',
  instruction: DAILY_SUMMARY_INSTRUCTION,
  temperature: 0.3,
  schema: DAILY_SUMMARY_SCHEMA,
  buildPrompt: buildDailySummaryPrompt,
  parse: parseDailySummary,
}
