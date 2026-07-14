import type { CommitConvention } from '../config'

/** The Conventional Commits types assumed when a project is conventional but doesn't restrict them. */
export const DEFAULT_COMMIT_TYPES = [
  'feat',
  'fix',
  'refactor',
  'perf',
  'docs',
  'style',
  'test',
  'build',
  'ci',
  'chore',
]

const DEFAULT_HEADER_MAX_LENGTH = 72

/** Rules we can enforce locally without running commitlint. Extracted best-effort from a JSON-ish
 * config; `undefined` fields mean "the config didn't specify". */
export interface CommitlintRules {
  types?: string[]
  headerMaxLength?: number
}

/** Best-effort parse of a commitlint config's `rules` for the two constraints we can check locally
 * (`type-enum`, `header-max-length`). Only works when the config is JSON-parseable (a `.json`/`.rc`
 * file or the `package.json` key); JS/TS configs aren't executed, so this returns `{}` for them and
 * we fall back to instructing the model via the raw text instead. Never throws. */
export function parseCommitlintRules(content: string): CommitlintRules {
  let json: unknown
  try {
    json = JSON.parse(content)
  } catch {
    return {}
  }
  if (typeof json !== 'object' || json === null) return {}

  const root = json as Record<string, unknown>
  const rules = (root.rules ?? root) as Record<string, unknown>

  const parsed: CommitlintRules = {}

  const typeEnum = rules['type-enum']
  if (Array.isArray(typeEnum) && Array.isArray(typeEnum[2])) {
    const types = typeEnum[2].filter((t): t is string => typeof t === 'string')
    if (types.length > 0) parsed.types = types
  }

  const headerMax = rules['header-max-length']
  if (Array.isArray(headerMax) && typeof headerMax[2] === 'number') {
    parsed.headerMaxLength = headerMax[2]
  }

  return parsed
}

const CONVENTIONAL_SUBJECT_RE = /^([a-zA-Z]+)(\([^)]*\))?(!)?: .+/

/** Infers whether the project uses a Conventional-Commits-style subject by looking at its recent
 * history. Requires a minimum sample and a clear majority so we don't wrongly impose the format on
 * a project that manages types at the PR level (its subjects are free-form). */
export function isConventionalHistory(recentCommits?: string[]): boolean {
  if (!recentCommits || recentCommits.length < 3) return false
  const conventional = recentCommits.filter((s) => CONVENTIONAL_SUBJECT_RE.test(s.trim())).length
  return conventional / recentCommits.length >= 0.6
}

/** Everything a feature needs to know about a repo's commit style, to build prompts and validate.
 * Sources, from least to most authoritative: recent history → repo commitlint/template convention →
 * user-authored guidance/pattern from app Settings. */
export interface CommitStyleContext {
  convention?: CommitConvention | null
  recentCommits?: string[]
  /** Free-text guidance the user set in Settings. */
  userInstructions?: string | null
  /** Regex (as a string) the subject must match, set by the user in Settings. */
  pattern?: string | null
}

/** Compiles a user-provided regex string, returning `null` for an empty or invalid pattern (so a
 * typo never throws mid-validation). */
export function compilePattern(pattern?: string | null): RegExp | null {
  const trimmed = pattern?.trim()
  if (!trimmed) return null
  try {
    return new RegExp(trimmed)
  } catch {
    return null
  }
}

/** Builds the prompt fragment for an explicit commitlint/template convention. Empty when absent. */
export function buildConventionSection(convention?: CommitConvention | null): string {
  if (!convention) return ''
  return `\nIMPORTANT — this project enforces its own commit convention (source: ${convention.source}). Follow it STRICTLY; it OVERRIDES the general rules above wherever they differ. The convention is:\n"""\n${convention.content}\n"""\n`
}

/** Builds the prompt fragment listing recent commit subjects as the style to imitate. Empty when
 * there's no history. This is how a project with no commitlint config still steers the model —
 * including projects that deliberately DON'T use Conventional Commits. */
export function buildRecentCommitsSection(recentCommits?: string[]): string {
  if (!recentCommits || recentCommits.length === 0) return ''
  const list = recentCommits.map((s) => `- ${s}`).join('\n')
  return `\nThis project's recent commit subjects are below. Match their style, casing, prefixes, tense and length — they reflect the project's ACTUAL convention and take precedence over the default format above (the project may intentionally not use Conventional Commits):\n${list}\n`
}

