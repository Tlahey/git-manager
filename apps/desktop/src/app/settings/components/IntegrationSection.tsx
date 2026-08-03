import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Github, Flame, Gitlab, type LucideIcon } from 'lucide-react'
import { GithubSection } from './GithubSection'
import { TokenProviderPanel } from './TokenProviderPanel'
import { useSettingsStore } from '../../../stores/settings.store'

type Provider = 'github' | 'gitlab' | 'bitbucket'

export function IntegrationSection() {
  const { t } = useTranslation('settings')
  const [activeProvider, setActiveProvider] = useState<Provider>('github')
  const { settings, updateSettings } = useSettingsStore()

  // Field by field, not `settings.integrations || {…}`: the persisted settings are deep-merged on
  // rehydration, so a snapshot written by an older build (or trimmed by hand) can hold an
  // `integrations` object that exists but is missing a list — and the panels read `.length` off it.
  const stored = settings.integrations
  const integrations = {
    gitlabAccounts: stored?.gitlabAccounts ?? [],
    gitlabActiveAccountId: stored?.gitlabActiveAccountId ?? null,
    bitbucketAccounts: stored?.bitbucketAccounts ?? [],
    bitbucketActiveAccountId: stored?.bitbucketActiveAccountId ?? null,
  }

  const navProviders: { id: Provider; label: string; icon: LucideIcon }[] = [
    { id: 'github', label: 'GitHub', icon: Github },
    { id: 'gitlab', label: 'GitLab', icon: Gitlab },
    { id: 'bitbucket', label: 'Bitbucket', icon: Flame },
  ]

  function updateIntegrations(partial: Partial<typeof integrations>) {
    updateSettings({ integrations: { ...integrations, ...partial } })
  }

  return (
    <div className="flex h-[calc(100vh-53px)] w-full overflow-hidden border border-border bg-card text-card-foreground">
      {/* Sub-panel left: select provider */}
      <div
        className="flex w-40 shrink-0 flex-col gap-1 border-r border-border bg-muted/10 p-2"
        data-testid="integration-providers"
      >
        <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t('settings.integrations.providers')}
        </p>
        {navProviders.map((prov) => {
          const Icon = prov.icon
          const isActive = activeProvider === prov.id
          return (
            <button
              key={prov.id}
              onClick={() => setActiveProvider(prov.id)}
              data-testid={`integration-provider-${prov.id}`}
              data-active={isActive}
              className={`flex w-full cursor-pointer items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs transition-colors ${
                isActive
                  ? 'bg-primary/10 font-medium text-primary'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {prov.label}
            </button>
          )
        })}
      </div>

      {/* Provider Details Right */}
      <div className="h-full flex-1 overflow-hidden bg-background/50">
        {activeProvider === 'github' && <GithubSection />}

        {/* GitLab and Bitbucket share one panel: both connect with a host + username + token, and
            differ only in their name and two strings. GitHub does not — it goes through the OAuth
            device flow and keeps its own section. */}
        {activeProvider === 'gitlab' && (
          <TokenProviderPanel
            provider="gitlab"
            label="GitLab"
            hintKey="settings.integrations.gitlab.hint"
            tokenLabelKey="settings.integrations.gitlab.tokenLabel"
            tokenPlaceholder="glpat-..."
            defaultHost="https://gitlab.com"
            accounts={integrations.gitlabAccounts}
            activeAccountId={integrations.gitlabActiveAccountId}
            onChange={({ accounts, activeAccountId }) =>
              updateIntegrations({
                gitlabAccounts: accounts,
                gitlabActiveAccountId: activeAccountId,
              })
            }
          />
        )}

        {activeProvider === 'bitbucket' && (
          <TokenProviderPanel
            provider="bitbucket"
            label="Bitbucket"
            hintKey="settings.integrations.bitbucket.hint"
            tokenLabelKey="settings.integrations.bitbucket.tokenLabel"
            tokenPlaceholder={t('settings.integrations.bitbucket.tokenPlaceholder')}
            defaultHost="https://bitbucket.org"
            accounts={integrations.bitbucketAccounts}
            activeAccountId={integrations.bitbucketActiveAccountId}
            onChange={({ accounts, activeAccountId }) =>
              updateIntegrations({
                bitbucketAccounts: accounts,
                bitbucketActiveAccountId: activeAccountId,
              })
            }
          />
        )}
      </div>
    </div>
  )
}
