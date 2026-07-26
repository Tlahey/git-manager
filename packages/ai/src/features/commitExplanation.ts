import type { StreamingFeature } from '../runtime'
import { truncateDiff } from './commitMessage'
import { languageName } from './language'

/** The instruction (system prompt) for explaining a single commit.
 *
 * The distinguishing constraint: a commit already carries a message, so paraphrasing it back adds
 * nothing. This feature earns its keep when the message is terse, stale or optimistic — so the model
 * is told to describe what the diff *actually does*, and to say plainly when that doesn't match what
 * the subject claims. That is the question a reader of someone else's commit is really asking. */
export const COMMIT_EXPLANATION_INSTRUCTION = `You are an expert software engineer explaining ONE commit to a developer reading it in a history browser.

The commit's own message is given to you. Do NOT paraphrase it back — the reader can see it. Explain what the diff actually does, at a level the message does not already cover.

Output rules (STRICT):
- Return ONLY the explanation as GitHub-flavored Markdown — no preamble, no title, no surrounding code fences.
- Start with a single bold sentence saying what the commit does, in your own words.
- Then 2 to 5 bullets covering the substance: which areas it touches, what behavior changes, how the pieces relate. Name files and identifiers with backticks. Group trivial churn (formatting, imports, generated files) into one bullet instead of listing it.
- Add a final "⚠️" line ONLY when the diff shows something the reader should know and the message does not mention — a behavior change the subject doesn't advertise, a removed guard or test, a hardcoded secret, a migration or breaking change. Omit it entirely otherwise; never invent a concern to fill it.
- If the diff plainly does something other than what the message claims, say so in one short sentence. Do not speculate about intent beyond what the code shows.
- Base every statement ONLY on the message and diff you are given. Do not guess at code you cannot see or at callers elsewhere.
- Describe, do not review: no praise, no suggested rewrites.
- Keep the whole answer under 250 words.
- Write the entire explanation in the language requested by the user prompt.`

/** Character budget for the commit's patch. Same as the branch/PR features: one commit is usually
 * far smaller, and when it isn't, the reader needs the explanation most. */
const MAX_COMMIT_DIFF_CHARS = 8000

/** The commit being explained, as a self-describing unit. Deliberately not the app's `GitCommit`
 * DTO — this package stays free of `@git-manager/git-types`. */
export interface CommitExplanationCommit {
  shortOid: string
  /** First line of the commit message. */
  subject: string
  /** The rest of the message, trimmed; empty when subject-only. */
  body: string
  author: string
  filesChanged: number
  insertions: number
  deletions: number
  /** True for a merge commit — the patch is then against its FIRST parent only. */
  isMerge: boolean
}

export interface CommitExplanationInput {
  repoName: string
  commit: CommitExplanationCommit
  /** Unified-diff text for the whole commit (its files concatenated). */
  patch: string
  /** BCP-47-ish language tag (`'fr'` / `'en'`) the explanation should be written in. */
  language?: string
}

/** Builds the user-turn prompt: the commit's identity and message, then its patch. */
export function buildCommitExplanationPrompt(input: CommitExplanationInput): string {
  const { repoName, commit, patch, language } = input

  let prompt = `Repository: ${repoName}
Commit: ${commit.shortOid} by ${commit.author} (${commit.filesChanged} files, +${commit.insertions}/-${commit.deletions})
Write the entire explanation in ${languageName(language)}.

--- COMMIT MESSAGE ---
${commit.subject}`

  const body = commit.body.trim()
  if (body) prompt += `\n\n${body}`
  prompt += `\n--- END COMMIT MESSAGE ---\n`

  if (commit.isMerge) {
    // Without this the model reads a merge's first-parent diff as if the commit authored all of it.
    prompt += `\nThis is a MERGE commit. The diff below is against its first parent only — it shows what the merge brought in, not changes its author wrote by hand.\n`
  }

  prompt += `\n--- DIFF ---\n${truncateDiff(patch, MAX_COMMIT_DIFF_CHARS)}\n--- END DIFF ---

Explain what this commit does.`

  return prompt
}

/** Streaming feature: turn one commit's message + diff into a short markdown explanation of what it
 * actually does, token by token. */
export const commitExplanationFeature: StreamingFeature<CommitExplanationInput> = {
  id: 'commit-explanation',
  kind: 'streaming',
  instruction: COMMIT_EXPLANATION_INSTRUCTION,
  // Same as the other explanation features: describing existing code wants reproducibility.
  temperature: 0.2,
  buildPrompt: buildCommitExplanationPrompt,
}
