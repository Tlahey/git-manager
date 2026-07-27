import type { JsonSchema } from '../config'
import type { CompletionFeature } from '../runtime'
import { languageName } from './language'
import { diffCharBudget } from './diffCoverage'
import { estimateTokens, RESERVED_OUTPUT_TOKENS } from '../promptSize'

/** One archived briefing offered to the model as a candidate answer. */
export interface SummarySearchCandidate {
  /** Repository display name — half of the (repo, date) pair that identifies a briefing. */
  repo: string
  /** `YYYY-MM-DD`. */
  date: string
  /** The briefing's own text, already flattened to `headline` + bullets by the caller. */
  text: string
}

export interface SummarySearchInput {
  /** The user's question, in their own words. */
  question: string
  /** The days the local search engine shortlisted, best match first. */
  candidates: SummarySearchCandidate[]
  language: string
  contextTokens?: number
}

/** One briefing the model judged relevant, with its reason. `repo`/`date` are echoed back from the
 * candidate list so the UI can link to the actual file. */
export interface SummarySearchMatch {
  repo: string
  date: string
  /** Why this day answers the question, one short clause. */
  reason: string
}

export interface SummarySearchAnswer {
  /** A direct prose answer to the question, grounded in the candidates. */
  answer: string
  /** The days the answer rests on, so the user can open them. */
  matches: SummarySearchMatch[]
}

export const SUMMARY_SEARCH_INSTRUCTION = `You are answering a question about a developer's own archive of daily work briefings.

You are given a question and a shortlist of briefings, each identified by a repository name and a date. Answer the question from those briefings and nothing else.

Answer with a JSON object carrying two fields, "answer" and "matches".

Rules (STRICT):
- "answer" is a direct, plain answer in at most 4 sentences. Lead with the answer, not with a restatement of the question. Refer to days by their date ("on 2026-07-21") rather than by their position in the list.
- "matches" lists ONLY the briefings the answer actually rests on, most relevant first, each with the repo and date copied EXACTLY as given and a one-clause "reason". Copying a repo or date you were not given makes the answer unusable — never do it.
- If the shortlist does not contain the answer, say so plainly in "answer" and return an empty "matches". Do not guess, and do not fill the gap with what a project like this usually does.
- The briefings are the only evidence. Never invent a day, a repository, a feature or a date that is not in the list.
- Write ALL text in the language requested by the user prompt.`

/** Constrains the answer to {@link SummarySearchAnswer}. Root is an object, like every other
 * structured feature here — a bare-array root is rejected by several providers under strict mode. */
export const SUMMARY_SEARCH_SCHEMA: JsonSchema = {
  name: 'summary_search',
  schema: {
    type: 'object',
    properties: {
      answer: {
        type: 'string',
        description: 'Direct answer to the question, at most 4 sentences.',
      },
      matches: {
        type: 'array',
        description: 'The briefings the answer rests on, most relevant first.',
        items: {
          type: 'object',
          properties: {
            repo: { type: 'string', description: 'Repository name, copied exactly.' },
            date: { type: 'string', description: 'Briefing date (YYYY-MM-DD), copied exactly.' },
            reason: { type: 'string', description: 'Why this day answers the question.' },
          },
          required: ['repo', 'date', 'reason'],
          additionalProperties: false,
        },
      },
    },
    required: ['answer', 'matches'],
    additionalProperties: false,
  },
  strict: true,
}

/** Renders the shortlist, dropping the least relevant days once the budget is spent.
 *
 * Dropping from the tail rather than truncating each entry is deliberate: the candidates arrive
 * ranked, so the tail is what the local engine already judged least relevant, and a briefing cut
 * mid-sentence is worse evidence than one that is absent. */
function renderCandidates(candidates: SummarySearchCandidate[], budgetChars: number): string {
  const rendered: string[] = []
  let used = 0
  for (const candidate of candidates) {
    const block = `## ${candidate.repo} — ${candidate.date}\n${candidate.text.trim()}`
    if (used + block.length > budgetChars && rendered.length > 0) break
    rendered.push(block)
    used += block.length
  }
  return rendered.join('\n\n')
}

export function buildSummarySearchPrompt(input: SummarySearchInput): string {
  const header = `Question: ${input.question}
Write the answer in ${languageName(input.language)}.`

  const budget = diffCharBudget({
    instruction: SUMMARY_SEARCH_INSTRUCTION,
    envelopeTokens: estimateTokens(header),
    contextTokens: input.contextTokens,
    reservedOutputTokens: RESERVED_OUTPUT_TOKENS,
  })

  return `${header}

Briefings to answer from:

${renderCandidates(input.candidates, budget)}

Answer the question as JSON.`
}

/** Keeps only well-formed matches: both identifiers present, since a match the UI can't resolve back
 * to a file is worse than no match at all. */
function toMatches(value: unknown): SummarySearchMatch[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return []
    const record = entry as Record<string, unknown>
    const repo = typeof record.repo === 'string' ? record.repo.trim() : ''
    const date = typeof record.date === 'string' ? record.date.trim() : ''
    const reason = typeof record.reason === 'string' ? record.reason.trim() : ''
    if (!repo || !date) return []
    return [{ repo, date, reason }]
  })
}

export function parseSummarySearch(raw: string): SummarySearchAnswer {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end <= start) {
    throw new Error('AI search response did not contain JSON')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw.slice(start, end + 1))
  } catch {
    throw new Error('AI search response was not valid JSON')
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('AI search response was not a JSON object')
  }

  const record = parsed as Record<string, unknown>
  const answer = typeof record.answer === 'string' ? record.answer.trim() : ''
  const matches = toMatches(record.matches)
  if (!answer && matches.length === 0) {
    throw new Error('AI search response was empty')
  }
  return { answer, matches }
}

/**
 * Completion feature: answer a question about the archived briefings.
 *
 * Deliberately *not* a retrieval system. The local scorer
 * (`apps/desktop/src/lib/searchDailySummaries.ts`) does the narrowing, and this call only reads the
 * shortlist — which keeps the whole thing one bounded request against a local model, with no index
 * to build, no embeddings to store and nothing to keep in sync with a folder the user may edit by
 * hand. Two months of short briefings is a small enough corpus that lexical ranking finds the right
 * days; what the model adds is reading them.
 */
export const summarySearchFeature: CompletionFeature<SummarySearchInput, SummarySearchAnswer> = {
  id: 'summary-search',
  kind: 'completion',
  instruction: SUMMARY_SEARCH_INSTRUCTION,
  // Low: this is retrieval and quotation, not composition. A creative answer here is a wrong one.
  temperature: 0.1,
  schema: SUMMARY_SEARCH_SCHEMA,
  buildPrompt: buildSummarySearchPrompt,
  parse: parseSummarySearch,
}
