import type { JsonSchema } from '../config'
import type { CompletionFeature } from '../runtime'
import { diffCharBudget } from './diffCoverage'
import { estimateTokens } from '../promptSize'
import { languageName } from './language'

/** One commit as the quick scan sees it: its message, and nothing of what it actually changed. */
export interface QuickScanCommit {
  shortOid: string
  subject: string
  /** Commit body, trimmed; empty when subject-only. Part of the message, so part of the evidence. */
  body: string
  author: string
  /** Author date as an ISO day — the question is usually "recently?", so dates carry weight. */
  date: string
}

export interface CommitQuickScanInput {
  question: string
  repoName: string
  branch: string
  commits: QuickScanCommit[]
  language?: string
  contextTokens?: number
}

/** One commit the shortlist picked out, with why its message made it worth opening. */
export interface QuickScanMatch {
  shortOid: string
  /**
   * Why this commit is worth opening, from its message alone.
   *
   * Never shown to the user and never carried into the answer: what reaches them is the verdict the
   * *deep* read produced after opening it. It is required all the same, as a gate — a shortlist
   * entry the model cannot justify in a sentence is a guess, and the same discipline is what
   * `evidence` enforces one level down.
   */
  reason: string
}

/**
 * Room the answer needs: one line per match, and a repository question rarely has many.
 *
 * Sized for roughly a dozen matches. Past that the answer is not a search result any more, and a
 * truncated JSON array is read as "no matches" — the failure this budget exists to keep away from a
 * feature whose whole selling point is that it answers in one call.
 */
export const COMMIT_QUICK_SCAN_OUTPUT_TOKENS = 900

export const COMMIT_QUICK_SCAN_INSTRUCTION = `You are drawing up a SHORTLIST. You are given a developer's question about their repository's recent history, and the MESSAGES of that history's commits — subject and body only. You have NOT been given any diff, any file path, or any code.

Pick the commits worth opening. Each one you pick will then have its actual code read and judged; each one you leave out will not be looked at again.

Answer with one field:
- matches: an array of { shortOid, reason }, newest first. Use the short sha EXACTLY as given. "reason" is one short sentence on what in the message makes this commit worth opening. Return an empty array when no message gives any reason to open a commit.

Rules (STRICT):
- **This is a shortlist, not a verdict.** A message is a claim about what someone did, and you cannot confirm it from here. Never state what the code does; say what the message suggests.
- **When in doubt, include it.** The costs are not symmetric: a commit you include wrongly is opened, read and dismissed a moment later, while a commit you leave out is gone from the answer for good. Err towards opening.
- That is not licence to include everything. A message giving no indication whatsoever about the question is not a candidate — returning the whole history would defeat the point of the shortlist.
- Judge on what is named. A question about a button is not indicated by a message about a menu, an icon, a panel or a dialog — those are other things — but a vague message on the same component ("fix: button edge case") IS worth opening, precisely because you cannot tell from it.
- Never invent a short sha. Every one you return must appear in the list you were given.
- Do not explain your selection, do not add commentary outside the field.`

export const COMMIT_QUICK_SCAN_SCHEMA: JsonSchema = {
  name: 'commit_quick_scan',
  schema: {
    type: 'object',
    properties: {
      matches: {
        type: 'array',
        description: 'The commits worth opening, newest first.',
        items: {
          type: 'object',
          properties: {
            shortOid: { type: 'string', description: 'Exactly as given in the list.' },
            reason: {
              type: 'string',
              description: 'One short sentence on what makes this commit worth opening.',
            },
          },
          required: ['shortOid', 'reason'],
          additionalProperties: false,
        },
      },
    },
    required: ['matches'],
    additionalProperties: false,
  },
  strict: true,
}

/** One commit's line in the prompt. Compact on purpose: the whole list has to fit in one window. */
function commitLine(commit: QuickScanCommit): string {
  const body = commit.body.trim()
  return `- ${commit.shortOid} (${commit.date}, ${commit.author}) ${commit.subject}${
    body ? `\n    ${body.replace(/\n+/g, ' ').slice(0, 400)}` : ''
  }`
}

