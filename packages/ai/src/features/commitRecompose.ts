import type { CommitConvention } from '../config'
import type { CompletionFeature } from '../runtime'
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

/**
 * Rewriting the message of a commit that already exists, from what it actually changed.
 *
 * The sibling of the commit-message feature, and the differences are the whole design:
 *
 * - **The change is in the past.** There is no index and no staging decision — the commit's contents
 *   are fixed, and the only question is what to call them.
 * - **There is already a message**, and it is the reason the user is here. Feeding it to the model
 *   turns the task into paraphrasing: it would defend the existing wording rather than describe the
 *   diff, which is precisely what a user asking for a rewrite does not want. So the old message is
 *   **not** in the prompt. (The commit *explanation* feature makes the opposite call for the
 *   opposite reason — it must not restate a message the reader can already see.)
 * - **It will be rewritten into history**, replacing a message someone may have relied on. That
 *   raises the bar on the truncation rules rather than lowering it: a subject scoped to the files
 *   that happened to fit is now a subject that *replaces* an accurate one.
 */
export const COMMIT_RECOMPOSE_INSTRUCTION = `You are an expert software engineer writing a replacement Git commit message for a commit that ALREADY EXISTS, based only on the changes it makes.

Output rules (STRICT):
- Return ONLY the commit message — no preamble, no explanation, no code fences, no surrounding quotes.
- Subject line: <type>(<scope>): <description>
  - <type> is chosen by intent: feat (new capability), fix (bug fix), refactor (behavior-preserving restructure), perf, docs, style, test, build, ci, chore.
  - <scope> is optional, lower-case, derived from the touched area (a module or directory); omit it when the change spans unrelated areas.
  - <description> is in the imperative mood ("add", "fix", "remove" — never "added"/"adds"), starts lower-case, has no trailing period, and is at most 72 characters.
- Add a body ONLY when the change needs rationale the subject cannot convey. Separate it with a blank line, wrap around 72 columns, and explain the "why", not the "what".
- Describe what the commit changes, NOT the fact that it is being rewritten. Never mention rewording, rewriting, history, or that a previous message existed.
- The prompt may list files under "NOT INCLUDED" whose diff you were not shown. They are part of this commit: let their paths inform the type and scope, and never pick a scope that describes only the files you could read.
- This message REPLACES the commit's message in the repository's history. NEVER mention truncation, budgets, or what you could not read — not in the subject, not in the body, not in a parenthesis.
- A diff shows only a few lines around each change. NEVER state that something is missing, absent, or not done merely because you cannot see it — a guard, a call site, or a test may sit just outside what you were shown. Absence of evidence is not evidence of absence.

Types: feat, fix, refactor, perf, docs, style, test, build, ci, chore.`

/** The commit whose message is being rewritten. Deliberately carries no `message`/`subject`: see the
 * instruction's doc comment for why the existing wording is withheld from the model. */
export interface CommitRecomposeSubject {
  shortOid: string
  /** Unified patch of the commit against its first parent (empty tree for a root commit). */
  patch: string
  filesChanged: number
  insertions: number
  deletions: number
  /** True when the commit has more than one parent — the patch is then first-parent only. */
  isMerge: boolean
}

export interface CommitRecomposeInput {
  repoName: string
  commit: CommitRecomposeSubject
  /** The project's commit convention, so a rewritten message matches the surrounding history. */
  convention?: CommitConvention | null
  /** Subjects of recent non-merge commits — the project's actual style, which may be free-form. */
  recentCommits?: string[]
  /** User-authored commit guidance from app Settings. */
  commitInstructions?: string
  /** Optional regex (from Settings) the generated subject must match. */
  commitPattern?: string
  /** The model's context window. Sizes how much of the commit's patch is sent. */
  contextTokens?: number
}

/** Everything the prompt carries before the omitted list and the patch. Shared so
 * {@link buildCommitRecomposePrompt} and {@link assessCommitRecomposeCoverage} can never disagree
 * about what the envelope costs. */
