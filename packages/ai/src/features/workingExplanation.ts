import type { AiContext } from '../config'
import type { StreamingFeature } from '../runtime'
import { truncateDiff } from './commitMessage'
import { languageName } from './language'

/** The instruction (system prompt) for explaining the whole working tree.
 *
 * The question behind it is "what am I in the middle of?" — asked after a weekend, an interruption,
 * or before deciding how to split the work into commits. So the emphasis is on *grouping*: an
 * uncommitted tree is usually several half-finished things at once, and naming them separately is
 * the useful part. */
export const WORKING_EXPLANATION_INSTRUCTION = `You are an expert software engineer summarizing a developer's UNCOMMITTED work, so they can see at a glance what they are in the middle of.

The working tree usually holds several unrelated things at once. Separating them is the most useful thing you can do.

Output rules (STRICT):
- Return ONLY the summary as GitHub-flavored Markdown — no preamble, no title, no surrounding code fences.
- Start with a single bold sentence covering the work as a whole. If it is clearly several unrelated things, say so in that sentence rather than pretending it is one.
- Then 2 to 6 bullets, one per coherent piece of work, naming the files or directories it touches with backticks. Group trivial churn (formatting, imports, generated files, lockfiles) into a single bullet instead of listing it.
- End with a "⚠️" line ONLY when something in the diff should not be committed as-is — leftover debug output, a commented-out block, a hardcoded secret or credential, a stray TODO marker, an unintended file. Omit it entirely otherwise; never invent a concern to fill it.
- Base every statement ONLY on the files and diff you are given. Do not guess at code you cannot see.
- Describe, do not review: no praise, no suggested rewrites, no opinion on whether the work is finished.
- Keep the whole answer under 250 words.
- Write the entire summary in the language requested by the user prompt.`

/** Character budget for the working diff. Matches the branch/PR features. */
const MAX_WORKING_DIFF_CHARS = 8000

export interface WorkingExplanationInput {
  /** `working`-scope git context: worktree vs HEAD, untracked included. */
  context: AiContext
  /** BCP-47-ish language tag (`'fr'` / `'en'`) the summary should be written in. */
  language?: string
}

/** Builds the user-turn prompt: the changed files with their statuses, then the working diff. */
export function buildWorkingExplanationPrompt(input: WorkingExplanationInput): string {
  const { context, language } = input

  let prompt = `Repository: ${context.repoName} (branch: ${context.branch})
Write the entire summary in ${languageName(language)}.
`

  if (context.files.length > 0) {
    // The statuses carry information the diff alone does not — an untracked file is a new one the
    // developer may not even have meant to leave lying around.
    prompt += `\nUncommitted files:\n${context.files
      .map((f) => `- ${f.path} (${f.status})`)
      .join('\n')}\n`
  }

  prompt += `\n--- DIFF (working tree vs HEAD) ---\n${truncateDiff(
    context.diff,
    MAX_WORKING_DIFF_CHARS
  )}\n--- END DIFF ---

Summarize the work in progress.`

  return prompt
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
