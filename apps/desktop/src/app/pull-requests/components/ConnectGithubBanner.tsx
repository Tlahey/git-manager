import { X } from 'lucide-react'
import { Button, GithubIcon } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'

interface ConnectGithubBannerProps {
  /** Opens Settings on the Integrations page, where the account is connected. Absent in windows
   * that have no way to open Settings, in which case the banner only explains. */
  onOpenSettings?: () => void
  /** Hides the banner for the rest of this signed-out spell. Absent = not dismissible. */
  onDismiss?: () => void
}

/**
 * What the Launchpad shows in place of its GitHub half when no account is connected.
 *
 * The page used to render the whole apparatus regardless — five KPI cards reading zero, a refresh
 * button with nothing to refresh, seven tabs of empty lists — which says "there is nothing here"
 * when the truth is "the app has not been told whose data to fetch". This states the second, and
 * carries the one action that resolves it.
 *
 * A **strip**, not the centred empty state this started as: signing out does not empty the
 * Launchpad, it empties the GitHub half of it. The WIP tab below is local and still full, so a
 * 250px hero explaining the absence would push real content off screen in order to describe what
 * is missing. It keeps that panel's palette — the primary-tinted mark, the muted hint — rather
 * than a coloured `Alert`, because nothing here is a warning: it is one line of guidance, and it
 * can be closed once read. Its absence is not a loss of information, since the header still says
 * no account is connected and the GitHub tabs are visibly gone.
 */
export function ConnectGithubBanner({ onOpenSettings, onDismiss }: ConnectGithubBannerProps) {
  const { t } = useTranslation('launchpad')

  return (
    <div
      role="status"
      data-testid="launchpad-connect-github"
      className="flex shrink-0 items-center gap-2.5 border-b border-border bg-primary/5 px-4 py-1.5"
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-primary/10 bg-primary/10">
        <GithubIcon className="h-3 w-3 text-primary" />
      </span>
      <span className="shrink-0 text-xs font-medium text-foreground">{t('connect.title')}</span>
      <span className="min-w-0 truncate text-xs text-muted-foreground">{t('connect.hint')}</span>
      {/* One group, so the `ml-auto` that pushes the controls right is applied once — on both
          children it would put automatic margin *between* them and split them apart. */}
      <div className="ml-auto flex shrink-0 items-center gap-1">
        {onOpenSettings && (
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[11px]"
            onClick={onOpenSettings}
            data-testid="launchpad-connect-github-button"
          >
            {t('connect.action')}
          </Button>
        )}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label={t('connect.dismiss')}
            title={t('connect.dismiss')}
            data-testid="launchpad-connect-github-dismiss"
            className="cursor-pointer rounded p-0.5 text-muted-foreground opacity-70 transition-opacity hover:opacity-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}
