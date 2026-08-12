import { useErrorReportStore } from '../stores/errorReport.store'
import { ErrorReportDialog } from './ErrorReportDialog'

/**
 * Mounts the report dialog once, near the app root, for every caller that opens it through the
 * store (`openReport`) — today the Activity Logs takeover, tomorrow an error toast.
 *
 * The crash screen is not one of those callers and cannot be: `AppErrorBoundary` renders in place
 * of a tree that just threw, so this host is unmounted exactly when a crash needs reporting. It
 * renders its own `ErrorReportDialog` instead, which is why that component takes its draft as a
 * prop rather than reading the store itself.
 *
 * The `key` remounts the dialog per failure, so the description typed for one error can't survive
 * into the next — the alternative is a reporter unknowingly filing a second bug with the first
 * one's words.
 */
export function ErrorReportHost() {
  const draft = useErrorReportStore((s) => s.draft)
  const closeReport = useErrorReportStore((s) => s.closeReport)

  if (!draft) return null

  return (
    <ErrorReportDialog
      key={`${draft.timestamp}-${draft.command ?? draft.kind}`}
      draft={draft}
      open
      onClose={closeReport}
    />
  )
}
