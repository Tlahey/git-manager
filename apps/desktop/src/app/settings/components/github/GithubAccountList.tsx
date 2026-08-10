import { Button, Tag } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import type { GitHubAccount } from '@git-manager/git-types'

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
                </div>
              </div>

              <div className="flex items-center gap-2">
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
