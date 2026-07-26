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
import { estimateTokens } from '../promptSize'

/** The instruction (system prompt) for PR-description generation. Streaming, freeform markdown —
 * like {@link commitMessageFeature} rather than a structured/JSON feature, because a PR body is one
 * prose blob the user then edits, not multi-field data worth constraining with a schema.
 *
 * The rule against remarking on coverage is stricter here than anywhere else, and for a reason no
 * other feature has: **this output gets published**. Every explanation feature writes into a panel
 * the user reads and closes; this one writes into a pull request that reviewers, and the project's
 * history, keep. "Note: parts of the diff were not available to me" is a sentence that would ship to
 * a repository over the author's name, and it says nothing about the change — it describes the tool
 * that drafted it. The commit list is complete whatever the diff budget does, so the description is
 * scoped from that. */
export const PR_DESCRIPTION_INSTRUCTION = `You are an expert software engineer writing the DESCRIPTION (body) of a GitHub pull request that bundles a whole branch's changes.

You are given the pull request's commit list, the files it touches, and as much of its diff as fits. The commit list and the file list are COMPLETE even when the diff is not: scope the description with them, and take detail from the diff.

Output rules (STRICT):
- Return ONLY the pull-request description as GitHub-flavored Markdown — no preamble, no explanation, no surrounding code fences, no title line.
- Be concrete and grounded in the actual diff, file list and commit list you are given. Do not invent changes, tickets, or tests that are not evidenced.
- Write in an even, factual tone. Prefer short bullet points over long paragraphs. Do not restate the diff line by line; summarize intent.
- This description will be PUBLISHED on a pull request. NEVER mention truncation, budgets, context windows, or what you could not read — not a note, not a caveat, not a parenthesis. You are writing as the change's author, who read all of it.
- Account for a file you could only see in the list from its path ("the same rename across 9 call sites", "4 documentation pages"). Say what it evidently is, never what it evidently does.
- A diff shows only a few lines around each change. NEVER state that something is missing, absent, or not done merely because you cannot see it — a guard, a test, a call site, or a cleanup may sit just outside the few lines you were shown. Absence of evidence is not evidence of absence.
- When a template is provided, fill it in: keep every heading and structural element exactly as given, replacing only the placeholder/prompt text under each with real content. Leave a section briefly noted as not applicable rather than deleting its heading. Do not add headings the template does not have.
- When no template is provided, structure the description as: a one-paragraph "## Summary", then "## Changes" (bulleted), then "## Test plan" (bulleted; write "- Not covered by automated tests" if the diff adds none).`

/**
 * Cap on the changed-file list in the prompt. Same value and reasoning as the code review's — an
 * enumeration whose thirtieth entry still informs and whose fiftieth does not, charged against the
 * same pool as the diff.
 */
const MAX_LISTED_CHANGED_FILES = 30

export interface PrDescriptionInput {
  /** Range-scope git context: `merge-base(base, HEAD)..HEAD` diff, files, and range commits. */
  context: AiContext
  /** The repo's PR template to fill in, or `null` to use the default Summary/Changes/Test plan. */
  templateContent: string | null
  /**
   * The model's context window, from the connection settings. Sizes how much of the range diff is
   * sent.
   *
   * Replaces a flat 8000-character cut. The overflow half of that bug bit hardest here: this prompt
   * carries a *template* the model is told to reproduce exactly, and an overflow drops tokens from
   * the start — so on a stock Ollama window the template could be the thing that fell out, and the
   * feature's most visible rule silently stopped applying. Absent falls back to the pessimistic
   * default.
   */
  contextTokens?: number
}

/**
 * The template's own cost, which the diff has to pay for.
 *
 * It sits *after* the diff in the prompt yet is budgeted with the header, because size is what
 * matters to a budget, not order. Some repositories ship long templates — a checklist per area,
 * several hundred tokens — and before this they were simply added on top of an 8000-character diff.
 */
function templateSection(templateContent: string | null): string {
  return templateContent && templateContent.trim()
    ? `\nFill in the following pull-request template, preserving its headings and structure exactly:\n\n--- TEMPLATE ---\n${templateContent}\n--- END TEMPLATE ---`
    : `\nNo template is provided — write the description using the default Summary / Changes / Test plan structure.`
}

/** Everything the prompt carries around the diff — the header before it and the template after it.
 * Shared so {@link buildPrDescriptionUserPrompt} and {@link assessPrDescriptionCoverage} can never
 * disagree about what the envelope costs. */
function buildPromptHeader(input: PrDescriptionInput): string {
  const { context } = input

  let header = `Repository: ${context.repoName}\nBranch: ${context.branch}`
  if (context.baseRef) header += ` → base: ${context.baseRef}`
  header += '\n'

  const commits = context.rangeCommits ?? []
  if (commits.length > 0) {
    header += `\nCommits in this pull request (newest first):\n`
    header += commits.map((c) => `- ${c}`).join('\n')
    header += '\n'
  }

  if (context.files.length > 0) {
    // Sent for the same reason the commit list is: it stays complete when the diff does not, and a
    // description scoped by a partial diff quietly omits whole areas of the change.
    header += `\nChanged files:\n${cappedList(
      context.files.map((f) => `${f.path} (${f.status})`),
      MAX_LISTED_CHANGED_FILES
    )}\n`
  }

  return header
}

/** Builds the user-turn prompt: a repo/branch/base header, the branch's commit subjects, the changed
 * files, the budgeted range diff, then either the template to fill in or a request for the default
 * structure. */
export function buildPrDescriptionUserPrompt(input: PrDescriptionInput): string {
  const header = buildPromptHeader(input)
  const template = templateSection(input.templateContent)

  // Both ends of the prompt are envelope, and both are measured: the template is part of what the
  // window must hold even though it is written last.
  const budgeted = budgetDiff(
    input.context.diff,
    diffCharBudget({
      instruction: PR_DESCRIPTION_INSTRUCTION,
      envelopeTokens: estimateTokens(header + template) + OMITTED_RESERVE_TOKENS,
      contextTokens: input.contextTokens,
    })
  )

  let prompt = header
  prompt += notIncludedSection(budgeted.omitted, 'describe')
  prompt += `\n--- DIFF (base..HEAD) ---\n${budgeted.text}\n--- END DIFF ---\n`
  prompt += template

  return prompt
}

/**
 * What this description will and will not have been written from, computed without sending anything.
 *
 * Exported for the same reason as the others, and used differently: the composer can tell an author
 * that the draft they are about to publish was written from a third of the branch — which is worth
 * knowing *before* it ships, precisely because the text itself is forbidden from saying so.
 */
export function assessPrDescriptionCoverage(input: PrDescriptionInput): DiffCoverage {
  return assessDiffCoverage(input.context.diff, {
    instruction: PR_DESCRIPTION_INSTRUCTION,
    envelopeTokens:
      estimateTokens(buildPromptHeader(input) + templateSection(input.templateContent)) +
      OMITTED_RESERVE_TOKENS,
    contextTokens: input.contextTokens,
  })
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
