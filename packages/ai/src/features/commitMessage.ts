import type { AiContext, AiContextFile } from '../config'
import type { StreamingFeature } from '../runtime'
import { budgetDiff } from './diffBudget'
import {
  assessDiffCoverage,
  diffCharBudget,
  notIncludedSection,
  OMITTED_RESERVE_TOKENS,
  type DiffCoverage,
} from './diffCoverage'
import { buildCommitStyleSection } from './commitConvention'
import { estimateTokens } from '../promptSize'

/** The instruction (system prompt) for commit-message generation. Lives here in `@git-manager/ai`
 * — the single home for the app's AI logic — rather than in the Rust provider (a dumb transport)
 * or the app's Settings (the user no longer edits instructions).
 *
 * The rules about a partial diff read oddly on a feature whose entire output is one line, and they
 * are the ones that matter most. This output is **committed**: it goes into the repository's history
 * under the user's name, immutably, and gets read by everyone who runs `git log` afterwards. A
 * parenthesis like "(diff truncated)" is not a caveat here, it is a permanent artifact of the tool
 * that wrote the message — and the user, who is looking at a subject line and not at a prompt, has
 * no idea where it came from. The other half is the scope: told only what it could read, the model
 * writes `fix(ui)` for a change that also rewrote the backend, which is worse than a vague subject
 * because it is confidently wrong. So the omitted paths are named, and the subject is required to
 * cover them. */
export const COMMIT_MESSAGE_INSTRUCTION = `You are an expert software engineer writing a single Git commit message for a set of STAGED changes, following the Conventional Commits specification.

Output rules (STRICT):
- Return ONLY the commit message — no preamble, no explanation, no code fences, no surrounding quotes.
- Subject line: <type>(<scope>): <description>
  - <type> is chosen by intent: feat (new capability), fix (bug fix), refactor (behavior-preserving restructure), perf, docs, style, test, build, ci, chore.
  - <scope> is optional, lower-case, derived from the touched area (a module or directory); omit it when the change spans unrelated areas.
  - <description> is in the imperative mood ("add", "fix", "remove" — never "added"/"adds"), starts lower-case, has no trailing period, and is at most 72 characters.
- Add a body ONLY when the change needs rationale the subject cannot convey. Separate it with a blank line, wrap around 72 columns, and explain the "why", not the "what".
- The prompt may list files under "NOT INCLUDED" whose diff you were not shown. They are part of this commit: let their paths inform the type and scope, and never pick a scope that describes only the files you could read.
- This message will be COMMITTED to the repository's history. NEVER mention truncation, budgets, or what you could not read — not in the subject, not in the body, not in a parenthesis.
- A diff shows only a few lines around each change. NEVER state that something is missing, absent, or not done merely because you cannot see it — a guard, a call site, or a test may sit just outside what you were shown. Absence of evidence is not evidence of absence.

Types: feat, fix, refactor, perf, docs, style, test, build, ci, chore.`

/**
 * Default character budget, kept for {@link truncateDiff}'s own callers.
 *
 * The commit message no longer uses it: its diff now follows the model's declared window like every
 * other feature's. What survives is the helper itself, which {@link budgetDiff} falls back to for
 * text carrying no `diff --git` header — a blind cut is still better than sending nothing.
 */
const MAX_DIFF_CHARS = 4000

/** Truncates an oversized diff so the prompt stays within a reasonable token budget, appending a
 * marker so the model knows it saw only a prefix. */
export function truncateDiff(diff: string, maxChars = MAX_DIFF_CHARS): string {
  if (diff.length <= maxChars) return diff
  return `${diff.slice(0, maxChars)}\n\n[diff truncated, showing first ${maxChars} chars]`
}

export interface CommitMessageInput {
  /** `staged`-scope git context: index vs HEAD, what a plain commit would capture. */
  context: AiContext
  /**
   * The model's context window, from the connection settings. Sizes how much of the staged diff is
   * sent.
   *
   * Replaces a flat 4000-character cut — the tightest of the six, and the only one that was not an
   * overflow risk on a stock window. Its bug was the other one: on a configured 32k window this
   * feature read 4000 characters of a 60 000-character staged change and wrote a subject line about
   * whichever files sorted first. Absent falls back to the pessimistic default.
   */
  contextTokens?: number
}

/** "Group by first path segment" heuristic: if every changed file shares the same top-level
 * directory that's a reasonable scope hint; if they span multiple, leave it to the model rather
 * than forcing a misleading scope. (Formerly `detect_scope` in the Rust provider.) */
export function detectScope(files: AiContextFile[]): string | undefined {
  const segments = files.map((f) => f.path.split('/')[0])
  if (segments.length === 0) return undefined
  const [first] = segments
  return segments.every((s) => s === first) ? first : undefined
}

/** Everything the prompt carries before the omitted list and the diff — the part whose size is known
 * before any budgeting happens. Shared so {@link buildCommitUserPrompt} and
 * {@link assessCommitMessageCoverage} can never disagree about what the envelope costs. */
function buildPromptHeader(context: AiContext): string {
  let header = `Repository: ${context.repoName} (branch: ${context.branch})\n`

  const scope = detectScope(context.files)
  if (scope) header += `Suggested scope: ${scope}\n`

  // Not decoration, and not small: the style section carries the repo's raw commitlint config plus a
  // sample of recent subjects, which on a project with a verbose convention runs to several hundred
  // tokens. Before this it was added on top of a fixed diff cut instead of competing with it.
  header += buildCommitStyleSection({
    convention: context.commitConvention,
    recentCommits: context.recentCommits,
    userInstructions: context.commitInstructions,
    pattern: context.commitPattern,
  })

  return header
}

/** Builds the user-turn prompt: repo/branch context line, a detected-scope hint when the changes
 * are cohesive, the project's commit style, then the budgeted staged diff. */
export function buildCommitUserPrompt(input: CommitMessageInput): string {
  const { context } = input
  const header = buildPromptHeader(context)

  const budgeted = budgetDiff(
    context.diff,
    diffCharBudget({
      instruction: COMMIT_MESSAGE_INSTRUCTION,
      envelopeTokens: estimateTokens(header) + OMITTED_RESERVE_TOKENS,
      contextTokens: input.contextTokens,
    })
  )

  // Named before the diff, and load-bearing rather than polite: these paths are the only thing
  // stopping the model from scoping the subject to the files that happened to fit.
  const notIncluded = notIncludedSection(budgeted.omitted, 'describe')

  return `${header}${notIncluded}\nAnalyze the following Git diff and generate a commit message:\n\n--- DIFF ---\n${budgeted.text}\n--- END DIFF ---`
}

/**
 * What this message will and will not have been written from, computed without sending anything.
 *
 * Exported for symmetry with the other features, and useful for a different reason: there is no
 * panel here to show a coverage line next to, so the number's job is to let the commit box tell the
 * user *before* they commit that the subject was written from part of the change.
 */
export function assessCommitMessageCoverage(input: CommitMessageInput): DiffCoverage {
  return assessDiffCoverage(input.context.diff, {
    instruction: COMMIT_MESSAGE_INSTRUCTION,
    envelopeTokens: estimateTokens(buildPromptHeader(input.context)) + OMITTED_RESERVE_TOKENS,
    contextTokens: input.contextTokens,
  })
}

/** Streaming feature: turn the staged diff into a Conventional Commits message, token by token. */
export const commitMessageFeature: StreamingFeature<CommitMessageInput> = {
  id: 'commit-message',
  kind: 'streaming',
  instruction: COMMIT_MESSAGE_INSTRUCTION,
  temperature: 0.3,
  buildPrompt: buildCommitUserPrompt,
}