function buildPromptHeader(input: CommitRecomposeInput): string {
  const { repoName, commit } = input

  let header = `Repository: ${repoName}
Commit: ${commit.shortOid} (${commit.filesChanged} files, +${commit.insertions}/-${commit.deletions})
`

  if (commit.isMerge) {
    // Without this the model reads a merge's first-parent diff as changes its author wrote by hand.
    header += `\nThis is a MERGE commit. The diff below is against its first parent only — it shows what the merge brought in, not changes written by hand.\n`
  }

  header += buildCommitStyleSection({
    convention: input.convention,
    recentCommits: input.recentCommits,
    userInstructions: input.commitInstructions,
    pattern: input.commitPattern,
  })

  return header
}

/** Builds the user-turn prompt: the commit's identity, the project's commit style, then the
 * budgeted patch. */
export function buildCommitRecomposePrompt(input: CommitRecomposeInput): string {
  const header = buildPromptHeader(input)

  const budgeted = budgetDiff(
    input.commit.patch,
    diffCharBudget({
      instruction: COMMIT_RECOMPOSE_INSTRUCTION,
      envelopeTokens: estimateTokens(header) + OMITTED_RESERVE_TOKENS,
      contextTokens: input.contextTokens,
    })
  )

  // Before the diff, and load-bearing: these paths are the only thing stopping the model from
  // scoping a subject — one that will replace an accurate message — to whatever happened to fit.
  const notIncluded = notIncludedSection(budgeted.omitted, 'describe')

  return `${header}${notIncluded}
Write the commit message for the following changes:

--- DIFF ---
${budgeted.text}
--- END DIFF ---`
}

/** What this message will and will not have been written from, computed without sending anything. */
export function assessCommitRecomposeCoverage(input: CommitRecomposeInput): DiffCoverage {
  return assessDiffCoverage(input.commit.patch, {
    instruction: COMMIT_RECOMPOSE_INSTRUCTION,
    envelopeTokens: estimateTokens(buildPromptHeader(input)) + OMITTED_RESERVE_TOKENS,
    contextTokens: input.contextTokens,
  })
}

/**
 * Strips the wrappers a model puts around a commit message despite being told not to.
 *
 * Tolerated rather than trusted: the instruction forbids fences and quotes, and most models obey,
 * but the output here is written into history — a stray ``` in a subject line is permanent, and
 * cheap to remove.
 */
export function parseRecomposedMessage(raw: string): string {
  let text = raw.trim()

  // A fenced block, optionally tagged (```text, ```commit, …).
  const fenced = /^```[a-zA-Z]*\n([\s\S]*?)\n?```$/.exec(text)
  if (fenced) text = fenced[1].trim()

  // Surrounding quotes, only when they wrap the whole message.
  if (text.length > 1 && /^(["'])[\s\S]*\1$/.test(text)) {
    text = text.slice(1, -1).trim()
  }

  return text
}

/**
 * Completion feature: write a replacement message for one existing commit.
 *
 * A completion rather than a stream, unlike the commit-message feature it mirrors. The reason is the
 * surface: a recompose is reviewed in a dialog, often several commits at once, and each proposal is
 * an editable row rather than text arriving into a box the user is watching. Streaming N answers
 * into N rows would buy motion, not information, and the run only ends when the user accepts.
 */
export const commitRecomposeFeature: CompletionFeature<CommitRecomposeInput, string> = {
  id: 'commit-recompose',
  kind: 'completion',
  instruction: COMMIT_RECOMPOSE_INSTRUCTION,
  // Same as the commit-message feature: low enough to stay faithful to the diff, not zero, because a
  // subject line is still a piece of writing.
  temperature: 0.3,
  buildPrompt: buildCommitRecomposePrompt,
  parse: parseRecomposedMessage,
}
