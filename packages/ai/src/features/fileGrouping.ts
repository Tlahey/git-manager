import type { AiContext, JsonSchema } from '../config'
import type { CompletionFeature } from '../runtime'
import { truncateDiff } from './commitMessage'
import { buildCommitStyleSection } from './commitConvention'

/** One proposed commit in a batch plan: a Conventional Commits message and the changed files it
 * should contain. This is the typed contract the frontend processes — see the JSON schema below,
 * which constrains the model to exactly this shape. */
export interface ProposedCommit {
  commitMessage: string
  files: string[]
}

export const FILE_GROUPING_INSTRUCTION = `You are an expert software engineer reviewing a set of UNCOMMITTED changes and splitting them into a series of clean, atomic commits.

First reason about which files change together for a single purpose, then produce the commit plan.

Rules (STRICT):
- Atomicity: each commit groups files that serve ONE logical change (e.g. a feature and its tests, a rename spanning several files, a config change and its documentation). Never mix unrelated changes in one commit.
- Ordering: order the commits so that applying them in sequence stays coherent (e.g. a refactor before the feature that builds on it, a dependency bump before the code that needs it).
- Coverage: every provided file MUST appear in exactly ONE commit. Do not omit, duplicate across commits, or invent files — use the given paths verbatim.
- Minimality: prefer the fewest commits that keep them atomic. Use a single commit when everything is one change; split only when the changes are genuinely independent.
- Messages: each commitMessage follows Conventional Commits — <type>(<scope>): <description>, imperative mood ("add", "fix", "remove"), lower-case description, no trailing period, max 72 characters. <scope> is optional; omit it when a commit spans unrelated areas.

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

const MAX_GROUPING_DIFF_CHARS = 8000

/** Builds the user-turn prompt: the list of changed files (with status) so the model has the exact
 * paths to partition, followed by the working-tree diff for the reasoning. */
export function buildGroupingUserPrompt(context: AiContext): string {
  const fileList = context.files.map((f) => `- ${f.path} (${f.status})`).join('\n')

  return `Repository: ${context.repoName} (branch: ${context.branch})

Changed files:
${fileList}
${buildCommitStyleSection({
  convention: context.commitConvention,
  recentCommits: context.recentCommits,
  userInstructions: context.commitInstructions,
  pattern: context.commitPattern,
})}
Split these files into atomic commits. Diff for context:

--- DIFF ---
${truncateDiff(context.diff, MAX_GROUPING_DIFF_CHARS)}
--- END DIFF ---`
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
export const fileGroupingFeature: CompletionFeature<AiContext, ProposedCommit[]> = {
  id: 'file-grouping',
  kind: 'completion',
  instruction: FILE_GROUPING_INSTRUCTION,
  temperature: 0.2,
  schema: FILE_GROUPING_SCHEMA,
  buildPrompt: buildGroupingUserPrompt,
  parse: parseCommitPlan,
}
