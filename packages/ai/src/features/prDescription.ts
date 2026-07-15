import type { AiContext } from '../config'
import type { StreamingFeature } from '../runtime'
import { truncateDiff } from './commitMessage'

/** The instruction (system prompt) for PR-description generation. Streaming, freeform markdown —
 * like {@link commitMessageFeature} rather than a structured/JSON feature, because a PR body is one
 * prose blob the user then edits, not multi-field data worth constraining with a schema. */
export const PR_DESCRIPTION_INSTRUCTION = `You are an expert software engineer writing the DESCRIPTION (body) of a GitHub pull request that bundles a whole branch's changes.

Output rules (STRICT):
- Return ONLY the pull-request description as GitHub-flavored Markdown — no preamble, no explanation, no surrounding code fences, no title line.
- Be concrete and grounded in the actual diff and commit list you are given. Do not invent changes, tickets, or tests that are not evidenced.
- Write in an even, factual tone. Prefer short bullet points over long paragraphs. Do not restate the diff line by line; summarize intent.
- When a template is provided, fill it in: keep every heading and structural element exactly as given, replacing only the placeholder/prompt text under each with real content. Leave a section briefly noted as not applicable rather than deleting its heading. Do not add headings the template does not have.
- When no template is provided, structure the description as: a one-paragraph "## Summary", then "## Changes" (bulleted), then "## Test plan" (bulleted; write "- Not covered by automated tests" if the diff adds none).`

const MAX_PR_DIFF_CHARS = 8000

export interface PrDescriptionInput {
  /** Range-scope git context: `merge-base(base, HEAD)..HEAD` diff, files, and range commits. */
  context: AiContext
  /** The repo's PR template to fill in, or `null` to use the default Summary/Changes/Test plan. */
  templateContent: string | null
}

/** Builds the user-turn prompt: a repo/branch/base header, the branch's commit subjects, the
 * (possibly truncated) range diff, then either the template to fill in or a request for the default
 * structure. */
export function buildPrDescriptionUserPrompt(input: PrDescriptionInput): string {
  const { context, templateContent } = input

  let prompt = `Repository: ${context.repoName}\nBranch: ${context.branch}`
  if (context.baseRef) prompt += ` → base: ${context.baseRef}`
  prompt += '\n'

  const commits = context.rangeCommits ?? []
  if (commits.length > 0) {
    prompt += `\nCommits in this pull request (newest first):\n`
    prompt += commits.map((c) => `- ${c}`).join('\n')
    prompt += '\n'
  }

  prompt += `\n--- DIFF (base..HEAD) ---\n${truncateDiff(context.diff, MAX_PR_DIFF_CHARS)}\n--- END DIFF ---\n`

  if (templateContent && templateContent.trim()) {
    prompt += `\nFill in the following pull-request template, preserving its headings and structure exactly:\n\n--- TEMPLATE ---\n${templateContent}\n--- END TEMPLATE ---`
  } else {
    prompt += `\nNo template is provided — write the description using the default Summary / Changes / Test plan structure.`
  }

  return prompt
}

/** Streaming feature: turn a branch's range diff + commits into a PR description, token by token. */
export const prDescriptionFeature: StreamingFeature<PrDescriptionInput> = {
  id: 'pr-description',
  kind: 'streaming',
  instruction: PR_DESCRIPTION_INSTRUCTION,
  // Between commit-message (0.3) and grouping (0.2): a touch more prose latitude, still grounded.
  temperature: 0.4,
  buildPrompt: buildPrDescriptionUserPrompt,
}
