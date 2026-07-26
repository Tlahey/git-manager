import type { StreamingFeature } from '../runtime'
import { budgetDiff } from './diffBudget'
import {
  assessDiffCoverage,
  diffCharBudget,
  nextCommonWindow,
  OMITTED_RESERVE_TOKENS,
  type DiffCoverage,
} from './diffCoverage'
import { languageName } from './language'
import { contextTokensFor, estimateTokens } from '../promptSize'

/** The instruction (system prompt) for explaining one file's pending changes. Streaming markdown,
 * like {@link prDescriptionFeature}: the output is prose the user reads, not data the app parses,
 * so there is nothing worth constraining with a JSON schema.
 *
 * The whole point of the feature is the *context*: the model gets the file's current content
 * alongside its patch, so it can say what the change means for that file rather than narrating the
 * `+`/`-` lines the user is already looking at.
 *
 * That context is also what makes this the one feature with **two** variable parts competing for the
 * same window, and the absence-of-evidence rule matters here more than anywhere else because of it.
 * When the content is trimmed the model holds the head of a file — its imports and declarations —
 * and is asked about a change further down. Every conclusion of the form "this function is never
 * called" or "the guard was removed" is then drawn from a window that simply ended before the
 * evidence. It is the same wrong inference the review makes on a narrow hunk, one level worse: here
 * the missing text is the *surrounding file*, which the prompt has just promised it was given. */
export const CHANGE_EXPLANATION_INSTRUCTION = `You are an expert software engineer explaining an uncommitted change in ONE file to the developer reviewing it.

You are given the file's patch and, when available, as much of the file's current content as fits — the context the change lives in. Use that context: explain what the change does to this file's behavior and role, not what the +/- lines literally say (the developer is already looking at them).

Output rules (STRICT):
- Return ONLY the explanation as GitHub-flavored Markdown — no preamble, no title, no surrounding code fences.
- Start with a single bold sentence summarizing the change as a whole. That sentence is about THE CHANGE — never about the patch or the file content being incomplete, truncated, or hard to read.
- Then 2 to 5 bullet points, each covering one concrete modification and why it matters in this file (the function/class/section it touches, what its behavior becomes). Reference identifiers with backticks.
- NEVER mention truncation, budgets, or what you could not read — no note, no caveat, not one word. The interface already tells the reader how much was read.
- End with a "⚠️" line ONLY when the patch shows something the developer should genuinely double-check before committing — leftover debug output, a removed guard, a hardcoded secret or credential, a signature change with callers left unvisited. Omit the line entirely when nothing warrants it; never invent a concern to fill it.
- Base every statement ONLY on the patch and the file content you were given. Do not guess at code you cannot see, do not speculate about callers in other files, and do not suggest rewrites — this is an explanation, not a review.
- You may have been shown only the beginning of the file, and a patch shows only a few lines around each change. NEVER state that something is missing, absent, unused, or never called merely because you cannot see it — a declaration, a guard, a call site, or a cleanup may sit further down the file or outside the hunk. Absence of evidence is not evidence of absence.
- Keep the whole answer under 200 words.
- Write the entire explanation in the language requested by the user prompt.`

/**
 * The share of the variable budget the patch is guaranteed, when both parts want more than there is.
 *
 * The two are not equal claims on the window. The patch is *what is being explained*: with none of
 * it there is no answer at all, only a description of a file. The content is supporting context —
 * genuinely valuable, which is the feature's premise, but degrading gracefully in a way the patch
 * does not. So the patch is served first and floors at two thirds, and the content takes what is
 * left. When either wants less than its share the other gets the surplus, so the common case — a
 * small patch in a small file — still sends both whole.
 */
const PATCH_MIN_SHARE = 2 / 3

/** The changed file an explanation is about, as a self-describing unit: git's short status word, the
 * unified patch text, and the change volume. Deliberately not the app's `GitDiffFile` DTO — this
 * package stays free of `@git-manager/git-types` (see the app's `formatUnifiedPatch`). */
export interface ChangeExplanationFile {
  path: string
  /** Git's short status word (`added`/`modified`/`deleted`/`renamed`/`untracked`). */
  status: string
  /** Unified-diff text for this file alone (hunk headers included). */
  patch: string
  additions: number
  deletions: number
}

export interface ChangeExplanationInput {
  repoName: string
  file: ChangeExplanationFile
  /** The file's current (post-change) content, when it is a readable text file — the context the
   * explanation is grounded in. Omitted for deleted or binary files. */
  fileContent?: string
  /** BCP-47-ish language tag (`'fr'` / `'en'`) the explanation should be written in. Populated from
   * app Settings so the prose matches the UI language. */
  language?: string
  /**
   * The model's context window, from the connection settings. Sizes how much of the patch and the
   * file content are sent.
   *
   * Replaces two independent 8000-character cuts — 16 000 characters of variable content, roughly
   * 4600 tokens, sent into a window whose stock size is 4096. This was the worst of the six: the
   * *sum* was never checked against anything, so a large change in a large file overflowed on its
   * own, dropping the instruction from the start. Absent falls back to the pessimistic default.
   */
  contextTokens?: number
}

/** Truncates supporting context to a budget, appending a marker so the model knows it saw only a
 * prefix and doesn't conclude the file simply ends there. */
function truncateContext(text: string, maxChars: number, label: string): string {
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars)}\n\n[${label} truncated, showing first ${maxChars} chars]`
}

/** The header, whose size is known before any budgeting happens. Shared so the prompt and the
 * coverage report can never disagree about what the envelope costs. */
function buildPromptHeader(input: ChangeExplanationInput): string {
  const { repoName, file, language } = input

  return `Repository: ${repoName}
