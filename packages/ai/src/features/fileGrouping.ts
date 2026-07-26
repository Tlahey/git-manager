import type { AiContext, JsonSchema } from '../config'
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

/** One proposed commit in a batch plan: a Conventional Commits message and the changed files it
 * should contain. This is the typed contract the frontend processes — see the JSON schema below,
 * which constrains the model to exactly this shape. */
export interface ProposedCommit {
  commitMessage: string
  files: string[]
}

/**
 * The instruction (system prompt) for splitting the working tree into atomic commits.
 *
 * The partial-diff rules take a different shape here than on the prose features, because the failure
 * they prevent is different. Nothing is published and nothing is narrated — the output is JSON the
 * app turns into real commits — so there is no coverage line to ban. What a budgeted diff threatens
 * instead is the **coverage rule itself**: every changed file must land in exactly one commit, and a
 * model shown the diff of nine files out of forty has a standing invitation to plan nine and drop
 * the rest. That is not a vaguer answer, it is a broken one — the app would offer a commit plan that
 * silently leaves most of the user's work unstaged.
 *
 * So the file list is declared as the authority (it is complete, and cheap, where the diff is
 * neither), and the model is told in as many words that a file it could not read is still a file it
 * must place — from its path, which is usually enough to know that `foo.test.ts` belongs with
 * `foo.ts`.
 */
export const FILE_GROUPING_INSTRUCTION = `You are an expert software engineer reviewing a set of UNCOMMITTED changes and splitting them into a series of clean, atomic commits.

First reason about which files change together for a single purpose, then produce the commit plan.

The "Changed files" list is COMPLETE and is the authority on what you must plan. The diff shows as many of those files as fitted — it is evidence about them, not the list of them.

Rules (STRICT):
- Atomicity: each commit groups files that serve ONE logical change (e.g. a feature and its tests, a rename spanning several files, a config change and its documentation). Never mix unrelated changes in one commit.
- Ordering: order the commits so that applying them in sequence stays coherent (e.g. a refactor before the feature that builds on it, a dependency bump before the code that needs it).
- Coverage: every file in "Changed files" MUST appear in exactly ONE commit — including every file whose diff you were not shown. Do not omit, duplicate across commits, or invent files; use the given paths verbatim.
- A file you could not read is placed from its path: a test beside the module it tests, a locale file with the feature that added its keys, a lockfile with the dependency change. When its path gives you nothing, put it in the commit whose subject covers the broadest related area rather than leaving it out.
- Minimality: prefer the fewest commits that keep them atomic. Use a single commit when everything is one change; split only when the changes are genuinely independent.
- Messages: each commitMessage follows Conventional Commits — <type>(<scope>): <description>, imperative mood ("add", "fix", "remove"), lower-case description, no trailing period, max 72 characters. <scope> is optional; omit it when a commit spans unrelated areas.
- These messages will be COMMITTED. Never mention truncation, budgets, or what you could not read in any commitMessage.

Types: feat, fix, refactor, perf, docs, style, test, build, ci, chore.`

/** JSON Schema constraining the model's structured output. Root is an object (many providers reject
 * a bare-array root under strict mode) wrapping the `commits` array of `{ commitMessage, files }`. */
export const FILE_GROUPING_SCHEMA: JsonSchema = {
  name: 'commit_plan',
  schema: {
    type: 'object',
    properties: {
      commits: {
        type: 'array',
        description: 'The ordered list of atomic commits the changes should be split into.',
        items: {
          type: 'object',
          properties: {
            commitMessage: {
              type: 'string',
              description: 'Conventional Commits message, imperative mood, max 72 chars.',
            },
            files: {
              type: 'array',
              description: 'Paths of the changed files in this commit, verbatim.',
              items: { type: 'string' },
            },
          },
          required: ['commitMessage', 'files'],
          additionalProperties: false,
        },
      },
    },
    required: ['commits'],
    additionalProperties: false,
  },
  strict: true,
}

export interface FileGroupingInput {
  /** `working`-scope git context: worktree vs HEAD, untracked included. */
  context: AiContext
  /**
   * The model's context window, from the connection settings. Sizes how much of the working diff is
   * sent.
   *
   * Replaces a flat 8000-character cut. The overflow it could cause was the expensive one here: this
   * prompt's file list is not optional decoration but the set the model must partition, and an
   * overflow drops tokens from the *start* — so the list itself, and the instruction above it, were
   * what fell out of the window while the diff was kept whole. Absent falls back to the pessimistic
   * default.
   */
  contextTokens?: number
}

/** Everything the prompt carries before the omitted list and the diff — the complete file list and
 * the project's commit style. Never budgeted away: the list is what the model partitions, so cutting
 * it would not shorten the answer but corrupt it. */
