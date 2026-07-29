import type { JsonSchema } from '../config'
import type { CompletionFeature } from '../runtime'
import { DEFAULT_CONTEXT_TOKENS, estimateTokens, variableCharBudget } from '../promptSize'
import { languageName } from './language'

/** How a package's own API is reached from this repo. */
export interface UpgradeRiskUsage {
  /** Source files importing it, before any capping — the blast radius. */
  fileCount: number
  files: string[]
  /** Named exports pulled from it anywhere in the repo. */
  symbols: string[]
  /** Subpath entry points in use (`react-dom/client`). */
  subpaths: string[]
  defaultImport: boolean
  /** A namespace import means the whole surface is reachable, so `symbols` understates it. */
  namespaceImport: boolean
  samples: { path: string; line: number; text: string }[]
}

export interface UpgradeRiskInput {
  package: string
  /** Installed version. */
  from: string
  /** Version the update would land on. */
  to: string
  /** Release notes between the two, markdown. Empty when there were none to find. */
  changelog: string
  /**
   * False when the release tags could not be matched to the version range, so the
   * notes are recent-but-unrelated rather than the ones being installed.
   */
  changelogMatched: boolean
  usage: UpgradeRiskUsage
  /** BCP-47-ish tag the prose fields are written in. */
  language?: string
  contextTokens?: number
}

/** One breaking change from the notes, judged against this repo's usage. */
export interface UpgradeRiskChange {
  /** The change itself, as the release notes describe it. */
  change: string
  /** Whether it touches an API this repo actually imports. */
  affectsUs: boolean
  /** Files from the provided list where it lands. Empty when `affectsUs` is false. */
  where: string[]
  /** Why it does or does not apply here, one sentence. */
  note: string
}

export interface UpgradeRiskResult {
  /**
   * `unknown` when there were no usable release notes — the honest answer with
   * nothing to read, and never to be shown as a green light.
   */
  risk: 'unknown' | 'low' | 'medium' | 'high'
  /** One or two sentences the user reads first. */
  summary: string
  changes: UpgradeRiskChange[]
}

/** Room for a handful of judged changes plus the summary. */
export const UPGRADE_RISK_OUTPUT_TOKENS = 900

export const UPGRADE_RISK_INSTRUCTION = `You are assessing what a dependency upgrade would break IN ONE SPECIFIC REPOSITORY.

You are given: the package, the version it moves from and to, the release notes for that range, and the repository's actual usage of the package — which named exports it imports, which entry points, from how many files, and sample import lines.

Answer with these fields, IN THIS ORDER:
- changes: the BREAKING changes in the notes. For each one: "change" (what the notes say, one line), "affectsUs" (does it touch an API this repository imports?), "where" (files from the provided list, only when affectsUs is true), "note" (one sentence saying why it does or does not apply here).
- risk: overall, derived from "changes" — see the scale below.
- summary: one or two sentences telling the user what they need to look at. Name the specific APIs, not generalities.

The scale:
- "unknown": the notes are empty, or say nothing about breaking changes. You cannot judge, and you say so.
- "low": no listed breaking change touches an API this repository imports.
- "medium": something it imports is affected, but the fix is mechanical (a rename, a moved entry point, a changed default).
- "high": something it imports is removed, or its behaviour changes in a way that compiles fine and does the wrong thing.

Rules (STRICT):
- Judge against the GIVEN USAGE, not against the package in general. "This release removes X" is only relevant here if X appears in the imported symbols, the entry points, or the sample lines. A breaking change to an API this repository never imports is "affectsUs": false, and saying so is useful — that is most of the value of this answer.
- Do NOT summarise the release notes. The user can read those. Every line you write must be about THIS repository's code.
- Only put a path in "where" if it appears in the provided file list. Never invent one.
- When the notes list no breaking changes, return an empty "changes" array and risk "low" — not "unknown". "unknown" is for having nothing to read at all.
- A namespace import ("import * as") means the repository can reach any export, so the named-symbol list is incomplete; say so rather than concluding "low" from a short symbol list.
- You see IMPORT SITES ONLY. You cannot see runtime behaviour, peer dependency requirements, bundler or CSS changes, or type-level breakage that does not show at an import. Never claim an upgrade is safe overall — only that the listed changes do or do not touch imported APIs.
- Overstating safety is the costly error: the user is deciding whether to click an irreversible-feeling button, and "low" invites them to skip reading. When you are unsure whether something applies, say it applies and explain the doubt.`

