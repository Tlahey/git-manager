import type { JsonSchema, ScanCommitFile } from '../config'
import type { CompletionFeature } from '../runtime'
import { budgetDiff } from './diffBudget'
import { diffCharBudget } from './diffCoverage'
import { estimateTokens } from '../promptSize'
import { languageName } from './language'

/** What one commit answered about the question it was read against. */
export interface CommitRelevanceResult {
  /** Whether this commit has anything to do with the question. */
  relevant: boolean
  /**
   * What it did about it, one or two sentences — empty when `relevant` is false.
   *
   * Written in the user's language because it is displayed as-is next to the commit in the panel,
   * not only folded into the synthesis.
   */
  finding: string
  /**
   * The paths in *this* commit that carry the answer, as the model named them.
   *
   * Model-provided and therefore unverified here: the orchestrator intersects them with the commit's
   * real file list before anything is shown, so a hallucinated path is dropped rather than displayed
   * as a link that opens nothing.
   */
  files: string[]
}

export interface CommitRelevanceInput {
  /** The user's question, verbatim. */
  question: string
  /** The commit being read. */
  commit: {
    shortOid: string
    subject: string
    body: string
    author: string
    /** Author timestamp, seconds since the epoch. */
    timestamp: number
  }
  /** The commit's changed paths, so the model sees the shape of it even where the diff is trimmed. */
  files: ScanCommitFile[]
  /** The commit's own patch text (versus its first parent). */
  diff: string
  /** BCP-47-ish tag the `finding` should be written in. */
  language?: string
  contextTokens?: number
}

/**
 * Room one verdict needs.
 *
 * Bigger than a file summary's 160: this answer is prose (one or two sentences) plus a path list, and
 * a truncated object is a parse failure for the commit — which in a search means a commit silently
 * dropping out of the answer, the exact failure reading commit-by-commit exists to prevent.
 */
export const COMMIT_RELEVANCE_OUTPUT_TOKENS = 320

export const COMMIT_RELEVANCE_INSTRUCTION = `You are reading ONE git commit to decide whether it answers a specific question about a repository's recent history.

You are given the question, the commit's message, the paths it touched, and its diff.

Answer with three fields:
- relevant: true only if this commit actually bears on the question. A commit that merely touches a file with a similar name, or that mentions the topic in passing without changing it, is NOT relevant.
- finding: when relevant, one or two sentences saying what this commit changed with respect to the question — concretely, in terms of behaviour ("adds a loading state to the button and drops the old spinner prop"), never a restatement of the commit subject. Empty string when not relevant.
- files: when relevant, the paths from the provided list that carry that change. Copy them EXACTLY as given. Never invent a path, never include a path that is not in the list.

Rules (STRICT):
- Judge ONLY from the material given. You are reading one commit out of many; do not speculate about what other commits did, and do not answer the question overall — that is done later, from every commit's verdict.
- The diff may have been shortened to fit. Base your answer on what you can actually see; a file you cannot see is not evidence.
- Be strict about relevance. A false positive costs the user a wrong claim about their own history.`

/** Constrains the verdict to the three fields. Strict — the parser still tolerates prose, because a
 * provider honoring `response_format` is not something to count on. */
export const COMMIT_RELEVANCE_SCHEMA: JsonSchema = {
  name: 'commit_relevance',
  schema: {
    type: 'object',
    properties: {
      relevant: {
        type: 'boolean',
        description: 'Whether this commit bears on the question.',
      },
      finding: {
        type: 'string',
        description: 'One or two sentences on what it changed; empty when not relevant.',
      },
      files: {
        type: 'array',
        description: 'Paths from the provided list that carry the change.',
        items: { type: 'string' },
      },
    },
    required: ['relevant', 'finding', 'files'],
    additionalProperties: false,
  },
  strict: true,
}

