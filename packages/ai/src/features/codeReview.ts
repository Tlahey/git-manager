import type { AiContext } from '../config'
import type { StreamingFeature } from '../runtime'
import { budgetDiff, type DiffTierOverrides } from './diffBudget'
import {
  assessDiffCoverage,
  cappedList,
  diffCharBudget,
  notIncludedSection,
  OMITTED_RESERVE_TOKENS,
  type DiffCoverage,
} from './diffCoverage'
import { languageName } from './language'
import { DEFAULT_CONTEXT_TOKENS, estimateTokens } from '../promptSize'

/**
 * The instruction (system prompt) for reviewing a diff.
 *
 * This is the deliberate opposite of the explanation features, whose instructions all end with some
 * form of *"describe, do not review: no praise, no suggestions"*. That rule exists because someone
 * reading a branch in the graph wants to know what it does, not to be argued with. But the other
 * question — *"is this alright?"* — is the one asked right before committing or opening a PR, and
 * nothing in the app answered it.
 *
 * Three choices shape the output, all of them about being *ignorable*:
 *
 * - **Findings are ranked and capped.** A local model handed a diff will find something to say about
 *   every hunk; a list of twelve equal-weight remarks is one nobody reads. Six, worst first.
 * - **Every finding must name a file and say what actually goes wrong.** "Consider adding error
 *   handling" is unfalsifiable and costs the reader more than it gives. A finding that names the
 *   input that breaks can be judged in seconds — and dismissed just as fast when the model is wrong,
 *   which it will sometimes be.
 * - **"Nothing worth flagging" is an allowed answer, and is stated explicitly.** Without that
 *   permission a model invents a concern to justify the request, which is the failure mode that
 *   makes a review tool untrustworthy: once it cries wolf on a clean diff, its real findings stop
 *   being read.
 *
 * The verdict line exists so the panel can be read in one glance without scrolling.
 */
export const CODE_REVIEW_INSTRUCTION = `You are an experienced software engineer reviewing a colleague's changes before they are committed or opened as a pull request. You are reading a diff, not the whole codebase.

Your job is to find what would actually cause a problem — not to comment on everything you see.

Look for, in this order of importance:
1. Bugs: logic that does not do what the surrounding code implies it should, off-by-one errors, inverted conditions, wrong operators.
2. Unhandled cases: null/undefined, empty collections, error paths ignored, promises not awaited, resources not released.
3. Risk: something that can lose data, break existing callers, or that was likely committed by accident (debug output, commented-out code, a hardcoded secret or credential, a stray TODO, an unrelated file).
4. Clarity that will cost someone later: a name that says the wrong thing, duplicated logic that will drift, a comment contradicting its code.

Output rules (STRICT):
- Return ONLY the review as GitHub-flavored Markdown — no preamble, no title, no surrounding code fences.
- Start with a single bold verdict line: what the change does, and whether anything here needs attention before it ships. The verdict is about THE CODE. Never make it about the diff being incomplete, truncated, or hard to read — that is never the headline.
- Then a "## Findings" section: AT MOST 6 bullets, most serious first. Write NOTHING else in this section.
- Start each bullet with a severity tag — **Bug**, **Risk**, or **Nit** — then the file in backticks, then what is wrong and what goes wrong because of it. One or two sentences. Suggest the fix only when it is short enough to state in the same breath.
- EVERY bullet must name a defect in the code. Specifically, a bullet is NOT:
  - a description of a change that is correct. If a change fixes something, improves something, or is simply fine, say nothing about it — approval is not a finding.
  - a remark about your own coverage: what you could not see, what was truncated, what someone should double-check because you lack context. That belongs in the closing line, never in a bullet.
  - a restatement of what the diff does.
- Write exactly "- Nothing worth flagging." when the diff holds no real problem. This is a normal, expected answer on a good change — never manufacture a finding to fill the section, and never pad it with style opinions.
- Do not comment on formatting, import order, or anything a linter or formatter already owns.
- Base every finding ONLY on the diff you are given. You cannot see the rest of the repository: if a concern depends on code that is not in the diff, either say what you would need to check or leave it out. Never invent a function, type, or call site you have not been shown.
- A diff shows only a few lines around each change. NEVER report that something is missing, absent, or not done merely because you cannot see it — a guard, a condition, an early return, a null check, a call site, or a cleanup may sit just outside the few lines you were shown. Absence of evidence is not evidence of absence. Report a missing thing only when the diff proves it is missing: you can see the whole construct it should be part of.
- The prompt may list files under "NOT INCLUDED", and a file's diff may end with a truncation marker. If so, close with ONE short line naming what you did not read. One line, after the Findings section, never a bullet and never the verdict. If you read everything, write no such line.
- Do not restate the change file by file — the reader has the diff open.
- Keep the whole answer under 300 words.
- Write the entire review in the language requested by the user prompt.`