File: ${file.path} (${file.status}, +${file.additions}/-${file.deletions})
Write the entire explanation in ${languageName(language)}.
`
}

/**
 * How many characters of the file's content this prompt can afford, given what the patch needs.
 *
 * Returned rather than applied so both {@link buildChangeExplanationPrompt} and
 * {@link assessChangeExplanationCoverage} can hand the same number to `diffCharBudget` as
 * `siblingChars` — which is what makes the patch's budget identical on both paths, and the coverage
 * line true of the prompt that was actually sent.
 */
function contentCharBudget(input: ChangeExplanationInput): number {
  const content = input.fileContent?.trim() ?? ''
  if (!content) return 0

  // Everything both parts share, before either is allocated.
  const pool = diffCharBudget({
    instruction: CHANGE_EXPLANATION_INSTRUCTION,
    envelopeTokens: estimateTokens(buildPromptHeader(input)) + OMITTED_RESERVE_TOKENS,
    contextTokens: input.contextTokens,
  })

  // The patch takes what it needs, floored at its share and capped by what it would leave the
  // content — so a short patch hands its surplus over rather than reserving room it cannot use.
  const patchCeiling = Math.max(Math.round(pool * PATCH_MIN_SHARE), pool - content.length)
  const patchChars = Math.min(input.file.patch.length, patchCeiling)

  return Math.min(content.length, pool - patchChars)
}

/** Builds the user-turn prompt: the file's identity and change volume, as much of its current
 * content as the window affords, then the patch to explain. */
export function buildChangeExplanationPrompt(input: ChangeExplanationInput): string {
  const { file, fileContent } = input

  let prompt = buildPromptHeader(input)

  const content = fileContent?.trim()
  const contentBudget = contentCharBudget(input)

  if (content && contentBudget > 0) {
    prompt += `\n--- CURRENT FILE CONTENT (context for the change) ---\n${truncateContext(
      content,
      contentBudget,
      'file'
    )}\n--- END FILE CONTENT ---\n`
  } else {
    // Saying so beats silence: without the note the model tends to invent the surrounding code it
    // assumes it should have been given. Reached either when the caller sent no content (a deleted
    // or binary file) or when the window left no room for it — the model's position is the same
    // both ways, so the note is too.
    prompt += `\n(The file's content is not available — explain the change from the patch alone, and do not speculate about the code around it.)\n`
  }

  // Budgeted per file rather than blind-cut: a single-file patch has only one section, so this
  // mostly buys the truncation marker and the fallback for patch text carrying no `diff --git`
  // header. `siblingChars` is what keeps the content's allocation out of the patch's.
  const budgeted = budgetDiff(
    file.patch,
    diffCharBudget({
      instruction: CHANGE_EXPLANATION_INSTRUCTION,
      envelopeTokens: estimateTokens(buildPromptHeader(input)) + OMITTED_RESERVE_TOKENS,
      contextTokens: input.contextTokens,
      siblingChars: contentBudget,
    })
  )

  prompt += `\n--- PATCH ---\n${budgeted.text}\n--- END PATCH ---

Explain what this change does to the file.`

  return prompt
}

/**
 * What this explanation will and will not have read, computed without sending anything.
 *
 * The only feature that cannot take the shared assessment as-is, for two reasons that both come
 * from its prompt being about exactly one file:
 *
 * 1. **The file count is 1 by definition, not by parsing.** {@link assessDiffCoverage} derives its
 *    total by counting `diff --git` headers in the patch, which is a re-parse — and a caller holding
 *    hunk text without a header would be told "0 of 0 files, complete" about a patch that was in
 *    fact cut in half. The same re-parse mismatch the commit explanation had to re-base, in a form
 *    where the honest answer is simply known.
 * 2. **A trimmed file content is a partial reading too.** It is the *premise* of the feature — the
 *    change is supposed to be read against the file it lives in — so an explanation written from the
 *    first third of that file has not read everything, whatever the patch's own coverage says.
 */
export function assessChangeExplanationCoverage(input: ChangeExplanationInput): DiffCoverage {
  const content = input.fileContent?.trim() ?? ''
  const contentBudget = contentCharBudget(input)
  const fixedTokens = estimateTokens(buildPromptHeader(input)) + OMITTED_RESERVE_TOKENS

  const coverage = assessDiffCoverage(input.file.patch, {
    instruction: CHANGE_EXPLANATION_INSTRUCTION,
    envelopeTokens: fixedTokens,
    contextTokens: input.contextTokens,
    siblingChars: contentBudget,
  })

  const readWhole = coverage.complete && contentBudget >= content.length

  return {
    ...coverage,
    filesTotal: 1,
    filesRead: readWhole ? 1 : 0,
    complete: readWhole,
    // Recomputed against the content's *full* length rather than the slice that fitted: the shared
    // figure answers "what would carry the diff", and the question here is what would carry the diff
    // **and** the file it has to be read against.
    requiredContextTokens: nextCommonWindow(
      contextTokensFor(
        input.file.patch.length + content.length,
        estimateTokens(CHANGE_EXPLANATION_INSTRUCTION) + fixedTokens
      )
    ),
  }
}

/** Streaming feature: turn one file's pending patch, read in the context of the file it changes,
 * into a short markdown explanation, token by token. */
export const changeExplanationFeature: StreamingFeature<ChangeExplanationInput> = {
  id: 'change-explanation',
  kind: 'streaming',
  instruction: CHANGE_EXPLANATION_INSTRUCTION,
  // Lowest of the streaming features: an explanation of existing code should be reproducible and
  // grounded, with none of the prose latitude a PR description wants.
  temperature: 0.2,
  buildPrompt: buildChangeExplanationPrompt,
}
