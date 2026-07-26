import type { AiContext } from '../config'
import type { StreamingFeature } from '../runtime'
import { budgetDiff, splitDiffByFile } from './diffBudget'
import { languageName } from './language'
import {
  contextTokensFor,
  DEFAULT_CONTEXT_TOKENS,
  estimateTokens,
  variableCharBudget,
} from '../promptSize'

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
 * guessed.
 *
 * A fixed constant here was always two guesses pretending to be one: how much diff is useful, and
 * how much the model can actually hold. They are the same question. A user on a stock Ollama (4096
 * tokens) and a user who configured 32k should not get the same prompt — the first was silently
 * overflowing at the old 16000 characters, the second was being starved for no reason.
 *
 * So the budget is whatever is left of the window once the instruction, the prompt's envelope and
 * room for the answer are accounted for. The instruction is measured, not hardcoded, so editing it
 * cannot silently eat into the diff's share.
 */
export function reviewDiffBudget(
  contextTokens: number = DEFAULT_CONTEXT_TOKENS,
  envelopeTokens: number = DEFAULT_ENVELOPE_TOKENS
): number {
  return variableCharBudget(contextTokens, estimateTokens(CODE_REVIEW_INSTRUCTION) + envelopeTokens)
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
 * Caps on the two path lists in the prompt.
 *
 * Both are enumerations, and their value is not linear: knowing thirty of the files tells a reviewer
 * what kind of change this is, and the next twenty tell them nothing they will act on. Leaving them
 * unbounded spent a fifth of a small window on filenames.
 *
 * The omitted list needed a cap for a second, worse reason: it *grows as the diff budget shrinks*.
 * Uncapped, trimming the diff to fit made the envelope bigger, which shrank the diff further — a
 * feedback loop that pushed the total the wrong way exactly when room was tightest.
 */
const MAX_LISTED_CHANGED_FILES = 30
const MAX_LISTED_OMITTED_FILES = 12

/** Renders a capped path list, naming the count it did not print rather than dropping it silently. */
function cappedList(paths: string[], max: number): string {
  const shown = paths.slice(0, max).map((p) => `- ${p}`)
  const rest = paths.length - shown.length
  return rest > 0 ? `${shown.join('\n')}\n- …and ${rest} more` : shown.join('\n')
}

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
}

/** Reserve for the omitted-file list, which is not yet known when the diff budget is computed. It is
 * *bounded* (see {@link MAX_LISTED_OMITTED_FILES}), so a flat reserve covers it without circularity. */
const OMITTED_RESERVE_TOKENS = 250

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
  const budgeted = budgetDiff(context.diff, reviewDiffBudget(input.contextTokens, envelopeTokens))

  // Stated once, in the header, and deliberately *before* the diff. The model needs this to scope
  // its closing coverage line — and stating it up front is what stops it from rediscovering the
  // truncation mid-diff and turning it into the headline.
  if (budgeted.omitted.length > 0) {
    prompt += `\nNOT INCLUDED below (budget exhausted) — you have not read these, do not review them:\n${cappedList(
      budgeted.omitted,
      MAX_LISTED_OMITTED_FILES
    )}\n`
  }

  const diffLabel = isBranch ? 'DIFF (base..branch)' : 'DIFF (working tree vs HEAD)'
  prompt += `\n--- ${diffLabel} ---\n${budgeted.text}\n--- END DIFF ---

Review these changes.`

  return prompt
}

/** What a review actually managed to read, and what it would take to read all of it. */
export interface CodeReviewCoverage {
  /**
   * Files whose diff reached the prompt **in full**.
   *
   * Truncated files are deliberately excluded rather than counted as read: counting them produced
   * the self-contradicting "50 of 50 files read — reading all of it needs a bigger window", and a
   * file the model saw half of is one it can draw a wrong conclusion from. Only whole files are
   * honestly "read".
   */
  filesRead: number
  /** Files in the changeset. */
  filesTotal: number
  /** True when everything was read — nothing omitted, nothing cut short. */
  complete: boolean
  /** Smallest common context window that would carry the whole diff, in tokens. */
  requiredContextTokens: number
  /**
   * The declared window leaves no room for any diff at all — everything it can hold is instruction
   * and reserve. The one state trimming cannot fix, and the only one still worth a warning rather
   * than information: every other shortfall just means fewer files were read.
   */
  windowTooSmall: boolean
}

/** Window sizes people actually configure. Reporting "you need 21 473 tokens" is true and useless;
 * reporting the next real rung tells the reader what to go and set. */
const COMMON_WINDOWS = [4096, 8192, 16384, 32768, 65536, 131072, 262144]

function nextCommonWindow(tokens: number): number {
  return COMMON_WINDOWS.find((w) => w >= tokens) ?? tokens
}

/**
 * What this review will and will not have read, computed without sending anything.
 *
 * This exists because the *useful* thing to tell a user changed. While the diff budget was a fixed
 * constant, the question was "will this overflow?" — a failure. Now that the budget follows the
 * window, the prompt never overflows: it shrinks. So the question became "what is my window costing
 * me?", which is information, not a warning, and which the user can act on by raising it.
 */
export function assessCodeReviewCoverage(input: CodeReviewInput): CodeReviewCoverage {
  const envelopeTokens = estimateTokens(buildPromptHeader(input)) + OMITTED_RESERVE_TOKENS
  const budgeted = budgetDiff(input.context.diff, reviewDiffBudget(input.contextTokens, envelopeTokens))

  const filesTotal = splitDiffByFile(input.context.diff).length
  const filesRead = filesTotal - budgeted.omitted.length - budgeted.truncated.length

  return {
    filesRead,
    filesTotal,
    complete: budgeted.omitted.length === 0 && budgeted.truncated.length === 0,
    windowTooSmall: reviewDiffBudget(input.contextTokens, envelopeTokens) === 0,
    requiredContextTokens: nextCommonWindow(
      contextTokensFor(
        input.context.diff.length,
        estimateTokens(CODE_REVIEW_INSTRUCTION) + envelopeTokens
      )
    ),
  }
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