export function buildCommitQuickScanPrompt(input: CommitQuickScanInput): string {
  const header = `Repository: ${input.repoName} (branch: ${input.branch})
Question: ${input.question}
Write "reason" in ${languageName(input.language)}.`

  const budget = diffCharBudget({
    instruction: COMMIT_QUICK_SCAN_INSTRUCTION,
    envelopeTokens: estimateTokens(header),
    contextTokens: input.contextTokens,
    reservedOutputTokens: COMMIT_QUICK_SCAN_OUTPUT_TOKENS,
  })

  // Newest first, and cut from the *oldest* end when the list outgrows the window: "did this change
  // recently?" is answered by the recent end, so that is the end worth keeping.
  const lines: string[] = []
  let used = 0
  for (const commit of input.commits) {
    const line = commitLine(commit)
    if (used + line.length + 1 > budget) break
    lines.push(line)
    used += line.length + 1
  }

  return `${header}

Commits (${lines.length} of ${input.commits.length}, newest first):
${lines.join('\n')}`
}

/**
 * Reads the shortlist back, dropping anything the model made up.
 *
 * The shas are checked by the caller against the real commit list — a fabricated one would be a
 * commit nobody can open. Here only the shape is enforced: an entry needs a sha and a reason,
 * because a commit picked without one is a guess that would cost a full file-by-file read.
 */
export function parseCommitQuickScan(raw: string): QuickScanMatch[] {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end <= start) return []

  let parsed: unknown
  try {
    parsed = JSON.parse(raw.slice(start, end + 1))
  } catch {
    return []
  }
  if (typeof parsed !== 'object' || parsed === null) return []

  const matches = (parsed as { matches?: unknown }).matches
  if (!Array.isArray(matches)) return []

  return matches.flatMap((entry): QuickScanMatch[] => {
    if (typeof entry !== 'object' || entry === null) return []
    const record = entry as Record<string, unknown>
    const shortOid = typeof record.shortOid === 'string' ? record.shortOid.trim() : ''
    const reason = typeof record.reason === 'string' ? record.reason.trim() : ''
    if (shortOid.length === 0 || reason.length === 0) return []
    return [{ shortOid, reason }]
  })
}

/**
 * Completion feature: from a whole history's **messages**, in one call, pick the commits worth
 * opening.
 *
 * The quick search's first half, and only its first half — whatever this returns is then read
 * file by file by `commitRelevanceFeature`, exactly as the deep search reads everything. So the two
 * modes differ in *coverage*, not in the evidence behind the answers that come back: a commit this
 * shortlists is judged on its code, and a commit it passes over is never looked at.
 *
 * That asymmetry is why its instruction leans the opposite way to the deep scan's. There, a false
 * positive is the expensive mistake — it puts a wrong claim about the user's own history in front of
 * them. Here it costs one file-by-file read that then rejects the commit, while a false negative
 * removes that commit from the answer permanently. So the deep scan is told the default is "no", and
 * this one is told that when in doubt it should open the commit.
 *
 * What it is forbidden from doing is stating what any code *does* — it has seen none — which is why
 * the field it returns is a `reason` for opening rather than a finding, and why nothing it writes
 * ever reaches the user.
 */
export const commitQuickScanFeature: CompletionFeature<CommitQuickScanInput, QuickScanMatch[]> = {
  id: 'commit-quick-scan',
  kind: 'completion',
  instruction: COMMIT_QUICK_SCAN_INSTRUCTION,
  // Selection, not writing: the same list of messages should yield the same shortlist twice running.
  temperature: 0.1,
  schema: COMMIT_QUICK_SCAN_SCHEMA,
  buildPrompt: buildCommitQuickScanPrompt,
  parse: parseCommitQuickScan,
  reservedOutputTokens: () => COMMIT_QUICK_SCAN_OUTPUT_TOKENS,
}