/**
 * How much diff this feature may carry, derived from the model's own context window rather than
 * guessed. See {@link diffCharBudget} for why a fixed character constant was two guesses pretending
 * to be one; this is only the review's instruction plugged into it.
 */
export function reviewDiffBudget(
  contextTokens: number = DEFAULT_CONTEXT_TOKENS,
  envelopeTokens: number = DEFAULT_ENVELOPE_TOKENS
): number {
  return diffCharBudget({ instruction: CODE_REVIEW_INSTRUCTION, contextTokens, envelopeTokens })
}

/**
 * Fallback envelope allowance, used only when the caller has not measured the real one.
 *
 * A flat number here was a bug, not a simplification: on a 50-file changeset the file lists came to
 * ~1280 tokens against an assumed 250, which pushed a prompt sized for a 4096-token window to 4230 —
 * the app warning about an overflow it had produced itself. {@link buildCodeReviewPrompt} therefore
 * measures its own envelope and passes it in; this default only serves callers sizing a hypothetical
 * prompt (and the tests that pin the budget curve).
 */
const DEFAULT_ENVELOPE_TOKENS = 250

/**
 * Cap on the changed-file list in the prompt.
 *
 * It is an enumeration, and its value is not linear: knowing thirty of the files tells a reviewer
 * what kind of change this is, and the next twenty tell them nothing they will act on. Leaving it
 * unbounded spent a fifth of a small window on filenames. (The omitted list has its own cap, for a
 * worse reason — see {@link MAX_LISTED_OMITTED_FILES}.)
 */
const MAX_LISTED_CHANGED_FILES = 30

/**
 * What is being reviewed. The two scopes answer the same question at the two moments it is actually
 * asked — before committing, and before opening a PR — and differ only in what the diff is against,
 * so they share one instruction and one temperature rather than forking into two near-identical
 * feature files.
 */
export type CodeReviewScope = 'working' | 'branch'

export interface CodeReviewInput {
  /** `working`-scope context (worktree vs HEAD) or `range`-scope (`merge-base(base, head)..head`),
   * matching {@link scope}. */
  context: AiContext
  /** Which of the two moments this review is for — it only changes the prompt's framing. */
  scope: CodeReviewScope
  /** BCP-47-ish language tag (`'fr'` / `'en'`) the review should be written in. Populated from app
   * Settings so the prose matches the UI language. */
  language?: string
  /** The model's context window, from the connection settings. Sizes how much diff is sent — see
   * {@link reviewDiffBudget}. Absent falls back to the pessimistic default. */
  contextTokens?: number
  /**
   * Per-path corrections to the reading order — see {@link DiffTierOverrides}.
   *
   * The review is the feature that most needs the escape hatch, because its tier order is an opinion
   * about what deserves attention and the heuristic forms that opinion from filenames alone. A
   * checked-in JSON schema, a hand-written `.min.js`, a dependency bump the author is asking about
   * on purpose: all sort last and are read last, and the model then reviews everything except the
   * thing it was called for. The caller — which is looking at the same file list — can say so.
   */
  tierOverrides?: DiffTierOverrides
}

/** Everything in the prompt that precedes the omitted list and the diff — the part whose size is
 * known before any budgeting happens. Shared so {@link buildCodeReviewPrompt} and
 * {@link assessCodeReviewCoverage} can never disagree about what the envelope costs. */
