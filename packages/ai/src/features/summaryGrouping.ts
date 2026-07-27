import type { CommitConvention } from '../config'
import type { CompletionFeature } from '../runtime'
import { buildCommitStyleSection } from './commitConvention'
import { FILE_GROUPING_SCHEMA, groupingOutputTokens, parseCommitPlan } from './fileGrouping'
import type { ProposedCommit } from './fileGrouping'
import type { FileSummary } from './fileSummary'
import { diffCharBudget } from './diffCoverage'
import { estimateTokens } from '../promptSize'

export interface SummaryGroupingInput {
  repoName: string
  branch: string
  /** One entry per changed file, in the order they should be considered. A file whose summary call
   * failed still appears, with empty `intent`/`area` — see the instruction's fallback rule. */
  summaries: FileSummary[]
  commitConvention?: CommitConvention | null
  recentCommits?: string[]
  commitInstructions?: string
  commitPattern?: string
  contextTokens?: number
}

/**
 * The **reduce** half of the two-phase planner.
 *
 * The single-shot planner's instruction spends four paragraphs managing a truncated diff: it has to
 * declare the file list authoritative over the diff, and tell the model that a file it could not
 * read must still be placed. None of that applies here — every file arrives with a summary, so the
 * evidence is complete by construction and the instruction can simply be about grouping.
 *
 * That removed tension is the point. The old prompt said "you have not read these, do not reason
 * about the contents of them" a few lines after "every file MUST appear in exactly one commit", and
 * a model resolving that contradiction by dropping the unread files is a plan with holes in it.
 */
export const SUMMARY_GROUPING_INSTRUCTION = `You are an expert software engineer splitting a set of UNCOMMITTED changes into a series of clean, atomic commits.

You are given EVERY changed file, each with a one-clause summary of what its change does and the area it serves. This list is complete: there is no diff you have not seen, and nothing is hidden from you.

Rules (STRICT):
- Coverage: every file listed MUST appear in exactly ONE commit. Do not omit a file, do not place one in two commits, and do not invent a path. Use the given paths verbatim. Count them before you answer: the number of paths in your plan must equal the number of files given.
- Atomicity: group files that serve ONE logical change. Files sharing an area almost always belong together; a test belongs with the code it covers, a locale file with the feature that added its keys.
- Ordering: order the commits so applying them in sequence stays coherent — a refactor before the feature built on it, a dependency bump before the code needing it.
- Minimality: prefer the fewest commits that stay atomic. One change means one commit.
- A file whose summary is empty could not be read. Place it from its path anyway: beside the module it tests, with the feature whose area its directory matches, or failing that in the commit covering the broadest related area.
- Messages: each commitMessage follows Conventional Commits — <type>(<scope>): <description>, imperative mood, lower-case description, no trailing period, max 72 characters. <scope> is optional.

Types: feat, fix, refactor, perf, docs, style, test, build, ci, chore.`

/** One summary line. `detail` is what gets dropped first when the window is tight — the path and its
 * status never are, because they are the set being partitioned. */
function summaryLine(summary: FileSummary, detail: 'full' | 'area' | 'none'): string {
  const base = `- ${summary.path} (${summary.status})`
  if (detail === 'none') return base
  const area = summary.area ? `[${summary.area}]` : ''
  if (detail === 'area') return area ? `${base} — ${area}` : base
  const parts = [area, summary.intent].filter(Boolean).join(' ')
  return parts ? `${base} — ${parts}` : base
}

/**
 * Renders the summary list at the most informative detail level that fits.
 *
 * Degrading beats overflowing: an overflow drops tokens from the *start*, taking the instruction
 * with it, and the whole point of this phase is that the model sees something about every file. So
 * the intents go before the areas, and the areas before the list itself is touched — which it never
 * is, since a path missing from the list is a file that cannot be placed at all.
 */
export function renderSummaryList(summaries: FileSummary[], budgetChars: number): string {
  for (const detail of ['full', 'area', 'none'] as const) {
    const rendered = summaries.map((s) => summaryLine(s, detail)).join('\n')
    if (rendered.length <= budgetChars || detail === 'none') return rendered
  }
  /* c8 ignore next */
  return ''
}

/** Everything the prompt carries besides the summary list. */
function buildHeader(input: SummaryGroupingInput): string {
  return `Repository: ${input.repoName} (branch: ${input.branch})
${buildCommitStyleSection({
  convention: input.commitConvention,
  recentCommits: input.recentCommits,
  userInstructions: input.commitInstructions,
  pattern: input.commitPattern,
})}`
}

export function buildSummaryGroupingPrompt(input: SummaryGroupingInput): string {
  const header = buildHeader(input)
  const budget = diffCharBudget({
    instruction: SUMMARY_GROUPING_INSTRUCTION,
    envelopeTokens: estimateTokens(header),
    contextTokens: input.contextTokens,
    reservedOutputTokens: summaryGroupingOutputTokens(input),
  })

  return `${header}

All ${input.summaries.length} changed files:
${renderSummaryList(input.summaries, budget)}

Split these ${input.summaries.length} files into atomic commits. Every path above must appear exactly once in your plan.`
}

/** Same arithmetic as the single-shot planner's: the answer restates every path verbatim. */
export function summaryGroupingOutputTokens(input: SummaryGroupingInput): number {
  return groupingOutputTokens(input.summaries.map((s) => s.path))
}

/** Completion feature: turn per-file summaries into an ordered plan of atomic commits. Shares the
 * schema and the parser with the single-shot planner — only the evidence differs. */
export const summaryGroupingFeature: CompletionFeature<SummaryGroupingInput, ProposedCommit[]> = {
  id: 'summary-grouping',
  kind: 'completion',
  instruction: SUMMARY_GROUPING_INSTRUCTION,
  temperature: 0.2,
  schema: FILE_GROUPING_SCHEMA,
  buildPrompt: buildSummaryGroupingPrompt,
  parse: parseCommitPlan,
  reservedOutputTokens: summaryGroupingOutputTokens,
}
