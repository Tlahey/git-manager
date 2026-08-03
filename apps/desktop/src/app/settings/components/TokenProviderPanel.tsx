import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Button, Input, ScrollArea, Tag, Alert } from '@git-manager/ui'
import { Check, Trash2, Key, Globe, User, Plus, RefreshCw } from 'lucide-react'
import type { ProviderAccount } from '@git-manager/git-types'

export interface TokenProviderPanelProps {
  /** Testid prefix and settings key stem — `gitlab`, `bitbucket`. Not user-facing. */
  provider: string
  /** The provider's proper name, interpolated into the copy. Deliberately untranslated. */
  label: string
  /** Namespaced i18n keys for the two strings that differ per provider. */
  hintKey: string
  tokenLabelKey: string
  /** Placeholder for the token field: an example value, so a literal is correct here. */
  tokenPlaceholder: string
  defaultHost: string
  /**
   * Checks the credentials against the provider and returns who they belong to. Rejecting is how
   * a wrong token is caught: without this the panel stored whatever had been typed, so a typo was
   * indistinguishable from a working account until something later tried to use it.
   */
  onValidate: (host: string, username: string, token: string) => Promise<{ displayName?: string }>
  accounts: ProviderAccount[]
  activeAccountId: string | null
  onChange: (next: { accounts: ProviderAccount[]; activeAccountId: string | null }) => void
}

/**
 * "Connect an account with a host + username + token" — the shape GitLab and Bitbucket share.
 *
 * It exists because those two were byte-identical 130-line copies of each other inside
 * `IntegrationSection`, differing only in the provider name and two strings. GitHub is *not* one of
 * these: it authenticates through the OAuth device flow and keeps its own section.
 *
 * Every control carries a `data-testid` keyed by `provider`, so both panels are drivable from the
 * outside without either copy drifting from the other's markers.
 */
export function TokenProviderPanel({
  provider,
  label,
  hintKey,
  tokenLabelKey,
  tokenPlaceholder,
  defaultHost,
  onValidate,
  accounts,
  activeAccountId,
  onChange,
}: TokenProviderPanelProps) {
  const { t } = useTranslation('settings')
  const [host, setHost] = useState(defaultHost)
  const [username, setUsername] = useState('')
  const [token, setToken] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConnect() {
    if (!username.trim() || !token.trim()) return
    setConnecting(true)
    setError(null)
    try {
      const identity = await onValidate(host.trim(), username.trim(), token.trim())
      const account: ProviderAccount = {
        id: `${username.trim()}@${host.replace('https://', '').replace('http://', '')}`,
        host: host.trim(),
        username: username.trim(),
        token: token.trim(),
        displayName: identity.displayName,
        authMethod: 'token',
      }
      const next = accounts.filter((a) => a.id !== account.id)
      next.push(account)

      onChange({ accounts: next, activeAccountId: account.id })
      setUsername('')
      setToken('')
    } catch (e) {
      setError(String(e))
    } finally {
      setConnecting(false)
    }
  }

  function handleRemove(id: string) {
    const next = accounts.filter((a) => a.id !== id)
    const stillActive =
      activeAccountId === id ? (next.length > 0 ? next[0]!.id : null) : activeAccountId
    onChange({ accounts: next, activeAccountId: stillActive })
  }

  return (
    <ScrollArea className="h-full">
      <div className="max-w-xl space-y-6 p-6" data-testid={`integration-panel-${provider}`}>
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            {t('settings.integrations.title', { provider: label })}
          </h3>
          <p className="text-xs text-muted-foreground">{t(hintKey)}</p>
        </div>

        {/* Form connection */}
        <div className="space-y-4 rounded-lg border border-border bg-muted/5 p-4">
          <h4 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Plus className="h-3.5 w-3.5" />
            {t('settings.integrations.connectAccountTitle', { provider: label })}
          </h4>

          <div className="space-y-3">
            <div className="space-y-1">
              <label className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
                <Globe className="h-3 w-3 text-muted-foreground" />
                {t('settings.integrations.instanceUrlLabel', { provider: label })}
              </label>
              <Input
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder={defaultHost}
                className="h-8 text-xs"
                data-testid={`integration-${provider}-host-input`}
              />
            </div>

            <div className="space-y-1">
              <label className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
                <User className="h-3 w-3 text-muted-foreground" />
                {t('settings.integrations.usernameLabel')}
              </label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t('settings.integrations.usernamePlaceholder')}
                className="h-8 text-xs"
                data-testid={`integration-${provider}-username-input`}
              />
            </div>

            <div className="space-y-1">
              <label className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
                <Key className="h-3 w-3 text-muted-foreground" />
                {t(tokenLabelKey)}
              </label>
              <Input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={tokenPlaceholder}
                className="h-8 text-xs"
                data-testid={`integration-${provider}-token-input`}
              />
            </div>

            <Button
              size="sm"
              className="h-8 w-full gap-1.5 text-xs"
              onClick={() => void handleConnect()}
              disabled={connecting || !username || !token}
              data-testid={`integration-${provider}-connect-button`}
            >
              {connecting ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  {t('settings.integrations.connecting')}
                </>
              ) : (
                t('settings.integrations.addAccountButton', { provider: label })
              )}
            </Button>
          </div>
        </div>

        {error && (
          <Alert variant="destructive" data-testid={`integration-${provider}-error`}>
            {error}
          </Alert>
        )}

        {/* Accounts list */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-foreground">
            {t('settings.integrations.connectedAccounts')}
          </h4>
          {accounts.length > 0 ? (
            <div
              className="divide-y divide-border overflow-hidden rounded-md border bg-muted/5"
              data-testid={`integration-${provider}-accounts`}
            >
              {accounts.map((account) => {
                const isActive = activeAccountId === account.id
                return (
                  <div
                    key={account.id}
                    className="flex items-center justify-between p-3"
                    data-testid={`integration-${provider}-account-${account.id}`}
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
                      {isActive ? (
                        <Tag
                          tone="success"
                          className="font-normal"
                          data-testid={`integration-${provider}-account-active`}
                        >
                          <Check className="h-3 w-3" /> {t('settings.integrations.active')}
                        </Tag>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-[10px]"
                          onClick={() => onChange({ accounts, activeAccountId: account.id })}
                          data-testid={`integration-${provider}-set-active-${account.id}`}
                        >
                          {t('settings.integrations.setActive')}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                        onClick={() => handleRemove(account.id)}
                        data-testid={`integration-${provider}-remove-${account.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div
              className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground"
              data-testid={`integration-${provider}-empty`}
            >
              {t('settings.integrations.noAccountConnected', { provider: label })}
            </div>
          )}
        </div>
      </div>
    </ScrollArea>
  )
}