function buildPromptHeader(context: AiContext): string {
  const fileList = context.files.map((f) => `- ${f.path} (${f.status})`).join('\n')

  return `Repository: ${context.repoName} (branch: ${context.branch})

Changed files:
${fileList}
${buildCommitStyleSection({
  convention: context.commitConvention,
  recentCommits: context.recentCommits,
  userInstructions: context.commitInstructions,
  pattern: context.commitPattern,
})}`
}

/** Builds the user-turn prompt: the list of changed files (with status) so the model has the exact
 * paths to partition, followed by the budgeted working-tree diff for the reasoning. */
export function buildGroupingUserPrompt(input: FileGroupingInput): string {
  const { context } = input
  const header = buildPromptHeader(context)

  const budgeted = budgetDiff(
    context.diff,
    diffCharBudget({
      instruction: FILE_GROUPING_INSTRUCTION,
      envelopeTokens: estimateTokens(header) + OMITTED_RESERVE_TOKENS,
      contextTokens: input.contextTokens,
    })
  )

  // `group` rather than `describe`: the verb has to match what the model is being told not to do
  // with those files, and here it must emphatically still *place* them — only its reasoning about
  // them is unevidenced.
  const notIncluded = notIncludedSection(budgeted.omitted, 'reason about the contents of')

  return `${header}${notIncluded}
Split these files into atomic commits. Diff for context:

--- DIFF ---
${budgeted.text}
--- END DIFF ---`
}

/**
 * What this plan will and will not have been reasoned from, computed without sending anything.
 *
 * The one feature where low coverage does not degrade the answer's *shape*: the plan still covers
 * every file, because the list it partitions is complete. What degrades is the quality of the
 * grouping — files placed by path rather than by content — which is worth telling the user before
 * they accept a plan that will create real commits.
 */
export function assessFileGroupingCoverage(input: FileGroupingInput): DiffCoverage {
  return assessDiffCoverage(input.context.diff, {
    instruction: FILE_GROUPING_INSTRUCTION,
    envelopeTokens: estimateTokens(buildPromptHeader(input.context)) + OMITTED_RESERVE_TOKENS,
    contextTokens: input.contextTokens,
  })
}

/** Normalizes one raw item into a {@link ProposedCommit}, tolerating either `commitMessage` (the
 * schema field) or a legacy `message` key, and dropping non-string file paths. */
function toProposedCommit(item: unknown): ProposedCommit | null {
  if (typeof item !== 'object' || item === null) return null
  const record = item as Record<string, unknown>
  const rawMessage = record.commitMessage ?? record.message
  const { files } = record
  if (typeof rawMessage !== 'string' || !Array.isArray(files)) return null
  const paths = files.filter((f): f is string => typeof f === 'string')
  if (!rawMessage.trim() || paths.length === 0) return null
  return { commitMessage: rawMessage.trim(), files: paths }
}

/** Extracts the commit array from a structured-output response. Accepts the schema shape
 * (`{ "commits": [...] }`) or a bare `[...]` array, and tolerates prose/```json fences around it
 * so the same parser works whether or not the provider honored `response_format`. Throws on
 * anything unusable so callers surface a clear error rather than committing nothing. */
export function parseCommitPlan(raw: string): ProposedCommit[] {
  const objectStart = raw.indexOf('{')
  const arrayStart = raw.indexOf('[')

  let jsonText: string | undefined
  // Prefer whichever JSON container appears first.
  if (objectStart !== -1 && (arrayStart === -1 || objectStart < arrayStart)) {
    const end = raw.lastIndexOf('}')
    if (end > objectStart) jsonText = raw.slice(objectStart, end + 1)
  } else if (arrayStart !== -1) {
    const end = raw.lastIndexOf(']')
    if (end > arrayStart) jsonText = raw.slice(arrayStart, end + 1)
  }
  if (!jsonText) throw new Error('AI grouping response did not contain JSON')

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    throw new Error('AI grouping response was not valid JSON')
  }

  const rawItems = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as Record<string, unknown>)?.commits)
      ? ((parsed as Record<string, unknown>).commits as unknown[])
      : null
  if (!rawItems) throw new Error('AI grouping response had no "commits" array')

  const commits = rawItems
    .map(toProposedCommit)
    .filter((c): c is ProposedCommit => c !== null)
  if (commits.length === 0) throw new Error('AI grouping response contained no usable commits')
  return commits
}

/** Completion feature: partition the working-tree changes into an ordered plan of atomic commits,
 * using structured JSON output. */
export const fileGroupingFeature: CompletionFeature<FileGroupingInput, ProposedCommit[]> = {
  id: 'file-grouping',
  kind: 'completion',
  instruction: FILE_GROUPING_INSTRUCTION,
  temperature: 0.2,
  schema: FILE_GROUPING_SCHEMA,
  buildPrompt: buildGroupingUserPrompt,
  parse: parseCommitPlan,
}
