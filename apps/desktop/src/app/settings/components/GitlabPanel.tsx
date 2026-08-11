import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Button, Input, ScrollArea, Tag, Alert, GitlabIcon } from '@git-manager/ui'
import { Check, Trash2, Globe, RefreshCw, Copy, Key } from 'lucide-react'
import type { ProviderAccount } from '@git-manager/git-types'
import { useGitlabDeviceFlow } from '../../../hooks/useGitlabDeviceFlow'
import { apiDeleteCredential, apiStoreCredential } from '../../../api/credentials.api'

const GITLAB_COM = 'https://gitlab.com'

export interface GitlabPanelProps {
  accounts: ProviderAccount[]
  activeAccountId: string | null
  onChange: (next: { accounts: ProviderAccount[]; activeAccountId: string | null }) => void
}

/**
 * Signing in to GitLab, through the OAuth device flow — the same three steps as GitHub: a short
 * code, a page to approve it on, and the app waiting.
 *
 * The one thing GitHub never has to ask is *which* GitLab. gitlab.com works with the application
 * shipped in the app, so the common path is a single button. A self-hosted instance keeps its own
 * application registry and has never heard of that application, so it needs its own Application ID
 * — asked for only once the URL stops being gitlab.com, which keeps the field out of the way of
 * everyone it does not concern.
 */
