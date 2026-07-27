import type { CommitConvention } from '../config'
import type { CompletionFeature } from '../runtime'
import { buildCommitStyleSection } from './commitConvention'
import {
  COMMIT_MESSAGE_SCHEMA,
  parseCommitMessage,
  type CommitMessageDraft,
} from './commitMessage'
import type { FileSummary } from './fileSummary'
import { renderSummaryList } from './summaryGrouping'
import { diffCharBudget } from './diffCoverage'
import { estimateTokens, RESERVED_OUTPUT_TOKENS } from '../promptSize'

export interface SummaryCommitMessageInput {
  repoName: string
  branch: string
  /** One entry per staged file. A file whose summary call failed has empty `intent`/`area`. */
  summaries: FileSummary[]
  commitConvention?: CommitConvention | null
  recentCommits?: string[]
  commitInstructions?: string
  commitPattern?: string
  contextTokens?: number
}

/**
 * Writes one commit message from per-file summaries rather than from a budgeted diff.
 *
 * The single-shot commit message has a specific failure that matters more than the others': its
 * subject is written into the repository's history under the user's name. Given a staged change too
 * large for the window, it read whichever files sorted first and wrote a subject about *those* — so
 * a change that also rewrote the backend got committed as `fix(ui): …`, permanently, and looking
 * deliberate. The instruction told it to scope the subject over what it had not read, which is
 * asking a model to describe something it was never shown.
 *
 * Here it is shown something about every staged file, so the subject can cover the change rather
 * than a sample of it. That is the whole difference: the rules below are the single-shot feature's
 * rules minus the ones about coping with a truncated diff.
 */
export const SUMMARY_COMMIT_MESSAGE_INSTRUCTION = `You are an expert software engineer writing a single Git commit message for a set of STAGED changes, following the Conventional Commits specification.

You are given EVERY staged file, each with a one-clause summary of what its change does and the area it serves. This list is complete: nothing is hidden from you, so the message must describe the whole change rather than part of it.

Answer with a JSON object carrying two fields, "subject" and "body".

Rules (STRICT):
- "subject" is the subject line: <type>(<scope>): <description>
  - <type> is chosen by intent: feat (new capability), fix (bug fix), refactor (behavior-preserving restructure), perf, docs, style, test, build, ci, chore.
  - <type> reflects the change as a whole. When the files serve one purpose, name that purpose; when they genuinely span unrelated areas, choose the type of the dominant one and omit <scope> rather than inventing a scope that covers everything.
  - <scope> is optional, lower-case, and only used when one area really does contain the change.
  - <description> is imperative ("add", "fix", "remove"), lower-case, no trailing period, and at most 72 characters including the type and scope.
- "body" explains what changed and why, in one short paragraph or a few "- " bullets. Cover the areas the summaries describe, grouped by purpose rather than listed file by file — a reader wants the change, not the file list they can already see. Leave it empty for a change small enough that the subject says everything.
- Never mention these summaries, the fact that you were given summaries, or how you were asked to work. The message is a commit, not a report about writing one.`

/** Everything the prompt carries besides the summary list. */
function buildHeader(input: SummaryCommitMessageInput): string {
  return `Repository: ${input.repoName} (branch: ${input.branch})
${buildCommitStyleSection({
  convention: input.commitConvention,
  recentCommits: input.recentCommits,
  userInstructions: input.commitInstructions,
  pattern: input.commitPattern,
})}`
}

export function buildSummaryCommitMessagePrompt(input: SummaryCommitMessageInput): string {
  const header = buildHeader(input)
  const budget = diffCharBudget({
    instruction: SUMMARY_COMMIT_MESSAGE_INSTRUCTION,
    envelopeTokens: estimateTokens(header),
    contextTokens: input.contextTokens,
    reservedOutputTokens: RESERVED_OUTPUT_TOKENS,
  })

  return `${header}

All ${input.summaries.length} staged files:
${renderSummaryList(input.summaries, budget)}

Write the commit message for this change as a whole.`
}

/**
 * Completion feature: one commit message from per-file summaries.
 *
 * Shares {@link COMMIT_MESSAGE_SCHEMA} and {@link parseCommitMessage} with the single-shot feature —
 * the answer is the same document, only the evidence differs. It keeps the schema for the same
 * reason that one does: grammar-constrained decoding forces the first token to be `{`, so a
 * reasoning model has no prose phase in which to leak its deliberation into the commit box.
 *
 * Unlike the commit *plan*, the answer's length is not a property of the question — one message is
 * one message whether it describes 12 files or 200 — so this takes the ordinary prose reserve.
 */
export const summaryCommitMessageFeature: CompletionFeature<
  SummaryCommitMessageInput,
  CommitMessageDraft
> = {
  id: 'summary-commit-message',
  kind: 'completion',
  instruction: SUMMARY_COMMIT_MESSAGE_INSTRUCTION,
  temperature: 0.3,
  schema: COMMIT_MESSAGE_SCHEMA,
  buildPrompt: buildSummaryCommitMessagePrompt,
  parse: parseCommitMessage,
}
