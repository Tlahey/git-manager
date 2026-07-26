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

/** The instruction (system prompt) for explaining a whole branch. Streaming markdown, and a close
 * sibling of {@link prDescriptionFeature} — same `range`-scope input, opposite audience. A PR
 * description is written *for reviewers*, in the author's voice, and gets edited before it ships;
 * this is written *for the reader in front of the graph*, who is asking "what is this branch even
 * about?" — often about someone else's branch, before deciding to review, merge or check it out.
 *
 * The rules about *what it did not read* came from the commit explanation, and one of them is a
 * reversal worth naming. This instruction used to say "if the diff was truncated, say what you could
 * not see" — which reads as honesty and is, on a branch, the single most expensive sentence in the
 * answer. A branch range is the largest diff any feature here handles, so the truncation is near
 * permanent; the model duly opened with it, and a 300-word budget bought a paragraph about the
 * prompt instead of about the branch. The panel reports coverage exactly, next to the text, so the
 * remark is not merely costly but redundant. It is now banned outright, and the commit list — which
 * is complete whatever the diff budget does — is what scopes the answer instead. */
export const BRANCH_EXPLANATION_INSTRUCTION = `You are an expert software engineer explaining what a Git branch changes, to a developer who is looking at it in a commit graph and does not know it yet.

You are given the branch's commit subjects, the list of files it touches, and as much of its diff against the base branch as fits. The commit list and the file list are COMPLETE even when the diff is not: scope your answer with them, and take substance from the diff.

Output rules (STRICT):
- Return ONLY the explanation as GitHub-flavored Markdown — no preamble, no title, no surrounding code fences.
- Start with a single bold sentence answering "what is this branch for?", scoped by the whole commit and file list. That sentence is about THE WORK — never about the diff being incomplete, truncated, or hard to read.
- Then a "## What changed" section: 3 to 6 bullets, each one coherent area of change (a module, a layer, a concern), naming the files or directories it touches with backticks. Group related commits into one bullet — do not restate the commit list, the reader can already see it.
- Then a "## Worth knowing" section: 1 to 3 bullets for what a reader should be aware of — a breaking change, a migration, a dependency added, a behavior change that isn't obvious from the file names. Write "- Nothing out of the ordinary." when the branch holds no such surprise; never pad this section.
- Account for an area you could only see in the file list from its paths ("the same rename across 9 call sites", "4 documentation pages"). Say what it evidently is, never what it evidently does.
- NEVER mention truncation, budgets, or what you could not read — no note, no caveat, not one word. The interface already tells the reader how much was read.
- Base every statement ONLY on the commits, the file list and the diff you are given. Do not invent tickets, tests, or intentions that are not evidenced.
- A diff shows only a few lines around each change. NEVER state that something is missing, absent, or not done merely because you cannot see it — a guard, a condition, an early return, a call site, or a cleanup may sit just outside the few lines you were shown. Absence of evidence is not evidence of absence.
- Describe, do not review: no praise, no suggestions, no "consider refactoring".
- Keep the whole answer under 300 words.
- Write the entire explanation in the language requested by the user prompt.`

/**
 * Cap on the changed-file list in the prompt.
 *
 * Same value and same reason as the code review's: the list is an enumeration whose value is not
 * linear, and leaving it unbounded spent a fifth of a small window on filenames — straight out of
 * the diff's share, since the two now come from one pool.
 */
const MAX_LISTED_CHANGED_FILES = 30

export interface BranchExplanationInput {
  /** Range-scope git context: `merge-base(base, branch)..branch` diff, files, and range commits. */
  context: AiContext
  /** BCP-47-ish language tag (`'fr'` / `'en'`) the explanation should be written in. Populated from
   * app Settings so the prose matches the UI language. */
  language?: string
  /**
   * The model's context window, from the connection settings. Sizes how much of the range diff is
   * sent.
   *
   * Replaces a flat 8000-character cut, which was wrong in both directions at once: on a stock
   * Ollama window it built a prompt that overflowed — and an overflow drops tokens from the *start*,
   * where the instruction lives, so the feature quietly stopped obeying its own output rules — while
   * on a configured 32k window it threw away room the user had already paid for. Absent falls back
   * to the pessimistic default.
   */
  contextTokens?: number
}

/** Everything the prompt carries before the omitted list and the diff — the part whose size is known
 * before any budgeting happens. Shared so {@link buildBranchExplanationPrompt} and
 * {@link assessBranchExplanationCoverage} can never disagree about what the envelope costs. */
function buildPromptHeader(input: BranchExplanationInput): string {
  const { context, language } = input

  let header = `Repository: ${context.repoName}
Branch: ${context.branch}${context.baseRef ? ` (compared against ${context.baseRef})` : ''}
Write the entire explanation in ${languageName(language)}.
`

  const commits = context.rangeCommits ?? []
  header +=
    commits.length > 0
      ? `\nCommits on this branch (newest first):\n${commits.map((c) => `- ${c}`).join('\n')}\n`
      : `\n(No commits of its own — the branch is level with its base.)\n`

  if (context.files.length > 0) {
    header += `\nChanged files:\n${cappedList(
      context.files.map((f) => `${f.path} (${f.status})`),
      MAX_LISTED_CHANGED_FILES
    )}\n`
  }

  return header
}

/** Builds the user-turn prompt: branch/base header, the branch's commit subjects, the changed-file
 * list, then the budgeted range diff. */
export function buildBranchExplanationPrompt(input: BranchExplanationInput): string {
  let prompt = buildPromptHeader(input)

  // The diff gets what is left of the window once the instruction and this header are paid for.
  // Measured rather than assumed: a branch's commit list and file list are themselves envelope, and
  // on a long-running branch they run to hundreds of tokens before a single diff line is added.
  const budgeted = budgetDiff(
    input.context.diff,
    diffCharBudget({
      instruction: BRANCH_EXPLANATION_INSTRUCTION,
      envelopeTokens: estimateTokens(prompt) + OMITTED_RESERVE_TOKENS,
      contextTokens: input.contextTokens,
    })
  )

  // Before the diff, not after: naming the gap up front is what keeps the model from rediscovering
  // it halfway down and making it the headline the instruction just forbade.
  prompt += notIncludedSection(budgeted.omitted, 'describe')

  prompt += `\n--- DIFF (base..branch) ---\n${budgeted.text}\n--- END DIFF ---

Explain what this branch does.`

  return prompt
}

/**
 * What this explanation will and will not have read, computed without sending anything.
 *
 * A branch range is the largest diff in the app, so this is the feature where the answer is most
 * often a summary of a fraction — and the one where nothing in the prose is allowed to admit it.
 * The panel says it instead.
 */
export function assessBranchExplanationCoverage(input: BranchExplanationInput): DiffCoverage {
  return assessDiffCoverage(input.context.diff, {
    instruction: BRANCH_EXPLANATION_INSTRUCTION,
    envelopeTokens: estimateTokens(buildPromptHeader(input)) + OMITTED_RESERVE_TOKENS,
    contextTokens: input.contextTokens,
  })
}

/** Streaming feature: turn a branch's range diff + commits into a short markdown explanation of the
 * work it contains, token by token. */
export const branchExplanationFeature: StreamingFeature<BranchExplanationInput> = {
  id: 'branch-explanation',
  kind: 'streaming',
  instruction: BRANCH_EXPLANATION_INSTRUCTION,
  // Same reasoning as the file-level explanation: describing existing work wants reproducibility,
  // not the prose latitude a PR description (0.4) is given.
  temperature: 0.2,
  buildPrompt: buildBranchExplanationPrompt,
}