export function GitlabPanel({ accounts, activeAccountId, onChange }: GitlabPanelProps) {
  const { t } = useTranslation('settings')
  const [host, setHost] = useState(GITLAB_COM)
  const [clientId, setClientId] = useState('')
  const [copied, setCopied] = useState(false)

  const normalisedHost = host.trim().replace(/\/+$/, '')
  const isSelfHosted = normalisedHost !== '' && normalisedHost !== GITLAB_COM

  const { connecting, error, deviceFlowData, startOAuthLogin, cancelFlow } = useGitlabDeviceFlow({
    instanceUrl: normalisedHost || GITLAB_COM,
    clientId: isSelfHosted ? clientId.trim() || null : null,
    onLoginSuccess: async (token, user) => {
      const id = `${user.username}@${(normalisedHost || GITLAB_COM).replace(/^https?:\/\//, '')}`
      const account: ProviderAccount = {
        id,
        host: normalisedHost || GITLAB_COM,
        username: user.username,
        displayName: user.name ?? undefined,
        avatarUrl: user.avatarUrl ?? undefined,
        authMethod: 'oauth',
        clientId: isSelfHosted ? clientId.trim() || undefined : undefined,
      }
      // The token goes to the OS keychain and nowhere else — `settings.json` records who is
      // connected, never what would let something act as them. Stored before the account is
      // announced, so a keychain failure cannot leave an account listed with nothing behind it.
      await apiStoreCredential('gitlab', token, id)
      onChange({
        accounts: [...accounts.filter((a) => a.id !== id), account],
        activeAccountId: id,
      })
    },
  })

  function handleRemove(id: string) {
    // Forget the credential too: dropping the account here while its token stayed in the keychain
    // would leave an entry nothing in the app can reach — or revoke. Best effort.
    void apiDeleteCredential('gitlab', id).catch((e) => {
      console.error('Failed to remove the stored GitLab token:', e)
    })
    const next = accounts.filter((a) => a.id !== id)
    const stillActive = activeAccountId === id ? (next[0]?.id ?? null) : activeAccountId
    onChange({ accounts: next, activeAccountId: stillActive })
  }

  function handleCopyCode(code: string) {
    void navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Self-hosted cannot start without an Application ID — there is no id to fall back on.
  const canConnect = !connecting && (!isSelfHosted || clientId.trim().length > 0)

  return (
    <ScrollArea className="h-full">
      <div className="max-w-xl space-y-6 p-6" data-testid="integration-panel-gitlab">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            {t('settings.integrations.title', { provider: 'GitLab' })}
          </h3>
          <p className="text-xs text-muted-foreground">{t('settings.integrations.gitlab.hint')}</p>
        </div>

        {deviceFlowData ? (
          <div
            data-testid="gitlab-device-flow-card"
            className="space-y-4 rounded-lg border border-primary/20 bg-primary/5 p-4"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold tracking-wider text-foreground uppercase">
                {t('settings.integrations.gitlab.authorization')}
              </h4>
              <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <RefreshCw className="h-3 w-3 animate-spin text-primary" />
                {t('settings.github.waitingAuth')}
              </span>
            </div>

            <p className="text-xs leading-relaxed text-muted-foreground">
              {t('settings.integrations.gitlab.deviceCodeInstructions')}
            </p>

            <div className="flex items-center justify-center gap-4 rounded-md border border-border/60 bg-muted/30 p-4">
              <span
                data-testid="gitlab-device-user-code"
                className="font-mono text-2xl font-bold tracking-wider text-foreground"
              >
                {deviceFlowData.user_code}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleCopyCode(deviceFlowData.user_code)}
                data-testid="gitlab-device-copy-code"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>

            <a
              href={deviceFlowData.verification_uri_complete ?? deviceFlowData.verification_uri}
              target="_blank"
              rel="noreferrer"
              data-testid="gitlab-device-verification-link"
              className="block text-center font-mono text-[11px] text-primary underline"
            >
              {deviceFlowData.verification_uri}
            </a>

            <Button
              size="sm"
              variant="ghost"
              className="w-full text-xs"
              onClick={cancelFlow}
              data-testid="gitlab-device-cancel"
            >
              {t('settings.github.cancel')}
            </Button>
          </div>
        ) : (
          <div className="space-y-4 rounded-lg border border-border bg-muted/5 p-4">
            <h4 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <GitlabIcon className="h-3.5 w-3.5" />
              {t('settings.integrations.connectAccountTitle', { provider: 'GitLab' })}
            </h4>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
                  <Globe className="h-3 w-3 text-muted-foreground" />
                  {t('settings.integrations.instanceUrlLabel', { provider: 'GitLab' })}
                </label>
                <Input
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder={GITLAB_COM}
                  className="h-8 text-xs"
                  data-testid="integration-gitlab-host-input"
                />
              </div>

              {isSelfHosted && (
                <div className="space-y-1" data-testid="integration-gitlab-client-id-field">
                  <label className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
                    <Key className="h-3 w-3 text-muted-foreground" />
                    {t('settings.integrations.gitlab.clientIdLabel')}
                  </label>
                  <Input
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    placeholder="a1b2c3…"
                    className="h-8 text-xs"
                    data-testid="integration-gitlab-client-id-input"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    {t('settings.integrations.gitlab.clientIdHint')}
                  </p>
                </div>
              )}

              <Button
                size="sm"
                className="h-8 w-full gap-1.5 text-xs"
                onClick={() => void startOAuthLogin()}
                disabled={!canConnect}
                data-testid="integration-gitlab-connect-button"
              >
                {connecting ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    {t('settings.integrations.connecting')}
                  </>
                ) : (
                  t('settings.integrations.gitlab.signIn')
                )}
              </Button>
            </div>
          </div>
        )}

        {error && (
          <Alert variant="destructive" data-testid="integration-gitlab-error">
            {error}
          </Alert>
        )}

        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-foreground">
            {t('settings.integrations.connectedAccounts')}
          </h4>
          {accounts.length > 0 ? (
            <div
              className="divide-y divide-border overflow-hidden rounded-md border bg-muted/5"
              data-testid="integration-gitlab-accounts"
            >
              {accounts.map((account) => (
                <div
                  key={account.id}
                  className="flex items-center justify-between p-3"
                  data-testid={`integration-gitlab-account-${account.id}`}
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-medium text-foreground">
                      {account.displayName || account.username}
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {account.host}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {activeAccountId === account.id ? (
                      <Tag
                        tone="success"
                        className="font-normal"
                        data-testid="integration-gitlab-account-active"
                      >
                        <Check className="h-3 w-3" /> {t('settings.integrations.active')}
                      </Tag>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-[10px]"
                        onClick={() => onChange({ accounts, activeAccountId: account.id })}
                        data-testid={`integration-gitlab-set-active-${account.id}`}
                      >
                        {t('settings.integrations.setActive')}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                      onClick={() => handleRemove(account.id)}
                      data-testid={`integration-gitlab-remove-${account.id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div
              className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground"
              data-testid="integration-gitlab-empty"
            >
              {t('settings.integrations.noAccountConnected', { provider: 'GitLab' })}
            </div>
          )}
        </div>
      </div>
    </ScrollArea>
  )
}
