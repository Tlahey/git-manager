import { hash } from './publicRedact'

/**
 * A short, stable id for "this same failure" — the thing that keeps the tracker readable.
 *
 * It is stamped into the issue body as an HTML comment and searched for before a new report is
 * opened, so the tenth user to hit a bug lands on the existing issue instead of filing the tenth
 * copy of it. Without it a crash that reproduces on every launch becomes a wall of issues nobody
 * can triage, and the feature stops being a help.
 *
 * **What it deliberately ignores.** Two reports of the same defect never carry the same message
 * verbatim — one names a branch, another a sha, a third a byte count. Normalising those away is
 * what makes the id match across users; keeping them would make every report unique, which is the
 * same as having no fingerprint at all. The trade is that two genuinely different failures sharing
 * a code and a message skeleton collide into one issue — recoverable (a maintainer splits the
 * issue) in a way that a flooded tracker is not.
 */

/** Volatile fragments, replaced by a placeholder before hashing. Order matters: longest first. */
const VOLATILE: Array<[RegExp, string]> = [
  // Already-redacted paths and urls, plus any that slipped through.
  [/<path>/g, 'P'],
  [/<repo:[0-9a-f]+>/g, 'R'],
  // UUIDs, then object ids (40/64 hex), then any shortened sha (7+ hex).
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, 'U'],
  [/\b[0-9a-f]{7,64}\b/gi, 'H'],
  // Anything the message quoted — a branch, a ref, a filename, a remote.
  [/'[^']*'|"[^"]*"|`[^`]*`/g, 'Q'],
  [/\d+/g, 'N'],
]

/**
 * Reduces a message to its skeleton: the wording a maintainer would recognise, with every value
 * stripped out.
 */
export function normalizeMessage(message: string): string {
  let out = message.toLowerCase()
  for (const [pattern, placeholder] of VOLATILE) out = out.replace(pattern, placeholder)
  // Collapse whitespace last, so newlines in a multi-line message don't fork the id.
  return out.replace(/\s+/g, ' ').trim()
}

export interface FingerprintInput {
  /** `AppError`'s stable code, absent for a UI crash. */
  code?: string
  message: string
  /** The IPC command that failed, or the top frame of a crash — whichever locates the failure. */
  origin?: string
}

/** Eight hex characters: short enough to read in a title, wide enough not to collide in practice. */
export function fingerprintError({ code, message, origin }: FingerprintInput): string {
  return hash([code ?? 'CRASH', origin ?? '', normalizeMessage(message)].join('|'))
}

/** The marker written into an issue body, and the string searched for to find that issue again. */
export function fingerprintMarker(fingerprint: string): string {
  return `gm-fp:${fingerprint}`
}
