import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Github, Flame, Gitlab, type LucideIcon } from 'lucide-react'
import { GithubSection } from './GithubSection'
import { TokenProviderPanel } from './TokenProviderPanel'
import { GitlabPanel } from './GitlabPanel'
import { apiBitbucketGetUser } from '../../../api/integrations.api'
import { useSettingsStore } from '../../../stores/settings.store'

type Provider = 'github' | 'gitlab' | 'bitbucket'

/**
 * Which forges the Integrations screen offers.
 *
 * GitLab and Bitbucket are **built and tested but not listed**, on purpose:
 *
 * - GitLab's device flow needs an OAuth application registered on gitlab.com, whose Application ID
 *   goes in `commands/gitlab.rs` (the same one-off registration `GITHUB_CLIENT_ID` came from). Until
 *   that exists, every sign-in would fail on the first request.
 * - Nothing in the app reads either account yet — there is no call to a GitLab or Bitbucket API
 *   anywhere — so both would offer to connect and then do nothing with the result.
 *
 * Adding an id back here is the whole of re-enabling one: the panels, the commands, the settings
 * shape and their tests all stay in place. Keeping them wired rather than deleted is why this is a
 * list and not a removal.
 */
const AVAILABLE_PROVIDERS: Provider[] = ['github']

const PROVIDER_NAV: { id: Provider; label: string; icon: LucideIcon }[] = [
  { id: 'github', label: 'GitHub', icon: Github },
  { id: 'gitlab', label: 'GitLab', icon: Gitlab },
  { id: 'bitbucket', label: 'Bitbucket', icon: Flame },
]

export function IntegrationSection() {
  const { t } = useTranslation('settings')
  const [activeProvider, setActiveProvider] = useState<Provider>(AVAILABLE_PROVIDERS[0]!)
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

  const navProviders = PROVIDER_NAV.filter((p) => AVAILABLE_PROVIDERS.includes(p.id))

  function updateIntegrations(partial: Partial<typeof integrations>) {
    updateSettings({ integrations: { ...integrations, ...partial } })
  }

  return (
    <div className="flex h-[calc(100vh-53px)] w-full overflow-hidden border border-border bg-card text-card-foreground">
      {/* Sub-panel left: select provider. Hidden when there is only one — a column headed
          "Providers" listing a single entry is a chooser with nothing to choose. */}
      {navProviders.length > 1 && (
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
      )}

      {/* Provider Details Right */}
      <div className="h-full flex-1 overflow-hidden bg-background/50">
        {activeProvider === 'github' && <GithubSection />}

        {/* Each provider authenticates the way it actually supports, which is not the same way:
            GitHub and GitLab both do the OAuth device flow (a code, a page, polling), while
            Bitbucket has no device grant at all — Atlassian offers only the authorization-code
            grant, which needs a redirect URI and so a local HTTP server. A verified token is the
            honest answer there, and `TokenProviderPanel` checks it rather than pretending. */}
        {activeProvider === 'gitlab' && (
          <GitlabPanel
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
            onValidate={async (_host, username, token) => {
              const user = await apiBitbucketGetUser(username, token)
              return { displayName: user.displayName }
            }}
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