/**
 * Constrains the answer to three fields, **in generation order**.
 *
 * `changes` is generated before `risk` for the same reason `commitRelevance` puts
 * its evidence first: a model fills fields as it writes them, so making it
 * enumerate and judge each change individually forces the verdict to be a
 * conclusion rather than a first impression the rest then justifies.
 */
export const UPGRADE_RISK_SCHEMA: JsonSchema = {
  name: 'upgrade_risk',
  schema: {
    type: 'object',
    properties: {
      changes: {
        type: 'array',
        description: 'Breaking changes from the notes, each judged against this repo.',
        items: {
          type: 'object',
          properties: {
            change: { type: 'string', description: 'What the notes say, one line.' },
            affectsUs: {
              type: 'boolean',
              description: 'True only when it touches an API this repo imports.',
            },
            where: {
              type: 'array',
              description: 'Paths from the provided list; empty when affectsUs is false.',
              items: { type: 'string' },
            },
            note: { type: 'string', description: 'One sentence on why it applies here or not.' },
          },
          required: ['change', 'affectsUs', 'where', 'note'],
          additionalProperties: false,
        },
      },
      risk: {
        type: 'string',
        enum: ['unknown', 'low', 'medium', 'high'],
        description: 'Overall verdict, derived from "changes".',
      },
      summary: { type: 'string', description: 'One or two sentences for the user.' },
    },
    required: ['changes', 'risk', 'summary'],
    additionalProperties: false,
  },
  strict: true,
}

/** The usage half of the prompt — compact by construction, so it never needs trimming. */
function buildUsage(input: UpgradeRiskInput): string {
  const { usage } = input
  const lines = [
    `Imported in ${usage.fileCount} file(s).`,
    `Named exports used: ${usage.symbols.join(', ') || '(none)'}`,
  ]
  if (usage.subpaths.length > 0) lines.push(`Entry points used: ${usage.subpaths.join(', ')}`)
  if (usage.defaultImport) lines.push('Uses the default export.')
  // Called out explicitly because it invalidates the symbol list as an exhaustive
  // surface, and the instruction tells the model to weigh that.
  if (usage.namespaceImport) {
    lines.push('Uses a namespace import ("import * as"), so any export may be reached.')
  }
  if (usage.samples.length > 0) {
    lines.push('', 'Sample import lines:')
    lines.push(...usage.samples.map((s) => `- ${s.path}:${s.line}  ${s.text}`))
  }
  if (usage.files.length > 0) {
    lines.push('', 'Files importing it:')
    lines.push(...usage.files.map((f) => `- ${f}`))
  }
  return lines.join('\n')
}

/**
 * The notes' own allowance, once the instruction, the usage block and the answer
 * are paid for. Release notes for a big major (React 19, Vite 6) run to tens of
 * thousands of characters and would otherwise silently push the usage — the part
 * that makes the answer specific — out of the window.
 */
function changelogBudget(input: UpgradeRiskInput, envelope: string): number {
  return variableCharBudget(
    input.contextTokens ?? DEFAULT_CONTEXT_TOKENS,
    estimateTokens(UPGRADE_RISK_INSTRUCTION + envelope),
    UPGRADE_RISK_OUTPUT_TOKENS
  )
}

export function buildUpgradeRiskPrompt(input: UpgradeRiskInput): string {
  const header = `Package: ${input.package}
Upgrade: ${input.from} → ${input.to}
Write "summary" and every "note" in ${languageName(input.language)}.

This repository's usage:
${buildUsage(input)}`

  const notes = input.changelog.trim()
  const budget = changelogBudget(input, header)
  const trimmed = notes.length > budget ? `${notes.slice(0, budget)}\n… (notes truncated)` : notes

  const body =
    trimmed.length === 0 ? '(no release notes were found for this version range)' : trimmed

  return `${header}

Release notes${input.changelogMatched ? '' : ' (WARNING: these could not be matched to the version range above — they are recent releases, not necessarily the ones being installed)'}:

--- NOTES ---
${body}
--- END NOTES ---`
}

const RISK_LEVELS = ['unknown', 'low', 'medium', 'high'] as const

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter((v) => v.length > 0)
}

function readChange(value: unknown): UpgradeRiskChange | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  const change = typeof record.change === 'string' ? record.change.trim() : ''
  if (change.length === 0) return null
  const affectsUs = record.affectsUs === true || record.affectsUs === 'true'
  return {
    change,
    affectsUs,
    // A path is only shown when the model claimed the change lands here; carrying
    // paths on a change it just said does not apply would contradict itself on screen.
    where: affectsUs ? toStringList(record.where) : [],
    note: typeof record.note === 'string' ? record.note.trim() : '',
  }
}

