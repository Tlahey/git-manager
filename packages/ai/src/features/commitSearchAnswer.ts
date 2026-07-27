import type { StreamingFeature } from '../runtime'
import { diffCharBudget } from './diffCoverage'
import { languageName } from './language'
import { estimateTokens } from '../promptSize'

/** One commit the map phase judged relevant, as the synthesis sees it. */
export interface CommitSearchFinding {
  shortOid: string
  subject: string
  /** Author date as an ISO day (`2026-07-14`) — the reader asks "recently?", so dates are the answer. */
  date: string
  author: string
  /** What the map phase said this commit did about the question. */
  finding: string
  /** The paths carrying it, already checked against the commit's real file list. */
  files: string[]
}

export interface CommitSearchAnswerInput {
  /** The user's question, verbatim. */
  question: string
  repoName: string
  branch: string
  /** Human window label the answer may quote back ("since 2026-06-27", "the last 30 days"). */
  window: string
  /** The relevant commits, newest first. Empty is a normal, meaningful case: the answer is "no". */
  findings: CommitSearchFinding[]
  /** How many commits were actually read — the denominator of every claim below. */
  scanned: number
  /** True when the window held more commits than were read, so "none found" is not "none exists". */
  truncated: boolean
  language?: string
  contextTokens?: number
}

/**
 * One instruction, and the whole feature's honesty lives in it.
 *
 * The failure mode this guards is specific: a search that reads a *slice* of history and then answers
 * "no, the button was never touched" is not giving a partial answer, it is giving a wrong one. So the
 * negative answer is required to name its own limits, and every positive claim is required to carry
 * the commit it came from — the user's next move is to go and look at that commit.
 */
export const COMMIT_SEARCH_ANSWER_INSTRUCTION = `You are answering a developer's question about what happened in their repository's recent history.

Every commit in the searched window was read individually beforehand. You are given the ones judged relevant, each with a note on what it did about the question. You are NOT given the diffs — the notes are your only evidence.

Output rules (STRICT):
- Return ONLY the answer as GitHub-flavored Markdown — no preamble, no title, no surrounding code fences.
- Open with a single bold sentence that answers the question directly: yes or no, and the headline. If the answer is yes, say how many commits and over what period.
- Then, when there are relevant commits, a "## What changed" section: one bullet per commit, newest first, in the form "- \`<short sha>\` — <what it did>". Mention the files with backticks when it helps. Do not restate the commit subject verbatim; the reader sees it in the list beside your answer.
- When several commits are part of one story, say so in the bullets ("finishes what \`abc1234\` started") rather than merging them — every commit that was found must appear.
- Then a "## In short" line of one or two sentences: the state of things now, as far as the evidence shows.
- If NO relevant commit was found, say so plainly and stop after the opening sentence plus one line stating what was searched (how many commits, over what window). Do not pad, do not speculate about where else to look, do not suggest the user search differently.
- If the search was truncated, state in the answer that only the most recent commits of the window were read, so "not found" means "not in what was read".
- Base every statement ONLY on the notes given. Never invent a commit, a file, or a change. Never claim something did NOT happen outside the window you were given.
- Keep the whole answer under 300 words.
- Write the entire answer in the language requested below.`

/** Renders one finding, at decreasing detail so the list can be made to fit. */
function findingLine(f: CommitSearchFinding, detail: 'full' | 'short'): string {
  const head = `- \`${f.shortOid}\` (${f.date}, ${f.author}) — ${f.subject}`
  if (detail === 'short') return `${head}\n  ${f.finding}`
  const files = f.files.length > 0 ? `\n  files: ${f.files.join(', ')}` : ''
  return `${head}\n  ${f.finding}${files}`
}

/**
 * Renders the findings, dropping the per-commit file lists before dropping any commit.
 *
 * The order matters: a commit missing from this list is a commit the answer will not mention at all,
 * which is the one outcome reading history commit-by-commit exists to prevent. File paths are the
 * expendable part — the panel lists them beside the answer either way.
 */
export function renderFindings(findings: CommitSearchFinding[], budgetChars: number): string {
  for (const detail of ['full', 'short'] as const) {
    const rendered = findings.map((f) => findingLine(f, detail)).join('\n')
    if (rendered.length <= budgetChars || detail === 'short') return rendered
  }
  /* c8 ignore next */
  return ''
}

export function buildCommitSearchAnswerPrompt(input: CommitSearchAnswerInput): string {
  const header = `Repository: ${input.repoName} (branch: ${input.branch})
Question: ${input.question}
Searched: ${input.scanned} commit(s), ${input.window}.${
    input.truncated
      ? '\nNote: the window held more commits than were read; only the most recent ones were.'
      : ''
  }`

  const budget = diffCharBudget({
    instruction: COMMIT_SEARCH_ANSWER_INSTRUCTION,
    envelopeTokens: estimateTokens(header),
    contextTokens: input.contextTokens,
  })

  const body =
    input.findings.length > 0
      ? `Relevant commits (${input.findings.length}, newest first):\n${renderFindings(
          input.findings,
          budget
        )}`
      : 'No commit in what was read bears on the question.'

  return `${header}

${body}

Answer the question. Write the answer in ${languageName(input.language)}.`
}

/**
 * Streaming feature: answer the user's question from every commit's individual verdict.
 *
 * The **reduce** half of the AI commit search. Streaming because it is prose a human reads as it
 * arrives — and because by the time it starts, the user has already watched a progress bar walk
 * through their month of history, so the answer appearing token by token is the first sign the wait
 * is nearly over.
 */
export const commitSearchAnswerFeature: StreamingFeature<CommitSearchAnswerInput> = {
  id: 'commit-search-answer',
  kind: 'streaming',
  instruction: COMMIT_SEARCH_ANSWER_INSTRUCTION,
  temperature: 0.2,
  buildPrompt: buildCommitSearchAnswerPrompt,
}
