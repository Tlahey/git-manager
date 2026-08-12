import type { ActivityLogEntry } from '../../../stores/activityLog.store'

/**
 * The **second** redaction pass — the one that decides what may be posted to a public issue
 * tracker.
 *
 * `lib/debugLogRedact.ts` already sanitises every IPC argument before it reaches the activity log,
 * and that is the right amount of caution for a log the user reads *on their own machine*.
 * Publishing is a different threat model, and everything that was acceptable there is a leak here:
 *
 * - **Absolute paths carry the user's name.** `/Users/antoine/Workspace/acme-client/…` names a
 *   person and a client in one string, and `repoPath` is stamped on *every* activity entry.
 * - **Branch names, file paths and commit subjects are the user's proprietary work.** A stack of
 *   twelve operations against `feature/PROJ-4211-billing-migration` describes an employer's
 *   roadmap to anyone reading the tracker.
 * - **Argument values are unbounded.** `debugLogRedact` truncates them to 200 characters and masks
 *   auth-shaped keys; 200 characters of a commit body is still 200 characters of a commit body.
 *
 * So this module keeps the *shape* and drops the *content*: an entry's argument keys survive with
 * their types, never their string values. What a maintainer needs to fix a bug is which commands
 * ran, in which order, with which arguments *present*, and what the failure said — not what the
 * user's branch was called.
 *
 * **None of this is the last line of defence.** The report dialog shows the exact body and lets the
 * reporter edit it before anything is sent, because no regex is trustworthy enough to be the only
 * thing standing between a user's disk and a public URL. This module exists to make that preview
 * boring to read, not to make it optional.
 */

/** Applied in order; each pattern replaces with its label. */
const SECRET_PATTERNS: Array<[RegExp, string]> = [
  // A PEM block, before anything else can chew on its base64 body.
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[private-key]'],
  // GitHub: classic PATs (ghp_), OAuth (gho_), user/server tokens (ghu_/ghs_), refresh (ghr_).
  [/gh[pousr]_[A-Za-z0-9]{16,}/g, '[github-token]'],
  [/github_pat_[A-Za-z0-9_]{20,}/g, '[github-token]'],
  // GitLab personal/project tokens and Bitbucket app passwords are less regular; catch the
  // documented prefixes only rather than guessing at high-entropy strings.
  [/glpat-[A-Za-z0-9_-]{16,}/g, '[gitlab-token]'],
  [/\bsk-[A-Za-z0-9_-]{16,}/g, '[api-key]'],
  [/\bAKIA[0-9A-Z]{16}\b/g, '[aws-key]'],
  // Authorization headers, however they were spelled.
  [/\b(Bearer|token|Basic)\s+[A-Za-z0-9._~+/=-]{12,}/gi, '$1 [redacted]'],
  // Any userinfo in a URL — `https://user:pat@host` and the password-less `https://user@host`
  // alike, in one pass so the second form can't re-match what the first already replaced.
  [/([a-z][a-z0-9+.-]*:\/\/)[^/\s@]+@/gi, '$1[credentials]@'],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]'],
  // A URL keeps its scheme and host — which service failed is signal — and loses its path, which
  // for a remote is `owner/private-project.git`. Must run before ABSOLUTE_PATH, whose lookbehind
  // then refuses to fire inside what this produced.
  [/\b([a-z][a-z0-9+.-]*:\/\/[^\s/]+)\/[^\s"'<>)\]]*/gi, '$1/<path>'],
]

/**
 * Absolute paths, collapsed whole rather than merely stripped of their home prefix — the segments
 * *after* the home directory (a client's name, a product codename) leak as much as the username
 * before it.
 *
 * Anchored on a leading `/`, `~/` or a Windows drive so git refs (`refs/heads/main`) and relative
 * paths survive: those are the ones that still carry signal. The lookbehind keeps it out of URLs,
 * which `SECRET_PATTERNS` has already handled on its own terms — without it, `https://host/x`
 * loses its host to a second, dumber pass.
 *
 * A space is allowed in an intermediate segment (macOS paths have them) but **not** in the final
 * one, which is the difference between collapsing a path and eating the sentence around it:
 * `open /Users/me/a.ts failed` became `open <path>` while the class was uniform, silently
 * destroying the half of the message that said what went wrong.
 */
const ABSOLUTE_PATH = /(?<![\w/:<])(?:[A-Za-z]:\\|~\/|\/)(?:[\w .+-]+[/\\])*[\w.+-]+/g

/** Paths short enough to be a well-known system location keep their meaning and leak nothing. */
const SAFE_PATHS = new Set(['/tmp', '/usr', '/bin', '/etc', '/opt', '/var', '/dev/null'])

/**
 * Runs every secret pattern, then collapses absolute paths to `<path>`. Safe on `undefined` so
 * call sites don't each guard.
 */
export function redactPublicText(text: string): string
export function redactPublicText(text: string | undefined): string | undefined
export function redactPublicText(text: string | undefined): string | undefined {
  if (text === undefined) return undefined
  let out = text
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    out = out.replace(pattern, replacement)
  }
  return out.replace(ABSOLUTE_PATH, (match) => (SAFE_PATHS.has(match) ? match : '<path>'))
}