/**
 * Drops locations the model invented, keeping only paths from the scanned file list.
 *
 * Separate from {@link parseUpgradeRisk} and exported because the completion service
 * hands the caller a *parsed* result — `parse` never sees the input, so it cannot
 * know which files are real. The caller that ran the usage scan applies this.
 * A hallucinated path is not a cosmetic flaw here: it renders as a file to go and
 * check, and the user finds nothing there.
 */
export function verifyUpgradeRiskPaths(
  result: UpgradeRiskResult,
  knownFiles: string[]
): UpgradeRiskResult {
  if (knownFiles.length === 0) return result
  const allowed = new Set(knownFiles)
  return {
    ...result,
    changes: result.changes.map((change) => ({
      ...change,
      where: change.where.filter((path) => allowed.has(path)),
    })),
  }
}

/**
 * Reads the verdict back and makes it internally consistent.
 *
 * Two gates the instruction cannot enforce on its own, both biased towards *over*-
 * reporting risk because the costly error here is a user skipping the release notes
 * because a model said "low":
 *
 *  1. `where` is intersected with the files we actually gave it, so a hallucinated
 *     path is dropped rather than rendered as a location to go and check;
 *  2. `high`/`medium` require at least one change marked `affectsUs` — otherwise the
 *     verdict is a mood, not a conclusion drawn from the enumerated changes.
 *
 * The reverse is deliberately *not* clamped: a model that lists an affecting change
 * and still says `low` gets raised to `medium`, never lowered.
 */
export function parseUpgradeRisk(raw: string, knownFiles: string[] = []): UpgradeRiskResult {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end <= start) {
    return { risk: 'unknown', summary: '', changes: [] }
  }

  let record: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(raw.slice(start, end + 1))
    if (typeof parsed !== 'object' || parsed === null) throw new Error('not an object')
    record = parsed as Record<string, unknown>
  } catch {
    return { risk: 'unknown', summary: '', changes: [] }
  }

  const changes = (Array.isArray(record.changes) ? record.changes : [])
    .map(readChange)
    .filter((c): c is UpgradeRiskChange => c !== null)

  const claimed = RISK_LEVELS.includes(record.risk as (typeof RISK_LEVELS)[number])
    ? (record.risk as UpgradeRiskResult['risk'])
    : 'unknown'
  const affecting = changes.some((c) => c.affectsUs)

  let risk = claimed
  if (!affecting && (claimed === 'high' || claimed === 'medium')) risk = 'low'
  if (affecting && (claimed === 'low' || claimed === 'unknown')) risk = 'medium'

  return verifyUpgradeRiskPaths(
    {
      risk,
      summary: typeof record.summary === 'string' ? record.summary.trim() : '',
      changes,
    },
    knownFiles
  )
}

/**
 * Completion feature: what would this upgrade break *here*.
 *
 * The naive version of this — "here is a changelog, is it risky?" — is worth
 * nothing, because it can only paraphrase the breaking-changes section the user
 * could read faster themselves. The value is the intersection: which of those
 * changes touch APIs this repository actually imports. That is why the input
 * carries a usage scan alongside the notes, and why the instruction spends most of
 * its length forbidding a summary of the release.
 *
 * Advisory by construction. The UI keeps its own confirmation on a major upgrade
 * whatever this returns — a model must not be able to wave one through.
 */
export const upgradeRiskFeature: CompletionFeature<UpgradeRiskInput, UpgradeRiskResult> = {
  id: 'upgrade-risk',
  kind: 'completion',
  instruction: UPGRADE_RISK_INSTRUCTION,
  // No timeout. This is the longest prompt the app builds — a major release's notes
  // plus the repo's usage — and it asks for a reasoned, structured verdict rather
  // than prose, so a local model can legitimately spend minutes on it. The
  // connection's budget is tuned for interactive features and killing this call at
  // it turns a slow answer into no answer, which is what happened in practice. The
  // caller shows elapsed time so an unbounded call still visibly progresses.
  timeoutSeconds: 0,
  // A judgement that should not wobble between two runs on the same pair of versions.
  temperature: 0.1,
  schema: UPGRADE_RISK_SCHEMA,
  buildPrompt: buildUpgradeRiskPrompt,
  // `parse` cannot see the input, so path verification is applied by the caller,
  // which has the file list; this keeps the feature usable on its own.
  parse: (raw) => parseUpgradeRisk(raw),
  reservedOutputTokens: () => UPGRADE_RISK_OUTPUT_TOKENS,
}
