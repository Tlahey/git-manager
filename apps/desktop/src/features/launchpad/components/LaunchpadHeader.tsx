import { Rocket, WifiOff, CheckCircle2, Clock, RefreshCw } from 'lucide-react'
import { Spinner } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import { timeAgo } from '../../../lib/relativeDate'

interface LaunchpadHeaderProps {
  hasToken: boolean
  isMocked: boolean
  githubConnected: boolean
  loading: boolean
  isValidating: boolean
  error: string | null
  username: string | null
  lastRefreshed: Date | null
  onRefresh: () => void
}

/**
 * The Launchpad's title bar: the name, the account's sync status, and the manual refresh.
 *
 * The rules it encodes, both of which were argued for once and are easy to undo by accident:
 * the divider before the status belongs to the status, so with nothing to report there is no rule
 * floating beside the title; and being signed out gets no warning here. The page below already
 * says it in the connect banner, and says what to do about it, which a status pill cannot — two
 * notices for one fact left the header shouting about a state the user had chosen. Invented pull
 * requests are a different matter and keep their amber strip.
 */
export function LaunchpadHeader({
  hasToken,
  isMocked,
  githubConnected,
  loading,
  isValidating,
  error,
  username,
  lastRefreshed,
  onRefresh,
}: LaunchpadHeaderProps) {
  const { t } = useTranslation('launchpad')

  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-border bg-card/50 px-5 py-2.5 backdrop-blur-xs">
      <div className="flex items-center gap-2">
        <Rocket className="h-4 w-4 text-primary" />
        <h1 className="text-sm font-bold tracking-wide text-foreground">Launchpad</h1>
      </div>
      {(hasToken || isMocked) && <div className="h-4 w-px bg-border" />}
      {hasToken ? (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          {loading || isValidating ? (
            <>
              <Spinner className="h-3 w-3" /> {t('page.fetching')}
            </>
          ) : error ? (
            <>
              <WifiOff className="h-3 w-3 text-destructive" />{' '}
              <span className="text-destructive">{error}</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="h-3 w-3 text-green-400" /> {t('page.syncedAs')}{' '}
              <strong className="ml-0.5 text-foreground">{username}</strong>
            </>
          )}
        </span>
      ) : (
        isMocked && (
          <span className="flex items-center gap-1.5 text-xs text-amber-400/80">
            <WifiOff className="h-3 w-3" /> {t('page.demoData')}
          </span>
        )
      )}
      <div className="ml-auto flex items-center gap-3">
        {/* Nothing to refresh, and no last-refresh time to report, without an account. */}
        {githubConnected && (
          <>
            {lastRefreshed && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground/60">
                <Clock className="h-3 w-3" /> {timeAgo(lastRefreshed)}
              </span>
            )}
            <button
              onClick={onRefresh}
              disabled={isValidating}
              data-testid="manual-refresh-button"
              className="flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-border px-2.5 text-xs text-muted-foreground transition-colors hover:enabled:border-border/80 hover:enabled:bg-accent/40 hover:enabled:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              title={t('page.refreshNow')}
            >
              <RefreshCw className={`h-3 w-3 ${isValidating ? 'animate-spin' : ''}`} />{' '}
              {t('page.refresh')}
            </button>
          </>
        )}
      </div>
    </header>
  )
}
