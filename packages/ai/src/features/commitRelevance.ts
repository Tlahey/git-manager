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
 * Raised from 320 after watching a local model spend the whole budget and return an **empty**
 * answer: `subject` and `evidence` are paid for before `finding` starts, and a finding written in
 * French with two paths after it does not fit in what is left. An empty answer is not a soft
 * failure here — the commit is recorded as unread, which is the one outcome reading commit by
 * commit exists to avoid.
 */
export const COMMIT_RELEVANCE_OUTPUT_TOKENS = 512

export const COMMIT_RELEVANCE_INSTRUCTION = `You are reading ONE git commit to decide whether it answers a specific question about a repository's recent history.

You are given the question, the commit's message, the paths it touched, and its diff.

Answer with these fields, IN THIS ORDER:
- subject: the exact thing the question asks about, copied from the question in 2 to 5 words. Not what the commit is about — what the QUESTION is about.
- evidence: one concrete element OF THIS COMMIT'S DIFF that changes that exact thing — a symbol, a path, a changed line. Leave it EMPTY when the diff changes no such thing. This field is the test; fill it before deciding.
- relevant: true ONLY when "evidence" is non-empty. When "evidence" is empty, this is false.
- finding: when relevant, one or two sentences on what this commit changed about the subject, concretely, in terms of behaviour. Empty string when not relevant.
- files: when relevant, the paths from the provided list that carry that change. Copy them EXACTLY as given. Never invent a path, never include a path that is not in the list.

Rules (STRICT):
- **The default answer is false.** Most commits in a repository have nothing to do with any given question, and saying so is the expected outcome, not a failure to find something.
- Relevant means this commit changed THE THING NAMED. It does not mean the commit is in the same area, uses a similar word, belongs to the same feature, or touches a file whose name looks related. A question about a button component is NOT answered by a commit that adds a menu entry, an icon, a panel or a dialog — those are also components, and none of them is the button.
- Do NOT describe the commit. If what you are about to write in "finding" reads like a summary of what the commit does, rather than an answer about the subject, then the verdict is false and "finding" must be empty.
- Judge ONLY from the material given. You are reading one commit out of many; do not speculate about what other commits did, and do not answer the question overall — that is done later, from every commit's verdict.
- The diff may have been shortened to fit. Base your answer on what you can actually see; a file you cannot see is not evidence.
- A false positive is worse than a miss: it puts a wrong claim about the user's own history in front of them, sourced to a commit they will go and open.`

/**
 * Constrains the verdict to the five fields, **in generation order**.
 *
 * The order is the point, not presentation: a model fills the fields as it writes them, so putting
 * `subject` and `evidence` before `relevant` makes it name what is being asked about and point at
 * something in the diff *before* it can claim a match. With `relevant` first, the decision was
 * already made by the time any justification existed, and what came back was a summary of the
 * commit with `relevant: true` attached — the failure this ordering exists to remove.
 *
 * Strict, and the parser still tolerates prose: a provider honoring `response_format` is not
 * something to count on (Ollama's OpenAI-compatible endpoint ignores it for some models).
 */
