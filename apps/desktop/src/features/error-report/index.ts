/**
 * Error reporting — the feature's whole public surface.
 *
 * Four names, and each one is a different kind of caller, which is why the barrel isn't one:
 *
 * - `ErrorReportHost` is mounted once at the app root and serves every caller that opens the
 *   dialog through the store.
 * - `useErrorReportStore` is how those callers open it (`openReport(draft)`).
 * - `ErrorReportDialog` is exported for the single caller that cannot use the host — the crash
 *   boundary, which renders in place of the tree the host lives in.
 * - `ErrorReportDraft` is the shape all of them build.
 *
 * Everything else — the redaction passes, the classification table, the fingerprint, the GitHub
 * calls — is an implementation detail. In particular `lib/publicRedact.ts` is deliberately NOT
 * exported: it is calibrated for this report's body and nothing else, and a second caller
 * reaching for "the redaction helper" is how a rule written for one payload ends up quietly
 * guarding another it never fit.
 */

export { ErrorReportHost } from './components/ErrorReportHost'
export { ErrorReportDialog } from './components/ErrorReportDialog'
export { useErrorReportStore } from './stores/errorReport.store'
export type { ErrorReportDraft } from './lib/buildReport'

/** Builds the draft for a failed line in the Activity Logs — that view's whole integration. */
export { draftFromActivityEntry } from './lib/draftFromActivity'
