import { Button, Tag } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import type { GitHubAccount } from '@git-manager/git-types'
import { buildClassicTokenUrl, describeTokenExpiry } from '../../../../lib/githubTokenExpiry'
import { openUrl } from '../../../../lib/openUrl'

interface GithubAccountListProps {
  accounts: GitHubAccount[]
  activeAccountId: string | null
  onSetActive: (id: string) => void
  onRemove: (id: string) => void
}

/** The connected GitHub accounts, with the active one marked. Renders nothing when there are none —
 *  the heading would be a promise the list does not keep. */
export function GithubAccountList({
  accounts,
  activeAccountId,
  onSetActive,
  onRemove,
}: GithubAccountListProps) {
  const { t } = useTranslation('settings')
  if (accounts.length === 0) return null

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold tracking-wider text-foreground uppercase">
        {t('settings.github.accountsTitle')}
      </h4>

      <div className="space-y-2">
        {accounts.map((acc) => {
          const isActive = acc.id === activeAccountId
          const expiry = describeTokenExpiry(acc.tokenExpiresAt)
          return (
            <div
              key={acc.id}
              data-testid={`github-account-item-${acc.id}`}
              className={`flex items-center justify-between rounded-lg border p-3 transition-colors ${
                isActive ? 'border-primary/50 bg-primary/5' : 'border-border bg-card'
              }`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <img
                  src={acc.user.avatarUrl}
                  alt={acc.user.login}
                  className="h-10 w-10 rounded-full border border-border"
                />
                <div className="flex min-w-0 flex-col">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="max-w-[120px] truncate text-xs font-semibold text-foreground">
                      {acc.user.name || acc.user.login}
                    </span>
                    {isActive && (
                      <Tag tone="success" className="rounded-full text-[8px] leading-none">
                        {t('settings.github.activeAccount')}
                      </Tag>
                    )}
                  </div>
                  <span className="truncate text-[10px] text-muted-foreground">
                    @{acc.user.login}
                  </span>
                  {/* A personal access token cannot be refreshed, so the only thing the app can do
                      about a 90-day expiry is show it before it lands. Nothing is shown for a token
                      with no expiry date, which is a legitimate configuration and not a gap. */}
                  {expiry && expiry.level !== 'ok' && (
                    <Tag
                      tone={expiry.level === 'expired' ? 'danger' : 'warning'}
                      className="mt-1 w-fit rounded-full text-[8px] leading-none"
                      data-testid={`github-account-token-expiry-${acc.id}`}
                    >
                      {expiry.level === 'expired'
                        ? t('settings.github.token.expired')
                        : t('settings.github.token.expiresInDays', { count: expiry.daysLeft })}
                    </Tag>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {expiry && expiry.level !== 'ok' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void openUrl(buildClassicTokenUrl())}
                    data-testid={`github-account-renew-${acc.id}`}
                    className="h-7 px-2 text-[10px]"
                  >
                    {t('settings.github.token.renew')}
                  </Button>
                )}

                {!isActive && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onSetActive(acc.id)}
                    data-testid={`github-account-switch-${acc.id}`}
                    className="h-7 px-2 text-[10px]"
                  >
                    {t('settings.github.switch')}
                  </Button>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onRemove(acc.id)}
                  data-testid={`github-account-remove-${acc.id}`}
                  className="h-7 border-destructive/20 px-2 text-[10px] text-destructive/80 transition-colors hover:border-destructive hover:bg-destructive/5 hover:text-destructive"
                >
                  {t('settings.github.remove')}
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