/** ISO day for the prompt — the model needs the commit's date to place it, not its epoch seconds. */
function isoDay(timestampSeconds: number): string {
  return new Date(timestampSeconds * 1000).toISOString().slice(0, 10)
}

export function buildCommitRelevancePrompt(input: CommitRelevanceInput): string {
  const body = input.commit.body.trim()
  const header = `Question: ${input.question}
Write "finding" in ${languageName(input.language)}.

Commit ${input.commit.shortOid} — ${isoDay(input.commit.timestamp)} — ${input.commit.author}
Subject: ${input.commit.subject}${body ? `\nBody:\n${body}` : ''}

Files touched:
${input.files.map((f) => `- ${f.path} (${f.status})`).join('\n') || '(none)'}`

  const budgeted = budgetDiff(
    input.diff,
    diffCharBudget({
      instruction: COMMIT_RELEVANCE_INSTRUCTION,
      envelopeTokens: estimateTokens(header),
      contextTokens: input.contextTokens,
      reservedOutputTokens: COMMIT_RELEVANCE_OUTPUT_TOKENS,
    })
  )

  return `${header}

Diff:

--- DIFF ---
${budgeted.text}
--- END DIFF ---`
}

/** Coerces an unknown value into a clean list of non-empty trimmed strings. */
function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter((v) => v.length > 0)
}

/**
 * Reads the verdict back, tolerating a fenced or prose-wrapped object.
 *
 * `relevant` is taken as true only for a real `true` (or the string `"true"`, which some providers
 * emit under a loose schema): anything unreadable falls back to *not* relevant, because a commit
 * wrongly kept ends up asserted in the final answer, while one wrongly dropped only makes the answer
 * less complete. Throws on input with no usable object at all, so the orchestrator can record the
 * commit as unread instead of silently treating a provider failure as a clean "no".
 */
export function parseCommitRelevance(raw: string): CommitRelevanceResult {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end <= start) throw new Error('AI relevance response did not contain JSON')

  let parsed: unknown
  try {
    parsed = JSON.parse(raw.slice(start, end + 1))
  } catch {
    throw new Error('AI relevance response was not valid JSON')
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('AI relevance response was not a JSON object')
  }

  const record = parsed as Record<string, unknown>
  const claimed = record.relevant === true || record.relevant === 'true'
  const finding = typeof record.finding === 'string' ? record.finding.trim() : ''
  // A "relevant" verdict with nothing to say is not one: it would put a commit in the answer that the
  // model could not describe, which reads to the user as an unexplained accusation. Everything below
  // is derived from the *accepted* verdict, so a rejected one cannot leave its files behind.
  const relevant = claimed && finding.length > 0

  return {
    relevant,
    finding: relevant ? finding : '',
    files: relevant ? toStringList(record.files) : [],
  }
}

/**
 * Completion feature: decide whether ONE commit answers the user's question, and say how.
 *
 * The **map** half of the AI commit search, and the reason the search reads history commit by commit
 * rather than dropping a month of diffs into one prompt: a window holds a few commits' patches, so a
 * single-prompt search would answer from whichever commits happened to fit — and "the button did not
 * change" is a *wrong* answer, not a partial one, when the commit that changed it was the one left
 * out. One small call per commit removes the window as the limit.
 */
export const commitRelevanceFeature: CompletionFeature<CommitRelevanceInput, CommitRelevanceResult> =
  {
    id: 'commit-relevance',
    kind: 'completion',
    instruction: COMMIT_RELEVANCE_INSTRUCTION,
    // Judgement, not description, but a judgement that must be reproducible across a hundred commits
    // in one run: the same commit read twice should not flip sides.
    temperature: 0.1,
    schema: COMMIT_RELEVANCE_SCHEMA,
    buildPrompt: buildCommitRelevancePrompt,
    parse: parseCommitRelevance,
    reservedOutputTokens: () => COMMIT_RELEVANCE_OUTPUT_TOKENS,
  }
