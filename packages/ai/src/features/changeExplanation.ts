import type { StreamingFeature } from '../runtime'

/** The instruction (system prompt) for explaining one file's pending changes. Streaming markdown,
 * like {@link prDescriptionFeature}: the output is prose the user reads, not data the app parses,
 * so there is nothing worth constraining with a JSON schema.
 *
 * The whole point of the feature is the *context*: the model gets the file's current content
 * alongside its patch, so it can say what the change means for that file rather than narrating the
 * `+`/`-` lines the user is already looking at. */
export const CHANGE_EXPLANATION_INSTRUCTION = `You are an expert software engineer explaining an uncommitted change in ONE file to the developer reviewing it.

You are given the file's patch and, when available, the file's current content — the context the change lives in. Use that context: explain what the change does to this file's behavior and role, not what the +/- lines literally say (the developer is already looking at them).

Output rules (STRICT):
- Return ONLY the explanation as GitHub-flavored Markdown — no preamble, no title, no surrounding code fences.
- Start with a single bold sentence summarizing the change as a whole.
- Then 2 to 5 bullet points, each covering one concrete modification and why it matters in this file (the function/class/section it touches, what its behavior becomes). Reference identifiers with backticks.
- End with a "⚠️" line ONLY when the patch shows something the developer should genuinely double-check before committing — leftover debug output, a removed guard, a hardcoded secret or credential, a signature change with callers left unvisited. Omit the line entirely when nothing warrants it; never invent a concern to fill it.
- Base every statement ONLY on the patch and the file content you were given. Do not guess at code you cannot see, do not speculate about callers in other files, and do not suggest rewrites — this is an explanation, not a review.
- Keep the whole answer under 200 words.
- Write the entire explanation in the language requested by the user prompt.`

/** Character budget for the patch. Larger than the commit-message feature's: an explanation is about
 * one file, so the whole patch usually fits and truncating it costs the most useful evidence. */
const MAX_PATCH_CHARS = 8000

/** Character budget for the file's content. The content is *supporting* context — when a file is
 * huge, keeping its head (imports, type/class declarations, the top-level shape) is what situates
 * the change; the change's own lines are already in the patch. */
const MAX_FILE_CONTENT_CHARS = 8000

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
}

/** Human-readable language name for the prompt, so the model writes the explanation in the UI
 * language rather than defaulting to English. */
function languageName(tag: string | undefined): string {
  switch (tag) {
    case 'fr':
      return 'French'
    default:
      return 'English'
  }
}

/** Truncates supporting context to a budget, appending a marker so the model knows it saw only a
 * prefix and doesn't conclude the file simply ends there. */
function truncateContext(text: string, maxChars: number, label: string): string {
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars)}\n\n[${label} truncated, showing first ${maxChars} chars]`
}

/** Builds the user-turn prompt: the file's identity and change volume, its current content as
 * context, then the patch to explain. */
export function buildChangeExplanationPrompt(input: ChangeExplanationInput): string {
  const { repoName, file, fileContent, language } = input

  let prompt = `Repository: ${repoName}
File: ${file.path} (${file.status}, +${file.additions}/-${file.deletions})
Write the entire explanation in ${languageName(language)}.
`

  const content = fileContent?.trim()
  if (content) {
    prompt += `\n--- CURRENT FILE CONTENT (context for the change) ---\n${truncateContext(
      content,
      MAX_FILE_CONTENT_CHARS,
      'file'
    )}\n--- END FILE CONTENT ---\n`
  } else {
    // Saying so beats silence: without the note the model tends to invent the surrounding code it
    // assumes it should have been given.
    prompt += `\n(The file's content is not available — explain the change from the patch alone, and do not speculate about the code around it.)\n`
  }

  prompt += `\n--- PATCH ---\n${truncateContext(file.patch, MAX_PATCH_CHARS, 'patch')}\n--- END PATCH ---

Explain what this change does to the file.`

  return prompt
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
