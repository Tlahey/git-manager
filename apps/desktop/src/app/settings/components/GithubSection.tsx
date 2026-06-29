import { useState, useEffect } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Button, Input, ScrollArea } from '@git-manager/ui'
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
import {
  apiGithubDeviceCode,
  apiGithubPollToken,
  apiGithubGetUser,
} from '../../../api/github.api'
import type { GitHubUser } from '@git-manager/git-types'

export function GithubSection() {
  const { t } = useTranslation('settings')
  const { settings, updateSettings } = useSettingsStore()
  const github = settings.github || { accounts: [], activeAccountId: null }

  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Device authorization state
  const [deviceFlowData, setDeviceFlowData] = useState<{
    device_code: string
    user_code: string
    verification_uri: string
    expires_in: number
    interval: number
  } | null>(null)
  const [copied, setCopied] = useState(false)
  const [pollingIntervalId, setPollingIntervalId] = useState<any>(null)

  const [loginMethod, setLoginMethod] = useState<'oauth' | 'pat' | null>(null)
  const [patToken, setPatToken] = useState('')

  const activeAccount = github.accounts.find((a) => a.id === github.activeAccountId) || null

  // SWR Hook replaces manual useEffect for repo list fetching
  const { data: reposData, isLoading: loadingRepos } = useGitHubRepos(
    activeAccount?.token ?? null
  )
  const repos = reposData ?? []

  // Clear polling interval on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalId) clearInterval(pollingIntervalId)
    }
  }, [pollingIntervalId])

  async function handleOAuthLogin() {
    setError(null)
    setConnecting(true)
    setDeviceFlowData(null)
    if (pollingIntervalId) clearInterval(pollingIntervalId)

    try {
      const data = await apiGithubDeviceCode('repo read:user user:email')
      setDeviceFlowData(data)

      const interval = data.interval || 5
      const id = setInterval(async () => {
        try {
          const pollData = await apiGithubPollToken(data.device_code)

          if (pollData.error === 'authorization_pending' || pollData.error === 'slow_down') {
            return
          }
          if (pollData.error) {
            clearInterval(id)
            setDeviceFlowData(null)
            setConnecting(false)
            setError(`OAuth Error: ${pollData.error_description || pollData.error}`)
            return
          }
          if (pollData.access_token) {
            clearInterval(id)
            setDeviceFlowData(null)
            await completeLoginWithToken(pollData.access_token)
          }
        } catch (e: any) {
          console.error('Polling error:', e)
          clearInterval(id)
          setDeviceFlowData(null)
          setConnecting(false)
          setError(`Polling error: ${e?.message || String(e)}`)
        }
      }, interval * 1000)

      setPollingIntervalId(id)

      if (data.verification_uri) {
        window.open(data.verification_uri, '_blank')
      }
    } catch (err: any) {
      setConnecting(false)
      setError(err?.message || String(err))
    }
  }

  async function completeLoginWithToken(tokenVal: string): Promise<boolean> {
    setConnecting(true)
    setError(null)
    try {
      const userData = await apiGithubGetUser(tokenVal)

      const connectedUser: GitHubUser = {
        login: userData.login,
        name: userData.name || userData.login,
        email: userData.email,
        avatarUrl: userData.avatarUrl,
      }

      const newAccount = {
        id: userData.login,
        token: tokenVal,
        user: connectedUser,
      }

      const updatedAccounts = github.accounts.filter((a) => a.id !== userData.login)
      updatedAccounts.push(newAccount)

      updateSettings({
        github: {
          ...github,
          accounts: updatedAccounts,
          activeAccountId: userData.login,
        },
      })
      return true
    } catch (err: any) {
      setError(err.message || String(err))
      return false
    } finally {
      setConnecting(false)
    }
  }

  async function handleAddPatToken() {
    if (!patToken.trim()) return
    const success = await completeLoginWithToken(patToken.trim())
    if (success) {
      setPatToken('')
      setLoginMethod(null)
    }
  }

  function handleCancelFlow() {
    if (pollingIntervalId) clearInterval(pollingIntervalId)
    setDeviceFlowData(null)
    setConnecting(false)
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
    <div className="flex h-full w-full overflow-hidden divide-x divide-border">
      {/* Left panel: Connection & Accounts */}
      <div className="w-[340px] shrink-0 h-full flex flex-col bg-muted/5">
        <ScrollArea className="flex-1">
          <div className="p-6 space-y-6">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-foreground">{t('settings.github.title')}</h3>
              <p className="text-xs text-muted-foreground">{t('settings.github.tokenHint')}</p>
            </div>

            {/* Add Form */}
            {deviceFlowData ? (
              // Device Flow Authentication Steps Card
              <div className="space-y-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                    GitHub Authorization
                  </h4>
                  <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <RefreshCw className="h-3 w-3 animate-spin text-primary" />
                    {t('settings.github.waitingAuth')}
                  </span>
                </div>

                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t('settings.github.deviceCodeInstructions')}
                </p>

                <div className="flex items-center justify-center gap-4 rounded-md border border-border/60 bg-muted/30 p-4">
                  <span className="text-2xl font-bold font-mono tracking-wider text-foreground">
                    {deviceFlowData.user_code}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleCopyCode(deviceFlowData.user_code)}
                    className="text-xs h-8"
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
                    className="inline-flex h-8 items-center gap-1.5 rounded bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary-hover shadow-sm"
                  >
                    <span>{t('settings.github.openActivationPage')}</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>

                  <Button size="sm" variant="ghost" onClick={handleCancelFlow} className="text-xs h-8 text-muted-foreground hover:text-foreground">
                    {t('settings.github.cancel')}
                  </Button>
                </div>
              </div>
            ) : loginMethod === 'oauth' ? (
              <div className="space-y-4 rounded-lg border border-border bg-card/30 p-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-foreground">{t('settings.github.addUser')}</h4>
                  <button
                    type="button"
                    onClick={handleCancelFlow}
                    className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                  >
                    <ArrowLeft className="h-2.5 w-2.5" />
                    {t('settings.github.backToAuthOptions')}
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="flex flex-col gap-3">
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {t('settings.github.tokenHint')}
                    </p>
                    <Button
                      size="sm"
                      onClick={handleOAuthLogin}
                      disabled={connecting}
                      className="text-xs h-8 w-full gap-2"
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
                    <div className="flex items-center gap-2 rounded border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}
                </div>
              </div>
            ) : loginMethod === 'pat' ? (
              <div className="space-y-4 rounded-lg border border-border bg-card/30 p-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-foreground">{t('settings.github.addUser')}</h4>
                  <button
                    type="button"
                    onClick={handleCancelFlow}
                    className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
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
                      <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                        {t('settings.github.patLabel')}
                      </label>
                      <Input
                        type="password"
                        value={patToken}
                        onChange={(e) => setPatToken(e.target.value)}
                        placeholder={t('settings.github.patPlaceholder')}
                        className="h-8 text-xs font-mono"
                        disabled={connecting}
                      />
                    </div>
                    <Button
                      type="submit"
                      size="sm"
                      disabled={connecting || !patToken.trim()}
                      className="text-xs h-8 w-full gap-2"
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
                    <div className="flex items-center gap-2 rounded border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4 rounded-lg border border-border bg-card/30 p-4">
                <h4 className="text-xs font-semibold text-foreground">{t('settings.github.addUser')}</h4>
                <div className="flex flex-col gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setLoginMethod('oauth')
                      handleOAuthLogin()
                    }}
                    className="w-full text-xs justify-start h-9 px-3 gap-2 hover:bg-primary/5 hover:border-primary/30 transition-all duration-200"
                  >
                    <Github className="h-4 w-4 text-muted-foreground" />
                    <span>{t('settings.github.loginButton')}</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setLoginMethod('pat')}
                    className="w-full text-xs justify-start h-9 px-3 gap-2 hover:bg-primary/5 hover:border-primary/30 transition-all duration-200"
                  >
                    <Key className="h-4 w-4 text-muted-foreground" />
                    <span>{t('settings.github.loginWithPAT')}</span>
                  </Button>
                </div>
              </div>
            )}

            {/* Accounts List */}
            {github.accounts.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                  {t('settings.github.accountsTitle')}
                </h4>

                <div className="space-y-2">
                  {github.accounts.map((acc) => {
                    const isActive = acc.id === github.activeAccountId
                    return (
                      <div
                        key={acc.id}
                        className={`flex items-center justify-between rounded-lg border p-3 transition-colors ${
                          isActive
                            ? 'border-primary/50 bg-primary/5'
                            : 'border-border bg-card'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <img
                            src={acc.user.avatarUrl}
                            alt={acc.user.login}
                            className="h-10 w-10 rounded-full border border-border"
                          />
                          <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-semibold text-foreground truncate max-w-[120px]">
                                {acc.user.name || acc.user.login}
                              </span>
                              {isActive && (
                                <span className="rounded-full bg-emerald-500/10 text-emerald-500 ring-1 ring-emerald-500/20 px-1.5 py-0.5 text-[8px] font-semibold leading-none">
                                  {t('settings.github.activeAccount')}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-muted-foreground truncate">
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
                              className="text-[10px] h-7 px-2"
                            >
                              {t('settings.github.switch')}
                            </Button>
                          )}

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRemoveAccount(acc.id)}
                            className="text-[10px] h-7 px-2 border-destructive/20 text-destructive/80 hover:bg-destructive/5 hover:text-destructive hover:border-destructive transition-colors"
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
      <div className="flex-1 h-full flex flex-col bg-background">
        <div className="p-6 pb-4 border-b border-border flex items-center justify-between shrink-0">
          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-foreground">
              {t('settings.github.reposTitle')}
            </h4>
            {activeAccount && (
              <p className="text-xs text-muted-foreground">
                Connected as <span className="font-medium text-foreground">@{activeAccount.user.login}</span>
              </p>
            )}
          </div>
          {activeAccount && (
            <span className="text-[10px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded border border-border/40">
              {repos.length} repos
            </span>
          )}
        </div>

        <div className="flex-1 min-h-0">
          {loadingRepos ? (
            <div className="flex flex-col items-center justify-center h-full py-8 space-y-2">
              <RefreshCw className="h-6 w-6 animate-spin text-primary" />
              <p className="text-xs text-muted-foreground">Loading repositories...</p>
            </div>
          ) : !activeAccount ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8 text-muted-foreground">
              <AlertCircle className="h-8 w-8 mb-2 opacity-40 text-muted-foreground" />
              <p className="text-xs max-w-xs leading-relaxed">
                Connect an account or select one from the list to view its repositories.
              </p>
            </div>
          ) : repos.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8 text-muted-foreground">
              <p className="text-xs">
                {t('settings.github.noRepos')}
              </p>
            </div>
          ) : (
            <ScrollArea className="h-full">
              <div className="divide-y divide-border px-6">
                {repos.map((repo) => (
                  <div key={repo.id} className="flex items-start justify-between py-4 hover:bg-accent/10 transition-colors rounded px-2 -mx-2">
                    <div className="space-y-1 min-w-0 pr-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium text-foreground truncate max-w-[240px]" title={repo.name}>
                          {repo.name}
                        </span>
                        <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-medium leading-none ${
                          repo.private
                            ? 'bg-amber-500/10 text-amber-500 ring-1 ring-amber-500/20'
                            : 'bg-green-500/10 text-green-500 ring-1 ring-green-500/20'
                        }`}>
                          {repo.private ? <Lock className="h-2.5 w-2.5" /> : <Unlock className="h-2.5 w-2.5" />}
                          {repo.private ? 'Private' : 'Public'}
                        </span>
                      </div>
                      {repo.description && (
                        <p className="text-[10px] text-muted-foreground line-clamp-2 leading-relaxed">
                          {repo.description}
                        </p>
                      )}
                      <p className="text-[9px] text-muted-foreground/60 font-mono">
                        Updated {new Date(repo.updatedAt).toLocaleDateString()}
                      </p>
                    </div>

                    <a
                      href={repo.htmlUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-7 w-7 items-center justify-center rounded border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground shrink-0 mt-0.5"
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
