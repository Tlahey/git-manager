import type { JsonSchema } from '../config'
import { estimateTokens, RESERVED_OUTPUT_TOKENS } from '../promptSize'

/** One proposed commit in a batch plan: a Conventional Commits message and the changed files it
 * should contain. This is the typed contract the frontend processes — see the JSON schema below,
 * which constrains the model to exactly this shape. */
export interface ProposedCommit {
  commitMessage: string
  files: string[]
}

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

/** Files per commit assumed when reserving room for the plan's own scaffolding. Deliberately low:
 * the instruction asks for minimality, so real plans group more than this, and over-counting commits
 * reserves a little too much rather than truncating the answer. */
const FILES_PER_COMMIT_ESTIMATE = 4

/** `{"commitMessage":"<up to 72 chars>","files":[]},` — the keys, the punctuation and a subject. */
const PER_COMMIT_TOKENS = 40

/** Applied to the measured total, covering the estimate in {@link estimateTokens} itself. */
const OUTPUT_SLACK = 1.1

/**
 * Room this feature's answer needs, in tokens, for a plan over `paths`.
 *
 * The only feature whose answer length is a property of its *question*. The coverage rule says every
 * changed file must appear in the plan, verbatim — so the JSON necessarily restates the whole input
 * file list, plus a message per commit and the structural punctuation around both. A flat reserve
 * cannot serve that: sized for a five-file change it truncates a forty-file plan mid-array, and
 * because the output is parsed rather than read, that is not a vaguer answer but
 * `parseCommitPlan` throwing "not valid JSON".
 *
 * It takes the **paths**, not their count, because the count cannot answer the question. This
 * replaces a flat 24 tokens per file, which was calibrated on nothing in particular and turned out to
 * be roughly the cost of a deep path *alone*: `apps/desktop/src/components/git-graph/components/
 * CommitBatchReviewPanel.tsx` is ~21 tokens before its quotes, leaving nothing for the commit
 * messages or the JSON around them — so on a repo with nested paths the plan truncated, while on a
 * flat one the same 24 reserved several times what the answer used. The paths are in hand when the
 * prompt is built, so measuring them is both cheaper and more accurate than any per-file constant.
 *
 * The floor keeps small changesets at the ordinary prose reserve.
 */
export function groupingOutputTokens(paths: string[]): number {
  // What the paths cost inside the JSON: the path itself, its quotes and its separator.
  const pathTokens = estimateTokens(paths.map((p) => `"${p}",`).join(''))
  const commits = Math.max(1, Math.ceil(paths.length / FILES_PER_COMMIT_ESTIMATE))
  const measured = Math.ceil((pathTokens + commits * PER_COMMIT_TOKENS) * OUTPUT_SLACK)
  return Math.max(RESERVED_OUTPUT_TOKENS, measured)
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

  const commits = rawItems.map(toProposedCommit).filter((c): c is ProposedCommit => c !== null)
  if (commits.length === 0) throw new Error('AI grouping response contained no usable commits')
  return commits
}
