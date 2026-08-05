import type { StreamingFeature } from '../runtime'
import { diffCharBudget } from './diffCoverage'
import type { FileSummary } from './fileSummary'
import { renderSummaryList } from './summaryGrouping'
import { estimateTokens } from '../promptSize'

export interface SummaryPrDescriptionInput {
  repoName: string
  branch: string
  /** The branch the pull request targets, when known. */
  baseRef?: string
  /** Subjects of the commits the pull request contains, newest first. */
  branchCommits?: string[]
  /** One entry per changed file. A file whose summary call failed has empty `intent`/`area`. */
  summaries: FileSummary[]
  /** The repo's PR template to fill in, or `null` for the default Summary/Changes/Test plan. */
  templateContent: string | null
  contextTokens?: number
}

/**
 * Writes a pull request body from per-file summaries.
 *
 * Kept apart from {@link summaryExplanationFeature} rather than folded in as a fourth scope, because
 * this is not an explanation. It has a different reader (whoever reviews the PR, and everyone who
 * finds it later), a different output contract (a **template** whose headings must survive verbatim),
 * and it is **published** — which is why its instruction still forbids mentioning what it could not
 * read in stronger terms than an explanation needs. Sharing a feature would mean one instruction
 * carrying both sets of rules and a scope check on half of them.
 *
 * The truncation rule is nonetheless the one thing this loses, and it is the point: the old prompt
 * budgeted the template *and* the range diff out of one pool, so on a small window the template —
 * the feature's most visible rule — was what fell out of the prompt's start. Nothing competes with
 * the template now except a list of one-line summaries.
 */
export const SUMMARY_PR_DESCRIPTION_INSTRUCTION = `You are an expert software engineer writing the DESCRIPTION (body) of a GitHub pull request that bundles a whole branch's changes.

You are given the pull request's commit list and EVERY file it touches, each with a one-clause summary of what its change does and the area it serves. This list is complete: describe the change as a whole.

Output rules (STRICT):
- Return ONLY the pull-request description as GitHub-flavored Markdown — no preamble, no explanation, no surrounding code fences, no title line.
- Be concrete and grounded in the commits and summaries you are given. Do not invent changes, tickets, or tests that are not evidenced.
- Write in an even, factual tone. Prefer short bullet points over long paragraphs. Group files that share an area rather than listing them one by one — a reviewer can already see the file list.
- This description will be PUBLISHED on a pull request. Never mention these summaries, how you were asked to work, or anything about the process — you are writing as the change's author.
- A file whose summary is empty could not be read. Account for it from its path if you can, or leave it out rather than inventing what it does.
- NEVER state that something is missing, absent, or not done merely because you cannot see it — a guard, a test, or a call site may exist in a file whose summary did not mention it. Absence of evidence is not evidence of absence.
- When a template is provided, fill it in: keep every heading and structural element exactly as given, replacing only the placeholder/prompt text under each with real content. Leave a section briefly noted as not applicable rather than deleting its heading. Do not add headings the template does not have.
- When no template is provided, structure the description as: a one-paragraph "## Summary", then "## Changes" (bulleted), then "## Test plan" (bulleted; write "- Not covered by automated tests" if nothing evidences one).`

/** The template block, or the instruction to use the default structure. */
function templateSection(templateContent: string | null): string {
  return templateContent?.trim()
    ? `\nFill in the following pull-request template, preserving its headings and structure exactly:\n\n--- TEMPLATE ---\n${templateContent}\n--- END TEMPLATE ---`
    : `\nNo template is provided — write the description using the default Summary / Changes / Test plan structure.`
}

function buildHeader(input: SummaryPrDescriptionInput): string {
  let header = `Repository: ${input.repoName}\nBranch: ${input.branch}`
  if (input.baseRef) header += ` → base: ${input.baseRef}`
  header += '\n'

  const commits = input.branchCommits ?? []
  if (commits.length > 0) {
    header += `\nCommits in this pull request (newest first):\n${commits
      .map((c) => `- ${c}`)
      .join('\n')}\n`
  }
  return header
}

export function buildSummaryPrDescriptionPrompt(input: SummaryPrDescriptionInput): string {
  const header = buildHeader(input)
  const template = templateSection(input.templateContent)

  // The template is measured with the header even though it is written last: what matters to a
  // budget is size, not order.
  const budget = diffCharBudget({
    instruction: SUMMARY_PR_DESCRIPTION_INSTRUCTION,
    envelopeTokens: estimateTokens(header + template),
    contextTokens: input.contextTokens,
  })

  return `${header}
All ${input.summaries.length} changed files:
${renderSummaryList(input.summaries, budget)}
${template}`
}

/** Streaming feature: turn a branch's commits and per-file summaries into a PR description. */
export const summaryPrDescriptionFeature: StreamingFeature<SummaryPrDescriptionInput> = {
  id: 'summary-pr-description',
  kind: 'streaming',
  instruction: SUMMARY_PR_DESCRIPTION_INSTRUCTION,
  // A touch more prose latitude than an explanation, still grounded.
  temperature: 0.4,
  buildPrompt: buildSummaryPrDescriptionPrompt,
}
