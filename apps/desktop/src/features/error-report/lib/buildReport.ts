import type { ActivityLogEntry } from '../../../stores/activityLog.store'
import { classifyError, type ReportVerdict } from './reportability.config'
import { fingerprintError, fingerprintMarker } from './fingerprint'
import {
  redactActivityEntry,
  redactPublicStack,
  redactPublicText,
  redactRepoPath,
} from './publicRedact'

/**
 * Turns a failure into the exact markdown that will be posted, and nothing else — no network, no
 * React, no clock of its own.
 *
 * The whole module is pure so the body a maintainer eventually reads can be asserted character by
 * character in a test. That matters more here than anywhere else in the app: this is the one code
 * path that takes data off a user's machine and puts it on a public URL, and "we think it redacts
 * the repository path" is not a thing to find out in production.
 */

/** Everything the app knows about one failure, before any redaction. */
export interface ErrorReportDraft {
  /** A UI crash caught by the error boundary, or a backend operation that rejected. */
  kind: 'crash' | 'operation'
  /** `AppError`'s stable code (see `AppErrorLike`); absent for a crash. */
  code?: string
  message: string
  /** The long form of an `AppError` — a failed hook's own output, for instance. */
  detail?: string
  stack?: string
  /** React's component stack, for a crash. */
  componentStack?: string
  /** The IPC command that failed. */
  command?: string
  /** The user action the failure belongs to (`git.pull`). */
  correlationLabel?: string
  timestamp: number
  repoPath?: string
  /**
   * The operations around the failure, newest-first as the store holds them — normally the whole
   * correlated action. Trimmed and redacted here, so callers can pass more than will be posted.
   */
  context: ActivityLogEntry[]
}

/** The host, as the report describes it. Gathered by the hook; passed in so this stays pure. */
export interface ReportEnvironment {
  appVersion: string
  /** `navigator.platform`-ish — "macOS (arm64)". */
  platform: string
  /** UI language, which explains a screenshot the reporter may attach. */
  locale: string
  userAgent: string
}

export interface ErrorReport {
  fingerprint: string
  title: string
  body: string
  verdict: ReportVerdict
  /** i18n key (namespace `errors`) explaining the verdict. */
  reasonKey: string
}

/**
 * How many surrounding operations travel with a report.
 *
 * Enough to show the shape of the action that failed, few enough that a crash report stays a page
 * rather than a dump nobody scrolls. The store holds a thousand; the ones that matter are the last
 * handful before the failure.
 */
const MAX_CONTEXT = 25

const MAX_TITLE = 110

function firstLine(text: string): string {
  return text.split('\n')[0].trim()
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

/** `CODE: what happened` — kept short enough to read in a tracker list. */
export function buildReportTitle(draft: ErrorReportDraft): string {
  const summary = firstLine(redactPublicText(draft.message)) || 'Unknown error'
  const prefix = draft.kind === 'crash' ? 'UI crash' : (draft.code ?? 'Error')
  return truncate(`${prefix}: ${summary}`, MAX_TITLE)
}

function fencedBlock(content: string, language = ''): string {
  // A body that already contains a fence would otherwise break out of this one.
  const fence = content.includes('```') ? '````' : '```'
  return `${fence}${language}\n${content}\n${fence}`
}

function contextTable(entries: ActivityLogEntry[]): string {
  const rows = entries
    .slice(0, MAX_CONTEXT)
    // Oldest first: a report is read forwards, unlike the live stream.
    .reverse()
    .map(redactActivityEntry)
    .map((e) => {
      const cells = [
        e.correlationLabel ?? '—',
        `\`${e.command}\``,
        e.status,
        `${e.durationMs}ms`,
        e.args ? `\`${e.args}\`` : '—',
      ]
      return `| ${cells.join(' | ')} |`
    })

  return [
    '| action | command | status | took | arguments |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n')
}

/**
 * Assembles the issue body.
 *
 * The order is deliberate: the reporter's own words first (the only part of the report a machine
 * could not have written), then the error, then the trail that led to it, then the host. A
 * maintainer who reads the first two sections and stops has still learned the useful thing.
 */
export function buildErrorReport(
  draft: ErrorReportDraft,
  env: ReportEnvironment,
  description = ''
): ErrorReport {
  const { verdict, reasonKey } = classifyError(draft.code, draft.kind)
  const fingerprint = fingerprintError({
    code: draft.code,
    message: draft.message,
    origin: draft.command ?? draft.correlationLabel,
  })

  const errorLines = [
    draft.code ? `code:    ${draft.code}` : null,
    `message: ${redactPublicText(draft.message)}`,
    draft.command ? `command: ${draft.command}` : null,
    draft.correlationLabel ? `action:  ${draft.correlationLabel}` : null,
    draft.repoPath ? `repo:    ${redactRepoPath(draft.repoPath)}` : null,
  ].filter((line): line is string => line !== null)

  const detail = redactPublicText(draft.detail)
  const stack = redactPublicStack(draft.stack)
  const componentStack = redactPublicStack(draft.componentStack)

  const sections = [
    // Machine-readable and invisible in the rendered issue — this is what the duplicate search
    // looks for, so it must be the first thing written and never edited away by accident.
    `<!-- ${fingerprintMarker(fingerprint)} -->`,
    `_Reported from Git Manager ${env.appVersion}._`,
    '',
    '### What happened',
    description.trim() || '_No description given._',
    '',
    '### Error',
    fencedBlock(errorLines.join('\n')),
    detail ? `<details><summary>Detail</summary>\n\n${fencedBlock(detail)}\n</details>` : null,
    stack ? `<details><summary>Stack</summary>\n\n${fencedBlock(stack)}\n</details>` : null,
    componentStack
      ? `<details><summary>Component stack</summary>\n\n${fencedBlock(componentStack)}\n</details>`
      : null,
    '',
    '### Operations leading up to it',
    draft.context.length > 0 ? contextTable(draft.context) : '_None recorded._',
    '',
    '### Environment',
    [
      `- App: ${env.appVersion}`,
      `- Platform: ${env.platform}`,
      `- Locale: ${env.locale}`,
      `- WebView: ${redactPublicText(env.userAgent)}`,
    ].join('\n'),
    '',
    // Says what was removed, so a maintainer asking for "the real path" knows it is gone on
    // purpose and asks for a reproduction instead.
    '<sub>Sent from the app’s error reporter. Argument values, absolute paths, repository names and' +
      ' anything token-shaped are stripped before the report is shown to the reporter, who then' +
      ' edits and submits it by hand.</sub>',
  ].filter((section): section is string => section !== null)

  return {
    fingerprint,
    title: buildReportTitle(draft),
    body: sections.join('\n'),
    verdict,
    reasonKey,
  }
}
