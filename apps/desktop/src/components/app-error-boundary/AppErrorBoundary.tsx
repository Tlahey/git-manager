import React from 'react'
import { useTranslation } from '@git-manager/i18n'
import { MessageSquareWarning } from 'lucide-react'
import { Button } from '@git-manager/ui'
import { useActivityLogStore } from '../../stores/activityLog.store'
import { ErrorReportDialog, type ErrorReportDraft } from '../../features/error-report'

/**
 * Last-resort boundary around every route `main.tsx` renders.
 *
 * Without it, one exception during React's commit phase unmounts the entire tree to a blank
 * `#root` — observed for real on macOS/WKWebView as `NotFoundError: The object can not be found
 * here` when a commit raced DOM that had changed under React (full e2e runs under load hit it
 * around the Monaco-heavy views). Whatever the trigger, "the app silently turns white" is never
 * an acceptable failure mode for a desktop app; this trades it for a readable message and a
 * reload button.
 *
 * A class component because error boundaries still have no hook equivalent
 * (`getDerivedStateFromError`/`componentDidCatch`); the fallback is a separate function
 * component so it can use `useTranslation`.
 */
interface AppErrorBoundaryState {
  error: Error | null
  /** React's own stack of the component that threw — the most useful half of a crash report. */
  componentStack: string | null
}

export class AppErrorBoundary extends React.Component<
  React.PropsWithChildren,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { error: null, componentStack: null }

  static getDerivedStateFromError(error: Error): Partial<AppErrorBoundaryState> {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // The webview console is what e2e logs and bug reports capture — make the crash loud there.
    console.error('[AppErrorBoundary] the UI crashed:', error, info.componentStack)
    // Kept in state, not just logged: it is what the crash screen's report button sends, and a
    // console line is unreachable from inside the app.
    this.setState({ componentStack: info.componentStack ?? null })
  }

  render() {
    if (this.state.error) {
      return <CrashFallback error={this.state.error} componentStack={this.state.componentStack} />
    }
    return this.props.children
  }
}

function CrashFallback({ error, componentStack }: { error: Error; componentStack: string | null }) {
  const { t } = useTranslation('errors')
  const [draft, setDraft] = React.useState<ErrorReportDraft | null>(null)

  /**
   * Built on click rather than on mount, for two reasons that both bite: `componentStack` only
   * arrives with `componentDidCatch`, one render *after* this fallback first paints, so a draft
   * snapshotted at mount would ship a crash report with no component stack — the most useful half
   * of it. And the activity log needs no snapshotting: nothing will be appended now that the tree
   * which would have logged it has unmounted.
   */
  function openReport() {
    setDraft({
      kind: 'crash',
      message: error.message,
      stack: error.stack,
      componentStack: componentStack ?? undefined,
      timestamp: Date.now(),
      context: useActivityLogStore.getState().entries.slice(0, 25),
    })
  }

  return (
    <div
      data-testid="app-error-boundary"
      className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background p-8 text-foreground"
    >
      <h1 className="text-lg font-semibold">{t('appCrash.title')}</h1>
      <p className="max-w-md text-center text-sm text-muted-foreground">
        {t('appCrash.description')}
      </p>
      <code className="max-w-md truncate rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
        {error.message}
      </code>
      <div className="flex items-center gap-2">
        <Button onClick={() => window.location.reload()}>{t('appCrash.reload')}</Button>
        <Button variant="outline" onClick={openReport} data-testid="app-crash-report">
          <MessageSquareWarning className="h-3.5 w-3.5" />
          {t('report.action')}
        </Button>
      </div>
      {/* Its own dialog instance rather than the app-root `ErrorReportHost`: that host lives in the
          tree this fallback replaced, so it is unmounted exactly when a crash needs reporting. */}
      {draft && <ErrorReportDialog draft={draft} open onClose={() => setDraft(null)} />}
    </div>
  )
}
