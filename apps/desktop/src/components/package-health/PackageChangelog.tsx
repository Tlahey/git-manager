import { ExternalLink } from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import { Alert, Button, Spinner } from '@git-manager/ui'
import { usePackageChangelog } from '../../hooks/usePackageHealth'
import { openUrl } from '../../lib/openUrl'
import { Markdown } from '../Markdown'

/**
 * Release notes for one pending update, fetched from the package's own GitHub repo.
 *
 * Mounted only once the user expands a row, so the network call follows the click
 * rather than the page. Renders whatever the API gives us and is explicit when the
 * tag scheme defeated the version matching — showing recent-but-wrong notes without
 * saying so would be worse than showing none.
 */
export function PackageChangelog({
  repoPath,
  name,
  from,
  to,
  token,
}: {
  repoPath: string
  name: string
  from: string
  to: string
  token?: string
}) {
  const { t } = useTranslation('git')
  const { data, error, isLoading } = usePackageChangelog(repoPath, name, from, to, token)

  if (isLoading) {
    return (
      <div
        className="flex items-center gap-2 py-2 text-[11px] text-muted-foreground"
        data-testid="changelog-loading"
      >
        <Spinner className="h-3.5 w-3.5" />
        {t('health.changelog.loading')}
      </div>
    )
  }

  if (error != null) {
    return (
      <Alert variant="destructive" data-testid="changelog-error">
        <span className="text-[11px]">{t('health.changelog.error')}</span>
      </Alert>
    )
  }

  if (data == null) return null

  if (data.repository == null) {
    return (
      <Alert variant="info" data-testid="changelog-no-repository">
        <span className="text-[11px]">{t('health.changelog.none')}</span>
      </Alert>
    )
  }

  return (
    <div className="space-y-2" data-testid="changelog">
      {!data.matched && data.releases.length > 0 && (
        <Alert variant="warning" data-testid="changelog-unmatched">
          <span className="text-[11px]">{t('health.changelog.unmatched')}</span>
        </Alert>
      )}

      {data.releases.length === 0 ? (
        <p className="text-[11px] text-muted-foreground" data-testid="changelog-empty">
          {t('health.changelog.empty')}
        </p>
      ) : (
        <ul className="space-y-2">
          {data.releases.map((release) => (
            <li
              key={release.tag}
              className="rounded border border-border bg-background p-2"
              data-testid="changelog-release"
            >
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-[11px] font-medium">{release.tag}</span>
                {release.name !== '' && release.name !== release.tag && (
                  <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                    {release.name}
                  </span>
                )}
              </div>
              {release.body !== '' && (
                <Markdown content={release.body} className="mt-1 text-[11px]" />
              )}
            </li>
          ))}
        </ul>
      )}

      {data.releasesUrl != null && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => openUrl(data.releasesUrl as string)}
          data-testid="changelog-open-github"
        >
          <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
          {t('health.changelog.openOnGitHub')}
        </Button>
      )}
    </div>
  )
}
