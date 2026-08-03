import type { JsonSchema } from '../config'
import type { CompletionFeature } from '../runtime'
import { budgetDiff } from './diffBudget'
import { diffCharBudget } from './diffCoverage'
import { estimateTokens } from '../promptSize'
import { languageName } from './language'

/**
 * What one file's change is, as the model sees it. The **grouping key** the reduce step leans on.
 *
 * Note what is *not* here: the path. It is never asked of the model and never read back from it —
 * the caller already knows which file it sent, and pairs the answer with it. That is the whole
 * reason this phase cannot mangle or invent a path, which is one of the two failures the single-shot
 * prompt suffers from at scale.
 */
export interface FileSummaryResult {
  /** What the change does, one short clause — "adds a merge-parent lookup", not a diff recap. */
  intent: string
  /** The feature or area it belongs to. The label the reduce step groups on, so it must be a
   * *concept* ("AI commit batching", "window dragging"), never a directory. */
  area: string
}

/** A {@link FileSummaryResult} paired back with the file it describes. */
export interface FileSummary extends FileSummaryResult {
  path: string
  status: string
}

export interface FileSummaryInput {
  path: string
  status: string
  /** This file's own section of the working diff — see `splitDiffByFile`. */
  diff: string
  contextTokens?: number
  /**
   * Language the two fields should be written in, when the consumer's output is prose the user
   * reads (the daily briefing). Left undefined by the commit-writing paths on purpose: a commit
   * message follows the repository's convention, which is usually English, and translating the
   * evidence that feeds it would be a change nobody asked for.
   *
   * It matters because these summaries are the *only* thing the composing call sees. Asking that
   * call for French while handing it English clauses gets French sentences with English fragments
   * surviving verbatim — the area labels especially.
   */
  language?: string
}

/**
 * Room one summary needs. Small and flat, unlike the plan's: two short strings and their JSON.
 *
 * Generous enough that a model which pads its `intent` still closes the object — a truncated
 * summary is a parse failure for that file, and one file failing must not cost the whole plan.
 */
export const FILE_SUMMARY_OUTPUT_TOKENS = 160

export const FILE_SUMMARY_INSTRUCTION = `You are summarizing ONE changed file so that it can later be grouped with the other files that belong to the same logical change.

Answer with two fields:
- intent: what this change does, one short clause in the imperative ("add a merge-parent lookup", "translate the panel labels"). Not a recap of the diff, not a list of symbols.
- area: the feature or concern this file serves, 2-4 words. This is the grouping key, so it must name a CONCEPT, not a directory or a language — "AI commit batching", not "src/hooks" or "Rust backend". Two files that belong in the same commit must get the same area, so prefer the obvious general name over an inventive specific one.

Judge the file by what its change is for, not by where it lives: a test, its implementation and the locale strings it added all share one area.`

/** Constrains the model to the two fields. Strict, and no path field to get wrong. */
export const FILE_SUMMARY_SCHEMA: JsonSchema = {
  name: 'file_summary',
  schema: {
    type: 'object',
    properties: {
      intent: {
        type: 'string',
        description: 'What this change does, one short imperative clause.',
      },
      area: { type: 'string', description: 'The feature or concern it serves, 2-4 words.' },
    },
    required: ['intent', 'area'],
    additionalProperties: false,
  },
  strict: true,
}

export function buildFileSummaryPrompt(input: FileSummaryInput): string {
  const language = input.language ? `\nWrite both fields in ${languageName(input.language)}.` : ''
  const header = `File: ${input.path} (${input.status})${language}`
  const budgeted = budgetDiff(
    input.diff,
    diffCharBudget({
      instruction: FILE_SUMMARY_INSTRUCTION,
      envelopeTokens: estimateTokens(header),
      contextTokens: input.contextTokens,
      reservedOutputTokens: FILE_SUMMARY_OUTPUT_TOKENS,
    })
  )

  return `${header}

Diff:

--- DIFF ---
${budgeted.text}
--- END DIFF ---`
}

/**
 * Reads the two fields back, tolerating a fenced or prose-wrapped object the way `parseCommitPlan`
 * does — "the provider honored the schema" is not something to count on across providers.
 *
 * Throws on anything unusable so the orchestrator can record *this file* as unsummarized and carry
 * on: one bad file must degrade to grouping that file by path, not fail the whole plan.
 */
export function parseFileSummary(raw: string): FileSummaryResult {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end <= start) throw new Error('AI summary response did not contain JSON')

  let parsed: unknown
  try {
    parsed = JSON.parse(raw.slice(start, end + 1))
  } catch {
    throw new Error('AI summary response was not valid JSON')
  }

  const record = parsed as Record<string, unknown>
  const intent = typeof record?.intent === 'string' ? record.intent.trim() : ''
  const area = typeof record?.area === 'string' ? record.area.trim() : ''
  if (!intent && !area) throw new Error('AI summary response had neither intent nor area')
  return { intent, area }
}

/**
 * Completion feature: describe one file's change in two short fields.
 *
 * The **map** half of the two-phase commit planner (see `planCommits.ts`). It exists because the
 * single-shot planner has to fit every file's diff in one window, so on a large changeset most files
 * reach the model as a bare path — and a path is not enough to group by meaning. One small call per
 * file removes the window as the limit: each prompt carries exactly one file.
 */
export const fileSummaryFeature: CompletionFeature<FileSummaryInput, FileSummaryResult> = {
  id: 'file-summary',
  kind: 'completion',
  // The one call in the app that earns a second, faster model: seven features run it once per
  // changed file, and its job — two short clauses about one file — is the least demanding thing
  // any of them ask for. Nothing else is marked `fast`, least of all the commit-search verdict,
  // which is the same shape of loop and the opposite kind of work. See `AiFeatureTier`.
  tier: 'fast',
  instruction: FILE_SUMMARY_INSTRUCTION,
  // Lower than the planner's 0.2: this is description, not judgement, and two files that deserve the
  // same `area` need the model to answer the same way twice.
  temperature: 0.1,
  schema: FILE_SUMMARY_SCHEMA,
  buildPrompt: buildFileSummaryPrompt,
  parse: parseFileSummary,
  reservedOutputTokens: () => FILE_SUMMARY_OUTPUT_TOKENS,
}
