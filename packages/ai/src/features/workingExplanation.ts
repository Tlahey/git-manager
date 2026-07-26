import type { AiContext } from '../config'
import type { StreamingFeature } from '../runtime'
import { budgetDiff } from './diffBudget'
import {
  assessDiffCoverage,
  cappedList,
  diffCharBudget,
  notIncludedSection,
  OMITTED_RESERVE_TOKENS,
  type DiffCoverage,
} from './diffCoverage'
import { languageName } from './language'
import { estimateTokens } from '../promptSize'

/** The instruction (system prompt) for explaining the whole working tree.
 *
 * The question behind it is "what am I in the middle of?" — asked after a weekend, an interruption,
 * or before deciding how to split the work into commits. So the emphasis is on *grouping*: an
 * uncommitted tree is usually several half-finished things at once, and naming them separately is
 * the useful part.
 *
 * That emphasis is also what makes a budgeted diff dangerous here in a way it is not elsewhere. The
 * answer's whole job is to say *how many separate things* are in progress — a count the model can
 * only get right from the file list, since the diff it reads is a subset. Told to separate what it
 * sees, it reports "two pieces of work" on a tree holding five. So the file list is sent complete
 * and declared as the authority on scope, and the diff is demoted to evidence about the pieces. */
export const WORKING_EXPLANATION_INSTRUCTION = `You are an expert software engineer summarizing a developer's UNCOMMITTED work, so they can see at a glance what they are in the middle of.

The working tree usually holds several unrelated things at once. Separating them is the most useful thing you can do.

The list of uncommitted files is COMPLETE even when the diff below is not. It — not the diff — tells you how many separate pieces of work are in progress; the diff tells you what they are.

Output rules (STRICT):
- Return ONLY the summary as GitHub-flavored Markdown — no preamble, no title, no surrounding code fences.
- Start with a single bold sentence covering the work as a whole, scoped by the WHOLE file list. If it is clearly several unrelated things, say so in that sentence rather than pretending it is one. That sentence is about THE WORK — never about the diff being incomplete, truncated, or hard to read.
- Then 2 to 6 bullets, one per coherent piece of work, naming the files or directories it touches with backticks. Group trivial churn (formatting, imports, generated files, lockfiles) into a single bullet instead of listing it.
- Account for a file you could not read from its path and status ("a new migration", "3 locale files"). Say what it evidently is, never what it evidently does.
- NEVER mention truncation, budgets, or what you could not read — no note, no caveat, not one word. The interface already tells the reader how much was read.
- End with a "⚠️" line ONLY when something in the diff should not be committed as-is — leftover debug output, a commented-out block, a hardcoded secret or credential, a stray TODO marker, an unintended file. Omit it entirely otherwise; never invent a concern to fill it.
- Base every statement ONLY on the files and diff you are given. Do not guess at code you cannot see.
- A diff shows only a few lines around each change. NEVER state that something is missing, absent, or not done merely because you cannot see it — a guard, a condition, an early return, a call site, or a cleanup may sit just outside the few lines you were shown. Absence of evidence is not evidence of absence.
- Describe, do not review: no praise, no suggested rewrites, no opinion on whether the work is finished.
- Keep the whole answer under 250 words.
- Write the entire summary in the language requested by the user prompt.`

/**
 * Cap on the uncommitted-file list in the prompt.
 *
 * Higher than the code review's 30, and deliberately: this list is load-bearing here rather than
 * decorative — it is what the answer counts its "separate pieces of work" from, so cutting it costs
 * correctness and not just detail. A working tree large enough to reach 50 files is also one where
 * the diff was never going to fit anyway.
 */
const MAX_LISTED_CHANGED_FILES = 50

export interface WorkingExplanationInput {
  /** `working`-scope git context: worktree vs HEAD, untracked included. */
  context: AiContext
  /** BCP-47-ish language tag (`'fr'` / `'en'`) the summary should be written in. */
  language?: string
  /**
   * The model's context window, from the connection settings. Sizes how much of the working diff is
   * sent.
   *
   * Replaces a flat 8000-character cut, which ignored the window in both directions: an overflow on
   * a stock Ollama (dropping tokens from the *start*, where the instruction lives) and wasted room
   * on a configured 32k one. Absent falls back to the pessimistic default.
   */
  contextTokens?: number
}

/** Everything the prompt carries before the omitted list and the diff — the part whose size is known
 * before any budgeting happens. Shared so {@link buildWorkingExplanationPrompt} and
 * {@link assessWorkingExplanationCoverage} can never disagree about what the envelope costs. */
function buildPromptHeader(input: WorkingExplanationInput): string {
  const { context, language } = input

  let header = `Repository: ${context.repoName} (branch: ${context.branch})
Write the entire summary in ${languageName(language)}.
`

  if (context.files.length > 0) {
    // The statuses carry information the diff alone does not — an untracked file is a new one the
    // developer may not even have meant to leave lying around.
    header += `\nUncommitted files:\n${cappedList(
      context.files.map((f) => `${f.path} (${f.status})`),
      MAX_LISTED_CHANGED_FILES
    )}\n`
  }

  return header
}

/** Builds the user-turn prompt: the changed files with their statuses, then the budgeted working
 * diff. */
export function buildWorkingExplanationPrompt(input: WorkingExplanationInput): string {
  let prompt = buildPromptHeader(input)

  // The diff gets what is left of the window once the instruction and the file list are paid for.
  const budgeted = budgetDiff(
    input.context.diff,
    diffCharBudget({
      instruction: WORKING_EXPLANATION_INSTRUCTION,
      envelopeTokens: estimateTokens(prompt) + OMITTED_RESERVE_TOKENS,
      contextTokens: input.contextTokens,
    })
  )

  // Before the diff: the model needs to know which of the listed files it is about to see nothing
  // of, so it can place them from their paths instead of quietly dropping them from the count.
  prompt += notIncludedSection(budgeted.omitted, 'describe')

  prompt += `\n--- DIFF (working tree vs HEAD) ---\n${budgeted.text}\n--- END DIFF ---

Summarize the work in progress.`

  return prompt
}

/**
 * What this summary will and will not have read, computed without sending anything.
 *
 * The stake here is the *count*: a summary that names two pieces of work on a five-piece tree is
 * wrong in the one dimension this feature exists to get right, and reads no less confident for it.
 */
export function assessWorkingExplanationCoverage(input: WorkingExplanationInput): DiffCoverage {
  return assessDiffCoverage(input.context.diff, {
    instruction: WORKING_EXPLANATION_INSTRUCTION,
    envelopeTokens: estimateTokens(buildPromptHeader(input)) + OMITTED_RESERVE_TOKENS,
    contextTokens: input.contextTokens,
  })
}

/** Streaming feature: turn everything uncommitted into a short markdown summary of the work in
 * progress, token by token. */
export const workingExplanationFeature: StreamingFeature<WorkingExplanationInput> = {
  id: 'working-explanation',
  kind: 'streaming',
  instruction: WORKING_EXPLANATION_INSTRUCTION,
  // Same as the other explanation features: describing existing work wants reproducibility.
  temperature: 0.2,
  buildPrompt: buildWorkingExplanationPrompt,
}
