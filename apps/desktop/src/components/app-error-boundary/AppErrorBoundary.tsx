import React from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Button } from '@git-manager/ui'

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
}

export class AppErrorBoundary extends React.Component<
  React.PropsWithChildren,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // The webview console is what e2e logs and bug reports capture — make the crash loud there.
    console.error('[AppErrorBoundary] the UI crashed:', error, info.componentStack)
  }

  render() {
    if (this.state.error) return <CrashFallback error={this.state.error} />
    return this.props.children
  }
}

function CrashFallback({ error }: { error: Error }) {
  const { t } = useTranslation('errors')

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
      <Button onClick={() => window.location.reload()}>{t('appCrash.reload')}</Button>
    </div>
  )
}