/**
 * A stable pseudonym for a repository path — `<repo:1f3a9c2b>`.
 *
 * Stable so a maintainer can still see "these nine operations all targeted the same repository,
 * this tenth one didn't", which is often the whole shape of a bug. A hash rather than the folder's
 * basename because the basename *is* the project's name.
 */
export function redactRepoPath(repoPath: string | undefined): string | undefined {
  if (!repoPath) return undefined
  return `<repo:${hash(repoPath)}>`
}

/**
 * The user's home directory, whatever the platform spells it — the one part of a stack frame that
 * names a person.
 */
const HOME_DIR = /(?:\/Users\/|\/home\/|[A-Za-z]:\\Users\\)[^/\\\s:)"']+/g

/**
 * A stack trace, redacted **gently** — and that difference is the point.
 *
 * `redactPublicText` collapses every path and every URL path, which is right for a git error
 * message and ruinous here: a stack frame is `tauri://localhost/assets/index-a1b2.js:1:4821`, and
 * collapsing that to `tauri://localhost/<path>` throws away the line numbers that are the entire
 * value of reporting a crash. In a packaged build those paths sit inside the app bundle and name
 * nothing about the user. In a dev build they run through the developer's own checkout, so the
 * home directory becomes `~` and the rest — `~/Workspace/git-manager/apps/desktop/src/…` — is
 * kept, the project's own layout being public anyway.
 *
 * Secret patterns still run in full: a token that reached an error message is a token wherever it
 * appears.
 */
export function redactPublicStack(stack: string | undefined): string | undefined {
  if (stack === undefined) return undefined
  let out = stack.replace(HOME_DIR, '~')
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    // Skip the URL-path collapse — see above.
    if (replacement === '$1/<path>') continue
    out = out.replace(pattern, replacement)
  }
  return out
}

/** FNV-1a, 32-bit, hex. Not a security primitive — a short stable label. */
export function hash(value: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

/** One activity entry, reduced to what may leave the machine. */
export interface PublicActivityEntry {
  timestamp: number
  command: string
  status: 'ok' | 'error'
  durationMs: number
  /** The argument *shape*: `"repoPath, limit=200, force=false, message:string(48)"`. */
  args?: string
  error?: string
  repo?: string
  correlationLabel?: string
}

/**
 * Describes an argument object without quoting any of it: numbers and booleans survive (a limit or
 * a flag is signal and cannot identify anyone), strings collapse to their length, and everything
 * else to its key alone.
 *
 * The values are already truncated and partly masked by `debugLogRedact`, and are dropped anyway —
 * the two passes are not redundant. That one bounds what the *user's own* log holds; this one
 * decides what a stranger may read.
 */
export function describeArgs(args: unknown): string | undefined {
  if (args === undefined || args === null) return undefined
  // `debugLogRedact` replaces a whole auth-shaped command's arguments with this marker.
  if (typeof args === 'string')
    return args === '[redacted]' ? '[redacted]' : `string(${args.length})`
  if (typeof args === 'number' || typeof args === 'boolean') return String(args)
  // Anything else scalar (a symbol, a function) is named by its type rather than stringified: a
  // top-level argument that isn't an object is already odd, and `[object Object]` in a public
  // report would be noise at best.
  if (typeof args !== 'object') return typeof args

  const parts = Object.entries(args as Record<string, unknown>).map(([key, value]) => {
    if (typeof value === 'number' || typeof value === 'boolean') return `${key}=${value}`
    if (typeof value === 'string') return `${key}:string(${value.length})`
    if (value === null || value === undefined) return `${key}=${value}`
    return key
  })
  return parts.length > 0 ? parts.join(', ') : undefined
}

/** Reduces one activity entry to its publishable form. */
export function redactActivityEntry(entry: ActivityLogEntry): PublicActivityEntry {
  return {
    timestamp: entry.timestamp,
    command: entry.command,
    status: entry.status,
    durationMs: entry.durationMs,
    args: describeArgs(entry.args),
    error: redactPublicText(entry.error),
    repo: redactRepoPath(entry.repoPath),
    // A correlation label is one of the app's own action names (`git.pull`), never user data.
    correlationLabel: entry.correlationLabel,
  }
}
