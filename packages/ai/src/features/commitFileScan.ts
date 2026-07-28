import type { JsonSchema, ScanCommitFile } from '../config'
import type { CompletionFeature } from '../runtime'
import { diffCharBudget } from './diffCoverage'
import { estimateTokens } from '../promptSize'

export interface CommitFileScanInput {
  /** The user's question, verbatim. */
  question: string
  /** The commit the paths belong to — its message is what makes a path legible. */
  commit: {
    shortOid: string
    subject: string
    /** The commit's intent, already shortened by the caller. */
    body: string
  }
  /** Every path the commit touched. */
  files: ScanCommitFile[]
  contextTokens?: number
}

/**
 * Room a list of paths needs.
 *
 * A repository path runs to a dozen tokens, and a shortlist past a handful stops being a shortlist —
 * so this covers roughly twenty. Truncation here reads as "fewer files worth opening", which is a
 * quiet loss rather than a failure, and the reason the budget is not tighter than it looks.
 */
export const COMMIT_FILE_SCAN_OUTPUT_TOKENS = 500

export const COMMIT_FILE_SCAN_INSTRUCTION = `You are narrowing down which files of ONE commit are worth reading. You are given a developer's question, the commit's message, and every path the commit touched. You have NOT been given any diff.

Each path you return will have its diff read and judged. Each one you leave out will not be looked at again.

Answer with one field:
- paths: an array of the paths worth opening, copied EXACTLY as given. Return an empty array when no path could plausibly carry an answer to the question.

Rules (STRICT):
- **When in doubt, include it.** The costs are not symmetric: a file you include wrongly is read and dismissed a moment later, while a file you leave out is gone from the answer for good.
- Judge on what the path and the commit's message suggest, never on what you imagine the code does — you have not seen it.
- A path is worth opening when it names the thing asked about, when it is where that thing would live in this project, or when the commit's message suggests it was touched for that reason.
- Leave out what plainly cannot bear on the question: lock files, snapshots, generated output, translation catalogues, unrelated modules.
- Do NOT return every path. Returning all of them defeats the purpose; if the question genuinely bears on the whole commit, return the handful most central to it.
- Never invent a path. Every one you return must appear in the list you were given.`

export const COMMIT_FILE_SCAN_SCHEMA: JsonSchema = {
  name: 'commit_file_scan',
  schema: {
    type: 'object',
    properties: {
      paths: {
        type: 'array',
        description: 'The paths worth opening, copied exactly from the list given.',
        items: { type: 'string' },
      },
    },
    required: ['paths'],
    additionalProperties: false,
  },
  strict: true,
}

export function buildCommitFileScanPrompt(input: CommitFileScanInput): string {
  const body = input.commit.body.trim()
  const header = `Question: ${input.question}

Commit ${input.commit.shortOid}
Subject: ${input.commit.subject}${body ? `\n${body}` : ''}`

  const budget = diffCharBudget({
    instruction: COMMIT_FILE_SCAN_INSTRUCTION,
    envelopeTokens: estimateTokens(header),
    contextTokens: input.contextTokens,
    reservedOutputTokens: COMMIT_FILE_SCAN_OUTPUT_TOKENS,
  })

  // Paths are short and the backend caps them at sixty per commit, so this cut is close to
  // unreachable — a commit's whole path list is a couple of thousand characters against a budget
  // sized for its diff. The count is stated anyway, because a shortlist drawn from a list the model
  // was only shown part of is a different thing from one drawn from all of it.
  const lines: string[] = []
  let used = 0
  for (const file of input.files) {
    const line = `- ${file.path} (${file.status})`
    if (used + line.length + 1 > budget) break
    lines.push(line)
    used += line.length + 1
  }

  return `${header}

Files touched (${lines.length} of ${input.files.length}):
${lines.join('\n')}`
}

/** Reads the path list back. Anything unreadable yields nothing, and the caller opens everything. */
export function parseCommitFileScan(raw: string): string[] {
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

  const paths = (parsed as { paths?: unknown }).paths
  if (!Array.isArray(paths)) return []
  return paths
    .filter((p): p is string => typeof p === 'string')
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
}

/**
 * Completion feature: of one commit's paths, which are worth opening — in one call.
 *
 * The quick search's second narrowing, and the one that actually decides how long it takes. The
 * first narrows *commits* and was not enough on a repository where a feature commit touches thirty
 * files: a measured run shortlisted thirteen commits and still spent **ninety-four** calls opening
 * their files, one of them thirty-four on its own. This replaces those thirty-four with one call
 * plus the three or four paths it keeps.
 *
 * It exists only in the quick mode, and it is the second half of that mode's single trade: the deep
 * search opens everything and takes as long as that takes. Both halves are the same bet stated at
 * two levels — *what the message says* for commits, *what the path says* for files — and both are
 * reported to the user as coverage they gave up, never as evidence they gained.
 *
 * Like the commit shortlist, it is told to **lean towards including**, for the same asymmetry: an
 * extra path costs one read that dismisses it, a missing one is gone from the answer. And like it,
 * the paths it returns are intersected with the commit's real files before anything is opened.
 */
export const commitFileScanFeature: CompletionFeature<CommitFileScanInput, string[]> = {
  id: 'commit-file-scan',
  kind: 'completion',
  instruction: COMMIT_FILE_SCAN_INSTRUCTION,
  // Selection, not writing: the same paths against the same question should shortlist the same way.
  temperature: 0.1,
  schema: COMMIT_FILE_SCAN_SCHEMA,
  buildPrompt: buildCommitFileScanPrompt,
  parse: parseCommitFileScan,
  reservedOutputTokens: () => COMMIT_FILE_SCAN_OUTPUT_TOKENS,
}