function buildPromptHeader(input: CodeReviewInput): string {
  const { context, scope, language } = input
  const isBranch = scope === 'branch'

  let header = isBranch
    ? `Repository: ${context.repoName}
Reviewing branch: ${context.branch}${context.baseRef ? ` (against ${context.baseRef})` : ''}
Write the entire review in ${languageName(language)}.
`
    : `Repository: ${context.repoName} (branch: ${context.branch})
Reviewing: uncommitted changes, before they are committed.
Write the entire review in ${languageName(language)}.
`

  // Only meaningful on a branch, and only when the range actually carries commits.
  const commits = context.rangeCommits ?? []
  if (isBranch && commits.length > 0) {
    header += `\nCommits on this branch (newest first):\n${commits.map((c) => `- ${c}`).join('\n')}\n`
  }

  if (context.files.length > 0) {
    // The statuses carry what the diff alone does not: an untracked file is one the author may not
    // have meant to leave behind, which is a finding in its own right.
    header += `\nChanged files:\n${cappedList(
      context.files.map((f) => `${f.path} (${f.status})`),
      MAX_LISTED_CHANGED_FILES
    )}\n`
  }

  return header
}

/** Builds the user-turn prompt: a header naming what is under review, the changed files with their
 * statuses, the branch's commits when there are any, then the (possibly truncated) diff. */
export function buildCodeReviewPrompt(input: CodeReviewInput): string {
  const { context, scope } = input
  const isBranch = scope === 'branch'

  let prompt = buildPromptHeader(input)

  // The diff gets what is left once everything else in this prompt is paid for. Measuring the
  // envelope rather than assuming it is the whole point: guessing it flat produced a prompt 3 %
  // over the very window it was sizing itself against, and then warned the user about it.
  const envelopeTokens = estimateTokens(prompt) + OMITTED_RESERVE_TOKENS

  // Budgeted per file rather than cut at a fixed offset: on a large changeset a blind head-cut can
  // spend the whole allowance on documentation and tests and never reach the code. See diffBudget.
  const budgeted = budgetDiff(
    context.diff,
    reviewDiffBudget(input.contextTokens, envelopeTokens),
    input.tierOverrides
  )

  // Stated once, in the header, and deliberately *before* the diff — the model needs this to scope
  // its closing coverage line.
  prompt += notIncludedSection(budgeted.omitted, 'review')

  const diffLabel = isBranch ? 'DIFF (base..branch)' : 'DIFF (working tree vs HEAD)'
  prompt += `\n--- ${diffLabel} ---\n${budgeted.text}\n--- END DIFF ---

Review these changes.`

  return prompt
}

/** What a review actually managed to read, and what it would take to read all of it. Shared with
 * every other diff-carrying feature — the question is the same one, so is the answer. */
export type CodeReviewCoverage = DiffCoverage

/** What this review will and will not have read, computed without sending anything. */
export function assessCodeReviewCoverage(input: CodeReviewInput): CodeReviewCoverage {
  return assessDiffCoverage(input.context.diff, {
    instruction: CODE_REVIEW_INSTRUCTION,
    envelopeTokens: estimateTokens(buildPromptHeader(input)) + OMITTED_RESERVE_TOKENS,
    contextTokens: input.contextTokens,
    tierOverrides: input.tierOverrides,
  })
}

/**
 * Streaming feature: read a diff as a reviewer would and stream back a short, ranked list of what is
 * worth someone's attention — the counterpart to the explanation features, which are explicitly
 * forbidden from having an opinion.
 */
export const codeReviewFeature: StreamingFeature<CodeReviewInput> = {
  id: 'code-review',
  kind: 'streaming',
  instruction: CODE_REVIEW_INSTRUCTION,
  // Lower than every other feature, including the explanations at 0.2. Prose benefits from a little
  // latitude; a list of defects does not — sampling variance here means a real bug reported on one
  // run and missed on the next, and a reviewer you have to run twice is one you stop trusting.
  temperature: 0.1,
  buildPrompt: buildCodeReviewPrompt,
}
