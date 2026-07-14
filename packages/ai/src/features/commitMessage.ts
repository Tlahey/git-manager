import type { AiContext, AiContextFile } from '../config'
import type { StreamingFeature } from '../runtime'
import { buildCommitStyleSection } from './commitConvention'

/** The instruction (system prompt) for commit-message generation. Lives here in `@git-manager/ai`
 * — the single home for the app's AI logic — rather than in the Rust provider (a dumb transport)
 * or the app's Settings (the user no longer edits instructions). */
export const COMMIT_MESSAGE_INSTRUCTION = `You are an expert software engineer writing a single Git commit message for a set of STAGED changes, following the Conventional Commits specification.

Output rules (STRICT):
- Return ONLY the commit message — no preamble, no explanation, no code fences, no surrounding quotes.
- Subject line: <type>(<scope>): <description>
  - <type> is chosen by intent: feat (new capability), fix (bug fix), refactor (behavior-preserving restructure), perf, docs, style, test, build, ci, chore.
  - <scope> is optional, lower-case, derived from the touched area (a module or directory); omit it when the change spans unrelated areas.
  - <description> is in the imperative mood ("add", "fix", "remove" — never "added"/"adds"), starts lower-case, has no trailing period, and is at most 72 characters.
- Add a body ONLY when the change needs rationale the subject cannot convey. Separate it with a blank line, wrap around 72 columns, and explain the "why", not the "what".

Types: feat, fix, refactor, perf, docs, style, test, build, ci, chore.`

const MAX_DIFF_CHARS = 4000

/** Truncates an oversized diff so the prompt stays within a reasonable token budget, appending a
 * marker so the model knows it saw only a prefix. */
export function truncateDiff(diff: string, maxChars = MAX_DIFF_CHARS): string {
  if (diff.length <= maxChars) return diff
  return `${diff.slice(0, maxChars)}\n\n[diff truncated, showing first ${maxChars} chars]`
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

/** Builds the user-turn prompt: repo/branch context line, a detected-scope hint when the changes
 * are cohesive, then the (possibly truncated) staged diff. */
export function buildCommitUserPrompt(context: AiContext): string {
  let prefix = `Repository: ${context.repoName} (branch: ${context.branch})\n`

  const scope = detectScope(context.files)
  if (scope) prefix += `Suggested scope: ${scope}\n`

  prefix += buildCommitStyleSection({
    convention: context.commitConvention,
    recentCommits: context.recentCommits,
    userInstructions: context.commitInstructions,
    pattern: context.commitPattern,
  })

  return `${prefix}\nAnalyze the following Git diff and generate a commit message:\n\n--- DIFF ---\n${truncateDiff(
    context.diff
  )}\n--- END DIFF ---`
}

/** Streaming feature: turn the staged diff into a Conventional Commits message, token by token. */
export const commitMessageFeature: StreamingFeature<AiContext> = {
  id: 'commit-message',
  kind: 'streaming',
  instruction: COMMIT_MESSAGE_INSTRUCTION,
  temperature: 0.3,
  buildPrompt: buildCommitUserPrompt,
}