/** Builds the prompt fragment for the user's own Settings guidance/pattern — the most authoritative
 * source. Empty when the user configured neither. */
export function buildUserInstructionsSection(
  userInstructions?: string | null,
  pattern?: string | null
): string {
  const instructions = userInstructions?.trim()
  const pat = pattern?.trim()
  if (!instructions && !pat) return ''

  let section =
    '\nThe user has configured the following commit requirements (HIGHEST priority — follow them exactly, they override everything above):\n'
  if (instructions) section += `${instructions}\n`
  if (pat) section += `The commit subject line MUST match this regular expression: ${pat}\n`
  return section
}

/** Combined style section, in ascending order of authority: recent history → repo config → user
 * Settings. Later sections are told to override earlier ones. */
export function buildCommitStyleSection(ctx: CommitStyleContext): string {
  return (
    buildRecentCommitsSection(ctx.recentCommits) +
    buildConventionSection(ctx.convention) +
    buildUserInstructionsSection(ctx.userInstructions, ctx.pattern)
  )
}

export interface CommitValidationProblem {
  code: 'format' | 'type' | 'length' | 'pattern'
  message: string
}

export interface CommitValidation {
  valid: boolean
  problems: CommitValidationProblem[]
}

/**
 * Lightweight, best-effort validation of a generated commit subject — deliberately adaptive:
 *  - If the user set a regex in Settings, the subject must match it (that's their explicit format).
 *  - Else if the project has parseable commitlint rules, enforce those (`type-enum`, `header-max-length`).
 *  - Else if its recent history is clearly Conventional Commits, enforce the conventional format
 *    with the default type set and a 72-char header.
 *  - Otherwise (free-form project, e.g. types handled at the PR level), enforce NOTHING and return
 *    valid — imposing `type(scope):` there would be wrong.
 *
 * This is a non-blocking safety net; the primary guarantee is steering the model upstream via
 * {@link buildCommitStyleSection}. NOT a full commitlint run (no JS config execution, no plugins).
 */
export function validateCommitSubject(
  message: string,
  ctx: CommitStyleContext = {}
): CommitValidation {
  const subject = message.split('\n')[0]?.trim() ?? ''
  const rules = ctx.convention ? parseCommitlintRules(ctx.convention.content) : {}
  const userPattern = compilePattern(ctx.pattern)

  const problems: CommitValidationProblem[] = []

  // A user-set regex is their explicit format definition — it replaces the conventional inference.
  if (userPattern) {
    if (!userPattern.test(subject)) {
      problems.push({
        code: 'pattern',
        message: `Subject must match the required pattern: ${ctx.pattern?.trim()}`,
      })
    }
  } else {
    const conventional = rules.types !== undefined || isConventionalHistory(ctx.recentCommits)
    const types = rules.types ?? (conventional ? DEFAULT_COMMIT_TYPES : undefined)
    if (types) {
      const match = CONVENTIONAL_SUBJECT_RE.exec(subject)
      if (!match) {
        problems.push({
          code: 'format',
          message: 'Subject must follow "<type>(<scope>): <description>".',
        })
      } else if (!types.includes(match[1])) {
        problems.push({
          code: 'type',
          message: `Type "${match[1]}" is not allowed. Use one of: ${types.join(', ')}.`,
        })
      }
    }
  }

  // Length is orthogonal to format: enforced from an explicit commitlint limit, or the conventional
  // default when we inferred a conventional project (and the user didn't override format via regex).
  const conventionalForLength =
    !userPattern && (rules.types !== undefined || isConventionalHistory(ctx.recentCommits))
  const maxLength =
    rules.headerMaxLength ?? (conventionalForLength ? DEFAULT_HEADER_MAX_LENGTH : undefined)
  if (maxLength !== undefined && subject.length > maxLength) {
    problems.push({
      code: 'length',
      message: `Subject is ${subject.length} chars, exceeding the ${maxLength}-char limit.`,
    })
  }

  return { valid: problems.length === 0, problems }
}
