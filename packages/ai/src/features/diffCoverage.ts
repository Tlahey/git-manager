/**
 * Sizing a diff-carrying prompt against the model's window, and reporting what it managed to read.
 *
 * This is the machinery the code review grew — a budget derived from the declared context window
 * rather than a hardcoded character count, a per-file allocation ({@link budgetDiff}), a named list
 * of what did not fit, and a coverage report the UI can turn into one honest line. It lives here
 * rather than inside `codeReview.ts` because none of it is about *reviewing*: every feature that
 * puts a diff in a prompt has the same three problems, and had the same three wrong answers.
 *
 * The wrong answer it replaces was `truncateDiff(diff, 8000)`. Two independent bugs in one line:
 *
 * 1. **8000 characters is a guess about a window it never looks at.** On a stock Ollama (4096
 *    tokens) that is ~2300 tokens of diff on top of a ~600-token instruction and the answer's own
 *    reserve — an overflow, and an overflow drops tokens from the *start*, which is where the
 *    instruction lives. The feature quietly stops obeying its own output rules and nothing says why.
 *    On a 32k window it is the opposite waste: a tenth of the room, used.
 * 2. **A head-cut shows whatever sorts first, not whatever matters.** The changeset that introduced
 *    the review feature spent its whole 8000 characters on a documentation page and half a test file
 *    and never reached the code.
 *
 * A feature adopts this by declaring what its prompt always costs — its instruction, measured, and
 * the envelope it wraps around the diff — and letting the diff have what is left.
 */

import { budgetDiff, splitDiffByFile } from './diffBudget'
import {
  contextTokensFor,
  DEFAULT_CONTEXT_TOKENS,
  estimateTokens,
  variableCharBudget,
} from '../promptSize'

/**
 * What a prompt costs before any diff goes into it.
 *
 * The instruction is passed as text and measured, not as a token count: hardcoding the number is how
 * editing an instruction silently eats into the diff's share months later, with no test failing.
 */
export interface DiffPromptSizing {
  /** The feature's system instruction — sent on every call, so it is part of the fixed cost. */
  instruction: string
  /** Everything else the prompt always carries around the diff (headers, file lists), in tokens. */
  envelopeTokens: number
  /** The model's declared context window. Absent falls back to the pessimistic default. */
  contextTokens?: number
}

/**
 * How many characters of diff this prompt may carry.
 *
 * Zero is a meaningful answer, not a failure to handle: it means the declared window has no room for
 * a diff at all once the instruction and the answer's reserve are paid for — see
 * {@link DiffCoverage.windowTooSmall}.
 */
export function diffCharBudget(sizing: DiffPromptSizing): number {
  return variableCharBudget(
    sizing.contextTokens ?? DEFAULT_CONTEXT_TOKENS,
    estimateTokens(sizing.instruction) + sizing.envelopeTokens
  )
}

/**
 * Reserve for the omitted-file list, which is not yet known when the diff budget is computed.
 *
 * The list is *bounded* ({@link MAX_LISTED_OMITTED_FILES}), so a flat reserve covers it without the
 * circularity of budgeting against something the budget itself produces.
 */
export const OMITTED_RESERVE_TOKENS = 250

/**
 * Cap on the omitted list printed in a prompt.
 *
 * It needs a cap for a reason the changed-file list does not: it *grows as the diff budget shrinks*.
 * Uncapped, trimming the diff to fit makes the envelope bigger, which shrinks the diff further — a
 * feedback loop that pushes the total the wrong way exactly when room is tightest.
 */
export const MAX_LISTED_OMITTED_FILES = 12

/** Renders a capped path list, naming the count it did not print rather than dropping it silently. */
export function cappedList(paths: string[], max: number): string {
  const shown = paths.slice(0, max).map((p) => `- ${p}`)
  const rest = paths.length - shown.length
  return rest > 0 ? `${shown.join('\n')}\n- …and ${rest} more` : shown.join('\n')
}

/**
 * The block naming files the budget could not fit, or `''` when everything got in.
 *
 * Belongs *before* the diff in the prompt, not after: stating it up front is what stops the model
 * from rediscovering the truncation halfway through and making it the headline of its answer.
 *
 * `verb` is what the feature would otherwise do to those files ("review", "describe") — the only
 * part of this sentence that differs between features.
 */
export function notIncludedSection(paths: string[], verb: string): string {
  if (paths.length === 0) return ''
  return `\nNOT INCLUDED below (budget exhausted) — you have not read these, do not ${verb} them:\n${cappedList(
    paths,
    MAX_LISTED_OMITTED_FILES
  )}\n`
}

/** What a run actually managed to read, and what it would take to read all of it. */
export interface DiffCoverage {
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
 * What a run will and will not have read, computed without sending anything.
 *
 * This exists because the *useful* thing to tell a user changed. While the diff budget was a fixed
 * constant, the question was "will this overflow?" — a failure. Now that the budget follows the
 * window, the prompt never overflows: it shrinks. So the question became "what is my window costing
 * me?", which is information, not a warning, and which the user can act on by raising it.
 */
export function assessDiffCoverage(diff: string, sizing: DiffPromptSizing): DiffCoverage {
  const budget = diffCharBudget(sizing)
  const budgeted = budgetDiff(diff, budget)

  const filesTotal = splitDiffByFile(diff).length
  const filesRead = filesTotal - budgeted.omitted.length - budgeted.truncated.length

  return {
    filesRead,
    filesTotal,
    complete: budgeted.omitted.length === 0 && budgeted.truncated.length === 0,
    windowTooSmall: budget === 0,
    requiredContextTokens: nextCommonWindow(
      contextTokensFor(diff.length, estimateTokens(sizing.instruction) + sizing.envelopeTokens)
    ),
  }
}
