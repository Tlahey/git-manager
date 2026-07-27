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

export const DEFAULT_HEADER_MAX_LENGTH = 72

/** Share of recent subjects that must run long before we read it as house style rather than as a
 * couple of outliers. */
const LONG_SUBJECT_HABIT = 0.2

/** Minimum sample before the history is allowed to relax the default at all. */
const MIN_LENGTH_SAMPLE = 5

/**
 * The subject-length ceiling this project actually observes.
 *
 * 72 is the conventional default, and hardcoding it made the validator stricter than the project it
 * was validating. git-manager's own history is the example: no commitlint config, subjects that are
 * unmistakably Conventional Commits, and 16 of the last 50 over 72 characters (the longest, 95). So
 * every generated message of ordinary length drew a warning — while the prompt was, in the same
 * breath, telling the model to "match their style, casing, prefixes, tense and **length**". The
 * model was obeying the instruction and being flagged for it.
 *
 * This is the same adaptation {@link isConventionalHistory} already does for the *format*: read what
 * the project does instead of imposing a default on it. A single long subject is an outlier and
 * changes nothing; a fifth of them is a habit, and then the longest recent subject becomes the bar.
 * The default is a floor, never a ceiling — a project whose subjects are all short is not held to
 * *its* shortest.
 */
export function inferHeaderMaxLength(recentCommits?: string[]): number {
  if (!recentCommits || recentCommits.length < MIN_LENGTH_SAMPLE) return DEFAULT_HEADER_MAX_LENGTH
  const lengths = recentCommits.map((s) => s.trim().length)
  const long = lengths.filter((l) => l > DEFAULT_HEADER_MAX_LENGTH).length
  if (long / lengths.length < LONG_SUBJECT_HABIT) return DEFAULT_HEADER_MAX_LENGTH
  return Math.max(DEFAULT_HEADER_MAX_LENGTH, ...lengths)
}

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
  // The last sentence is load-bearing, and was learned the hard way: handed "test commit PR" and
  // "Initial commit" as the history of a scratch repo, a model asked to "match their style" answered
  // with the string `test commit PR`. Style means the shape — casing, prefixes, tense, length — not
  // the words, and a subject copied from an unrelated commit is worse than a plain one because it
  // describes work this commit did not do.
  // The ceiling is stated as a number because "match their length" alone is what produced subjects
  // the validator then rejected: the examples run long, the instruction's default was 72, and the
  // model had no way to know which of the two it would be judged against. Both sides now read the
  // same value from `inferHeaderMaxLength`.
  const limit = inferHeaderMaxLength(recentCommits)
  return `\nThis project's recent commit subjects are below. Match their style, casing, prefixes, tense and length — they reflect the project's ACTUAL convention and take precedence over the default format above (the project may intentionally not use Conventional Commits). They are examples of FORM ONLY: never reuse one verbatim, and never borrow wording from them that does not describe the diff you were given. Your subject MUST NOT exceed ${limit} characters:\n${list}\n`
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
  // An explicit commitlint limit is the project speaking for itself and always wins; otherwise the
  // bar is read off the history rather than assumed — see `inferHeaderMaxLength`.
  const maxLength =
    rules.headerMaxLength ??
    (conventionalForLength ? inferHeaderMaxLength(ctx.recentCommits) : undefined)
  if (maxLength !== undefined && subject.length > maxLength) {
    problems.push({
      code: 'length',
      message: `Subject is ${subject.length} chars, exceeding the ${maxLength}-char limit.`,
    })
  }

  return { valid: problems.length === 0, problems }
}
