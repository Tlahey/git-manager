import type { StreamingFeature } from '../runtime'
import { diffCharBudget } from './diffCoverage'
import type { FileSummary } from './fileSummary'
import { languageName } from './language'
import { renderSummaryList } from './summaryGrouping'
import { estimateTokens } from '../promptSize'

/** Which of the two things is being explained. Both read the same way — a list of described files —
 * so they share one feature, discriminated here, exactly as the code review shares one across its
 * working-tree and branch scopes. */
export type SummaryExplanationScope = 'branch' | 'commit'

/** The commit being explained, for `commit` scope. */
export interface SummaryExplanationCommit {
  shortOid: string
  subject: string
  body?: string
  author?: string
  date?: string
}

export interface SummaryExplanationInput {
  scope: SummaryExplanationScope
  repoName: string
  /** One entry per changed file. A file whose summary call failed has empty `intent`/`area`. */
  summaries: FileSummary[]
  /** `branch` scope: the branch's name and the subjects of its commits. */
  branch?: string
  branchCommits?: string[]
  /** `commit` scope: the commit itself. */
  commit?: SummaryExplanationCommit
  /** BCP-47-ish language tag (`'fr'` / `'en'`) the explanation should be written in. */
  language?: string
  contextTokens?: number
}

/**
 * One instruction for both scopes.
 *
 * Every rule about a truncated diff is gone, and that is the substantive change rather than a
 * tidy-up. The instructions this replaces each carried a paragraph forbidding the model from
 * mentioning what it could not read — a rule that only exists because the model *was* being shown a
 * fraction and would otherwise open with an apology for it. Here every file arrives described, so
 * there is nothing to hide and no temptation to narrate.
 *
 * What is kept from both: describe rather than review, and never call something missing merely
 * because it is not in front of you.
 */
export const SUMMARY_EXPLANATION_INSTRUCTION = `You are an expert software engineer explaining a set of changes to a developer who is looking at it and does not know it yet.

You are given EVERY changed file, each with a one-clause summary of what its change does and the area it serves. This list is complete.

Output rules (STRICT):
- Return ONLY the explanation as GitHub-flavored Markdown — no preamble, no title, no surrounding code fences.
- Start with a single bold sentence answering "what is this for?", scoped by the whole file list.
- Then a "## What changed" section: 3 to 6 bullets, each one coherent area of change (a module, a layer, a concern), naming the files or directories it touches with backticks. Group files that share an area into one bullet — a file-by-file list is something the reader can already see.
- Then a "## Worth knowing" section: 1 to 3 bullets for what a reader should be aware of — a breaking change, a migration, a dependency added, a behavior change that is not obvious from the file names. Write "- Nothing out of the ordinary." when there is no such surprise; never pad this section.
- When explaining a BRANCH, scope the opening sentence by its commit subjects as well as its files, and do not restate the commit list.
- When explaining a COMMIT, do not paraphrase its own message back: the reader has it. Say what the change does that the subject line does not already say.
- A file whose summary is empty could not be read. Account for it from its path if you can, or leave it out of the bullets rather than inventing what it does.
- Base every statement ONLY on what you are given. Do not invent tickets, tests, or intentions that are not evidenced.
- NEVER state that something is missing, absent, or not done merely because you cannot see it — a guard, a test, a call site may exist in a file whose summary did not mention it. Absence of evidence is not evidence of absence.
- Describe, do not review: no praise, no suggestions, no "consider refactoring".
- Keep the whole answer under 300 words.
- Write the entire explanation in the language requested below.`

/** The header identifying what is being explained — the only part that differs between scopes. */
function buildHeader(input: SummaryExplanationInput): string {
  if (input.scope === 'commit') {
    const c = input.commit
    let header = `Repository: ${input.repoName}\nCommit ${c?.shortOid ?? ''}: ${c?.subject ?? ''}\n`
    if (c?.body?.trim()) header += `\nIts own message body:\n${c.body.trim()}\n`
    if (c?.author) header += `Author: ${c.author}\n`
    return header
  }

  let header = `Repository: ${input.repoName}\nBranch: ${input.branch ?? ''}\n`
  const commits = input.branchCommits ?? []
  if (commits.length > 0) {
    header += `\nIts commits (newest first):\n${commits.map((s) => `- ${s}`).join('\n')}\n`
  }
  return header
}

export function buildSummaryExplanationPrompt(input: SummaryExplanationInput): string {
  const header = buildHeader(input)
  const budget = diffCharBudget({
    instruction: SUMMARY_EXPLANATION_INSTRUCTION,
    envelopeTokens: estimateTokens(header),
    contextTokens: input.contextTokens,
  })

  const subject =
    input.scope === 'commit' ? 'this commit' : `branch \`${input.branch ?? ''}\``

  return `${header}
All ${input.summaries.length} changed files:
${renderSummaryList(input.summaries, budget)}

Explain ${subject}. Write the explanation in ${languageName(input.language)}.`
}

/**
 * Streaming feature: explain a branch or a commit from per-file summaries.
 *
 * Streaming rather than a completion because the answer is prose a human reads as it arrives, and
 * the wait is worth filling — unlike the commit message, whose JSON grammar exists to stop a
 * reasoning model narrating into the box.
 */
export const summaryExplanationFeature: StreamingFeature<SummaryExplanationInput> = {
  id: 'summary-explanation',
  kind: 'streaming',
  instruction: SUMMARY_EXPLANATION_INSTRUCTION,
  temperature: 0.2,
  buildPrompt: buildSummaryExplanationPrompt,
}
