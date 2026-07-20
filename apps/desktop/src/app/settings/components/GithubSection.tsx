import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Button, Input, ScrollArea, Alert, Tag, Card } from '@git-manager/ui'
import {
  ArrowLeft,
  Check,
  ExternalLink,
  Lock,
  Unlock,
  RefreshCw,
  AlertCircle,
  Github,
  Key,
} from 'lucide-react'
import { useSettingsStore } from '../../../stores/settings.store'
import { useGitHubRepos } from '../../../hooks/useGitHubRepos'
import { useGithubDeviceFlow } from '../../../hooks/useGithubDeviceFlow'
import type { GitHubUser } from '@git-manager/git-types'

export function GithubSection() {
  const { t } = useTranslation('settings')
  const { settings, updateSettings } = useSettingsStore()
  const github = settings.github || { accounts: [], activeAccountId: null }

  const [copied, setCopied] = useState(false)
  const [loginMethod, setLoginMethod] = useState<'oauth' | 'pat' | null>(null)
  const [patToken, setPatToken] = useState('')

  const activeAccount = github.accounts.find((a) => a.id === github.activeAccountId) || null

  // SWR Hook replaces manual useEffect for repo list fetching
  const { data: reposData, isLoading: loadingRepos } = useGitHubRepos(activeAccount?.token ?? null)
  const repos = reposData ?? []

  const { connecting, error, deviceFlowData, startOAuthLogin, completeLoginWithToken, cancelFlow } =
    useGithubDeviceFlow({
      onLoginSuccess: (token, user: GitHubUser) => {
        const newAccount = { id: user.login, token, user }
        const updatedAccounts = github.accounts.filter((a) => a.id !== user.login)
        updatedAccounts.push(newAccount)

        updateSettings({
          github: {
            ...github,
            accounts: updatedAccounts,
            activeAccountId: user.login,
          },
        })
      },
    })

  async function handleAddPatToken() {
    if (!patToken.trim()) return
    const success = await completeLoginWithToken(patToken.trim())
    if (success) {
      setPatToken('')
      setLoginMethod(null)
    }
  }

  function handleCancelFlow() {
    cancelFlow()
    setLoginMethod(null)
    setPatToken('')
  }

  function handleSetActive(id: string) {
    updateSettings({
      github: {
        ...github,
        activeAccountId: id,
      },
    })
  }

  function handleRemoveAccount(id: string) {
    const updatedAccounts = github.accounts.filter((a) => a.id !== id)
    let nextActiveId = github.activeAccountId

    if (github.activeAccountId === id) {
      nextActiveId = updatedAccounts.length > 0 ? updatedAccounts[0].id : null
    }

    updateSettings({
      github: {
        ...github,
        accounts: updatedAccounts,
        activeAccountId: nextActiveId,
      },
    })
  }

  function handleCopyCode(code: string) {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex h-full w-full divide-x divide-border overflow-hidden">
      {/* Left panel: Connection & Accounts */}
      <div className="flex h-full w-[340px] shrink-0 flex-col bg-muted/5">
        <ScrollArea className="flex-1">
          <div className="space-y-6 p-6">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-foreground">
                {t('settings.github.title')}
              </h3>
              <p className="text-xs text-muted-foreground">{t('settings.github.tokenHint')}</p>
            </div>

            {/* Add Form */}
            {deviceFlowData ? (
              // Device Flow Authentication Steps Card
              <div
                data-testid="github-device-flow-card"
                className="space-y-4 rounded-lg border border-primary/20 bg-primary/5 p-4"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                    GitHub Authorization
                  </h4>
                  <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <RefreshCw className="h-3 w-3 animate-spin text-primary" />
                    {t('settings.github.waitingAuth')}
                  </span>
                </div>

                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t('settings.github.deviceCodeInstructions')}
                </p>

                <div className="flex items-center justify-center gap-4 rounded-md border border-border/60 bg-muted/30 p-4">
                  <span
                    data-testid="github-device-user-code"
                    className="font-mono text-2xl font-bold tracking-wider text-foreground"
                  >
                    {deviceFlowData.user_code}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleCopyCode(deviceFlowData.user_code)}
                    className="h-8 text-xs"
                  >
                    {copied ? (
                      <>
                        <Check className="mr-1.5 h-3.5 w-3.5 text-green-500" />
                        {t('settings.github.codeCopied')}
                      </>
                    ) : (
                      t('settings.github.copyCode')
                    )}
                  </Button>
                </div>

                <div className="flex items-center gap-3">
                  <a
                    href={deviceFlowData.verification_uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="github-device-verification-link"
                    className="hover:bg-primary-hover inline-flex h-8 items-center gap-1.5 rounded bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition-colors"
                  >
                    <span>{t('settings.github.openActivationPage')}</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleCancelFlow}
                    data-testid="github-device-cancel-button"
                    className="h-8 text-xs text-muted-foreground hover:text-foreground"
                  >
                    {t('settings.github.cancel')}
                  </Button>
                </div>
              </div>
            ) : loginMethod === 'oauth' ? (
              <Card className="space-y-4 bg-card/30 p-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-foreground">
                    {t('settings.github.addUser')}
                  </h4>
                  <button
                    type="button"
                    onClick={handleCancelFlow}
                    data-testid="github-back-to-choice-button"
                    className="flex items-center gap-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <ArrowLeft className="h-2.5 w-2.5" />
                    {t('settings.github.backToAuthOptions')}
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="flex flex-col gap-3">
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {t('settings.github.tokenHint')}
                    </p>
                    <Button
                      size="sm"
                      onClick={startOAuthLogin}
                      disabled={connecting}
                      className="h-8 w-full gap-2 text-xs"
                    >
                      {connecting ? (
                        <>
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          {t('settings.github.connecting')}
                        </>
                      ) : (
                        <>
                          <Github className="h-4 w-4" />
                          {t('settings.github.loginButton')}
                        </>
                      )}
                    </Button>
                  </div>

                  {error && (
                    <Alert
                      data-testid="github-error-message"
                      className="items-center"
                      icon={<AlertCircle className="h-4 w-4" />}
                    >
                      {error}
                    </Alert>
                  )}
                </div>
              </Card>
            ) : loginMethod === 'pat' ? (
              <Card className="space-y-4 bg-card/30 p-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-foreground">
                    {t('settings.github.addUser')}
                  </h4>
                  <button
                    type="button"
                    onClick={handleCancelFlow}
                    data-testid="github-back-to-choice-button"
                    className="flex items-center gap-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <ArrowLeft className="h-2.5 w-2.5" />
                    {t('settings.github.backToAuthOptions')}
                  </button>
                </div>

                <div className="space-y-4">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      handleAddPatToken()
                    }}
                    className="space-y-3"
                  >
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {t('settings.github.patLabel')}
                      </label>
                      <Input
                        type="password"
                        value={patToken}
                        onChange={(e) => setPatToken(e.target.value)}
                        placeholder={t('settings.github.patPlaceholder')}
                        className="h-8 font-mono text-xs"
                        disabled={connecting}
                        data-testid="github-pat-input"
                      />
                    </div>
                    <Button
                      type="submit"
                      size="sm"
                      disabled={connecting || !patToken.trim()}
                      className="h-8 w-full gap-2 text-xs"
                      data-testid="github-pat-submit-button"
                    >
                      {connecting ? (
                        <>
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          {t('settings.github.connecting')}
                        </>
                      ) : (
                        <>
                          <Key className="h-3.5 w-3.5" />
                          {t('settings.github.addPatButton')}
                        </>
                      )}
                    </Button>
                  </form>

                  {error && (
                    <Alert
                      data-testid="github-error-message"
                      className="items-center"
                      icon={<AlertCircle className="h-4 w-4" />}
                    >
                      {error}
                    </Alert>
                  )}
                </div>
              </Card>
            ) : (
              <Card className="space-y-4 bg-card/30 p-4">
                <h4 className="text-xs font-semibold text-foreground">
                  {t('settings.github.addUser')}
                </h4>
                <div className="flex flex-col gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setLoginMethod('oauth')
                      startOAuthLogin()
                    }}
                    className="h-9 w-full justify-start gap-2 px-3 text-xs transition-all duration-200 hover:border-primary/30 hover:bg-primary/5"
                    data-testid="github-login-oauth-button"
                  >
                    <Github className="h-4 w-4 text-muted-foreground" />
                    <span>{t('settings.github.loginButton')}</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setLoginMethod('pat')}
                    className="h-9 w-full justify-start gap-2 px-3 text-xs transition-all duration-200 hover:border-primary/30 hover:bg-primary/5"
                    data-testid="github-login-pat-button"
                  >
                    <Key className="h-4 w-4 text-muted-foreground" />
                    <span>{t('settings.github.loginWithPAT')}</span>
                  </Button>
                </div>
              </Card>
            )}

            {/* Accounts List */}
            {github.accounts.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                  {t('settings.github.accountsTitle')}
                </h4>

                <div className="space-y-2">
                  {github.accounts.map((acc) => {
                    const isActive = acc.id === github.activeAccountId
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
                              onClick={() => handleSetActive(acc.id)}
                              data-testid={`github-account-switch-${acc.id}`}
                              className="h-7 px-2 text-[10px]"
                            >
                              {t('settings.github.switch')}
                            </Button>
                          )}

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRemoveAccount(acc.id)}
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
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Right panel: Repository Info (Full Height) */}
      <div className="flex h-full flex-1 flex-col bg-background">
        <div className="flex shrink-0 items-center justify-between border-b border-border p-6 pb-4">
          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-foreground">
              {t('settings.github.reposTitle')}
            </h4>
            {activeAccount && (
              <p className="text-xs text-muted-foreground">
                Connected as{' '}
                <span className="font-medium text-foreground">@{activeAccount.user.login}</span>
              </p>
            )}
          </div>
          {activeAccount && (
            <span className="rounded border border-border/40 bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              {repos.length} repos
            </span>
          )}
        </div>

        <div className="min-h-0 flex-1">
          {loadingRepos ? (
            <div className="flex h-full flex-col items-center justify-center space-y-2 py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-primary" />
              <p className="text-xs text-muted-foreground">Loading repositories...</p>
            </div>
          ) : !activeAccount ? (
            <div className="flex h-full flex-col items-center justify-center p-8 text-center text-muted-foreground">
              <AlertCircle className="mb-2 h-8 w-8 text-muted-foreground opacity-40" />
              <p className="max-w-xs text-xs leading-relaxed">
                Connect an account or select one from the list to view its repositories.
              </p>
            </div>
          ) : repos.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center p-8 text-center text-muted-foreground">
              <p className="text-xs">{t('settings.github.noRepos')}</p>
            </div>
          ) : (
            <ScrollArea className="h-full">
              <div className="divide-y divide-border px-6">
                {repos.map((repo) => (
                  <div
                    key={repo.id}
                    className="-mx-2 flex items-start justify-between rounded px-2 py-4 transition-colors hover:bg-accent/10"
                  >
                    <div className="min-w-0 space-y-1 pr-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="max-w-[240px] truncate text-xs font-medium text-foreground"
                          title={repo.name}
                        >
                          {repo.name}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-medium leading-none ${
                            repo.private
                              ? 'bg-amber-500/10 text-amber-500 ring-1 ring-amber-500/20'
                              : 'bg-green-500/10 text-green-500 ring-1 ring-green-500/20'
                          }`}
                        >
                          {repo.private ? (
                            <Lock className="h-2.5 w-2.5" />
                          ) : (
                            <Unlock className="h-2.5 w-2.5" />
                          )}
                          {repo.private ? 'Private' : 'Public'}
                        </span>
                      </div>
                      {repo.description && (
                        <p className="line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">
                          {repo.description}
                        </p>
                      )}
                      <p className="font-mono text-[9px] text-muted-foreground/60">
                        Updated {new Date(repo.updatedAt).toLocaleDateString()}
                      </p>
                    </div>

                    <a
                      href={repo.htmlUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      title="Open on GitHub"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </div>
    </div>
  )
}