export const COMMIT_RELEVANCE_SCHEMA: JsonSchema = {
  name: 'commit_relevance',
  schema: {
    type: 'object',
    properties: {
      subject: {
        type: 'string',
        description: 'The exact thing the QUESTION asks about, 2-5 words copied from it.',
      },
      evidence: {
        type: 'string',
        description:
          'One concrete element of this diff that changes that thing; empty when there is none.',
      },
      relevant: {
        type: 'boolean',
        description: 'True only when "evidence" is non-empty.',
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
    required: ['subject', 'evidence', 'relevant', 'finding', 'files'],
    additionalProperties: false,
  },
  strict: true,
}

/** ISO day for the prompt — the model needs the commit's date to place it, not its epoch seconds. */
function isoDay(timestampSeconds: number): string {
  return new Date(timestampSeconds * 1000).toISOString().slice(0, 10)
}

/** Everything before the diff: the question, the commit's own message, and the paths it touched. */
function buildHeader(input: CommitRelevanceInput): string {
  const body = input.commit.body.trim()
  return `Question: ${input.question}
Write "finding" in ${languageName(input.language)}.

Commit ${input.commit.shortOid} — ${isoDay(input.commit.timestamp)} — ${input.commit.author}
Subject: ${input.commit.subject}${body ? `\nBody:\n${body}` : ''}

Files touched:
${input.files.map((f) => `- ${f.path} (${f.status})`).join('\n') || '(none)'}`
}

/** The diff's own allowance, once the instruction, this commit's header and the answer are paid for. */
function budgetFor(input: CommitRelevanceInput, header: string): number {
  return diffCharBudget({
    instruction: COMMIT_RELEVANCE_INSTRUCTION,
    envelopeTokens: estimateTokens(header),
    contextTokens: input.contextTokens,
    reservedOutputTokens: COMMIT_RELEVANCE_OUTPUT_TOKENS,
  })
}

export function buildCommitRelevancePrompt(input: CommitRelevanceInput): string {
  const header = buildHeader(input)
  const budgeted = budgetDiff(input.diff, budgetFor(input, header))

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
 * Thrown when a verdict cannot be read at all — no JSON, no recognisable labels, or nothing back.
 *
 * A distinct type rather than a plain `Error` because the two ways a commit goes unread are two
 * different problems for the user: a model whose *answer* is unreadable usually means the provider
 * is ignoring the requested output format (and every commit will fail the same way), while a call
 * that never returned means the provider is down or slow. Told apart here, the panel can say which
 * one happened instead of reporting an unexplained count.
 */
export class CommitVerdictUnreadable extends Error {
  constructor(detail: string) {
    super(detail)
    this.name = 'CommitVerdictUnreadable'
  }
}

/** The field labels the prose fallback recognises, in the order the schema asks for them. */
const PROSE_FIELDS = ['subject', 'evidence', 'relevant', 'finding', 'files'] as const

/**
 * Reads a verdict out of a provider that ignored `response_format` and answered in prose.
 *
 * Not a nicety: Ollama's OpenAI-compatible endpoint drops the JSON schema for some models, and what
 * comes back is `relevant: true\nfinding: …\nfiles:\n- a\n- b` — perfectly readable, and rejected
 * outright by a JSON-only parser. Without this, that provider does not produce a *degraded* search,
 * it produces one where **every** commit is recorded as unread.
 *
 * Deliberately narrow: it only picks up the known labels, and the same acceptance rules are applied
 * to the result afterwards, so a prose answer cannot get in on easier terms than a JSON one.
 */
function parseProseVerdict(raw: string): Record<string, unknown> | null {
  // Locate each label, allowing markdown bold and a leading bullet: "- **relevant**: true".
  const positions = PROSE_FIELDS.map((field) => {
    const match = new RegExp(`(?:^|\\n|\\s)[-*\\s]*\\*{0,2}"?${field}"?\\*{0,2}\\s*:`, 'i').exec(raw)
    return { field, start: match ? match.index + match[0].length : -1 }
  }).filter((p) => p.start >= 0)

  if (positions.length === 0) return null

  positions.sort((a, b) => a.start - b.start)
  const record: Record<string, unknown> = {}
  positions.forEach((position, index) => {
    const end = index + 1 < positions.length ? positions[index + 1].start : raw.length
    // The next label's own text ("\n- files:") is part of this slice; trimming the trailing label
    // is what the lookahead of the next position already handled, so only the value remains.
    const value = raw
      .slice(position.start, end)
      .replace(/\n[-*\s]*\*{0,2}"?\w+"?\*{0,2}\s*:\s*$/, '')
      .trim()
      .replace(/^["']|["'],?$/g, '')
      .trim()

    if (position.field === 'relevant') {
      record.relevant = /^(true|yes|oui)\b/i.test(value)
    } else if (position.field === 'files') {
      record.files = value
        .split('\n')
        .map((line) => line.replace(/^[-*\s]+/, '').replace(/[",]+$/g, '').trim())
        .filter((line) => line.length > 0 && !line.startsWith('['))
    } else {
      record[position.field] = value
    }
  })
  return record
}

/**
 * Reads the verdict back, from JSON when the provider honored the schema and from prose when it did
 * not.
 *
 * Three things must hold for a commit to count as a match, and all three are enforced here rather
 * than trusted to the instruction:
 *
 *  1. `relevant` is claimed — a real `true`, or the string some providers emit under a loose schema;
 *  2. `evidence` is non-empty — the model had to point at something in *this* diff. This is the gate
 *     that removes the observed failure where a commit was matched because it was vaguely in the
 *     same area, with a summary of the commit pasted into `finding`;
 *  3. `finding` is non-empty — a match the model cannot describe reads to the user as an
 *     unexplained accusation against their own history.
 *
 * Anything unreadable falls back to *not* relevant: a commit wrongly kept ends up asserted in the
 * final answer, while one wrongly dropped only makes that answer less complete. Throws when there is
 * no usable answer at all, so the orchestrator records the commit as unread instead of turning a
 * provider failure into a clean "no".
 */
export function parseCommitRelevance(raw: string): CommitRelevanceResult {
  if (raw.trim().length === 0) throw new CommitVerdictUnreadable('the model returned nothing')

  let record: Record<string, unknown> | null = null

  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start !== -1 && end > start) {
    try {
      const parsed: unknown = JSON.parse(raw.slice(start, end + 1))
      if (typeof parsed === 'object' && parsed !== null) record = parsed as Record<string, unknown>
    } catch {
      // Falls through to the prose reader: a truncated or fenced object is often still readable as
      // labelled text, and this answer is small enough that guessing is not worth it either way.
    }
  }

  record ??= parseProseVerdict(raw)
  if (record === null) {
    throw new CommitVerdictUnreadable('the answer was neither JSON nor labelled text')
  }

  const claimed = record.relevant === true || record.relevant === 'true'
  const evidence = typeof record.evidence === 'string' ? record.evidence.trim() : ''
  const finding = typeof record.finding === 'string' ? record.finding.trim() : ''
  // "none", "n/a" and friends are how a model writes an empty field when a schema forbids omitting
  // it; treating them as evidence would reopen the hole this gate closes.
  const hasEvidence = evidence.length > 0 && !/^(none|n\/a|null|aucune?|-{1,2})$/i.test(evidence)
  const relevant = claimed && hasEvidence && finding.length > 0

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
