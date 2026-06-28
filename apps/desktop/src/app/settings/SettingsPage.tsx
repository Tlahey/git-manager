import { useState, useEffect } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { i18next } from '@git-manager/i18n'
import { Button, Input, Textarea, Separator, ScrollArea } from '@git-manager/ui'
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Monitor,
  Check,
  ExternalLink,
  Lock,
  Unlock,
  RefreshCw,
  AlertCircle,
  Github,
  Key,
} from 'lucide-react'
import { useSettingsStore } from '../../stores/settings.store'
import { checkOllamaStatus, getUserThemes, githubDeviceCode, githubPollToken, githubGetUser, githubListRepos } from '../../lib/tauri'
import type { GitHubRepoInfo } from '../../lib/tauri'
import { BUILTIN_THEMES } from '../../lib/themes'
import type { OllamaStatus, UserTheme, GitHubUser } from '@git-manager/git-types'

type Section = 'llm' | 'github' | 'git' | 'appearance' | 'language' | 'advanced'

interface SettingsPageProps {
  onClose: () => void
  initialSection?: Section
}

// ─── Tag Input ────────────────────────────────────────────────────────────────

interface TagInputProps {
  tags: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
}

function TagInput({ tags, onChange, placeholder }: TagInputProps) {
  const [input, setInput] = useState('')

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if ((e.key === 'Enter' || e.key === ',') && input.trim()) {
      e.preventDefault()
      const value = input.trim().replace(/,+$/, '')
      if (value && !tags.includes(value)) {
        onChange([...tags, value])
      }
      setInput('')
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      onChange(tags.slice(0, -1))
    }
  }

  function removeTag(index: number) {
    onChange(tags.filter((_, i) => i !== index))
  }

  return (
    <div className="flex flex-wrap gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm focus-within:ring-1 focus-within:ring-ring min-h-[38px]">
      {tags.map((tag, i) => (
        <span
          key={i}
          className="flex items-center gap-1 rounded bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
        >
          {tag}
          <button
            type="button"
            onClick={() => removeTag(i)}
            className="opacity-60 hover:opacity-100 text-xs leading-none"
          >
            ×
          </button>
        </span>
      ))}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={tags.length === 0 ? placeholder : ''}
        className="flex-1 min-w-[80px] bg-transparent outline-none text-xs placeholder:text-muted-foreground"
      />
    </div>
  )
}

// ─── LLM Section ─────────────────────────────────────────────────────────────

function LlmSection() {
  const { t } = useTranslation('settings')
  const { settings, updateSettings } = useSettingsStore()
  const ollama = settings.ollama
  const [connectionStatus, setConnectionStatus] = useState<OllamaStatus | null>(null)
  const [isTesting, setIsTesting] = useState(false)
  const [promptExpanded, setPromptExpanded] = useState(false)

  function updateOllama(partial: Partial<typeof ollama>) {
    updateSettings({ ollama: { ...ollama, ...partial } })
  }

  async function handleTestConnection() {
    setIsTesting(true)
    try {
      const status = await checkOllamaStatus(ollama.url)
      setConnectionStatus(status)
    } catch {
      setConnectionStatus({ connected: false, models: [] })
    } finally {
      setIsTesting(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* URL + Test */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">{t('settings.ollama.url')}</label>
        <div className="flex gap-2">
          <Input
            value={ollama.url}
            onChange={(e) => updateOllama({ url: e.target.value })}
            className="flex-1 h-8 text-xs"
          />
          <Button
            size="sm"
            variant="outline"
            className="h-8 shrink-0 text-xs"
            onClick={handleTestConnection}
            disabled={isTesting}
          >
            {t('settings.ollama.test')}
          </Button>
        </div>
        {connectionStatus !== null && (
          <p
            className={`text-xs ${
              connectionStatus.connected ? 'text-green-500' : 'text-destructive'
            }`}
          >
            {connectionStatus.connected
              ? t('settings.ollama.connected', { count: connectionStatus.models.length })
              : t('settings.ollama.disconnected')}
          </p>
        )}
      </div>

      {/* Model */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">{t('settings.ollama.model')}</label>
        {connectionStatus?.connected && connectionStatus.models.length > 0 ? (
          <select
            value={ollama.model}
            onChange={(e) => updateOllama({ model: e.target.value })}
            className="w-full h-8 rounded-md border border-input bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {connectionStatus.models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        ) : (
          <Input
            value={ollama.model}
            onChange={(e) => updateOllama({ model: e.target.value })}
            className="h-8 text-xs"
          />
        )}
      </div>

      {/* Temperature */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">
          {t('settings.ollama.temperature')}
        </label>
        <Input
          type="number"
          min={0}
          max={1}
          step={0.1}
          value={ollama.temperature}
          onChange={(e) => updateOllama({ temperature: parseFloat(e.target.value) })}
          className="h-8 w-24 text-xs"
        />
      </div>

      {/* Timeout */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">{t('settings.ollama.timeout')}</label>
        <Input
          type="number"
          min={5}
          max={300}
          value={ollama.timeoutSeconds}
          onChange={(e) => updateOllama({ timeoutSeconds: parseInt(e.target.value, 10) })}
          className="h-8 w-24 text-xs"
        />
      </div>

      {/* Checkboxes */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={ollama.includeRepoContext}
            onChange={(e) => updateOllama({ includeRepoContext: e.target.checked })}
            className="h-4 w-4 rounded border-border"
          />
          <span className="text-xs text-foreground">{t('settings.llm.includeContext')}</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={ollama.autoDetectScope}
            onChange={(e) => updateOllama({ autoDetectScope: e.target.checked })}
            className="h-4 w-4 rounded border-border"
          />
          <span className="text-xs text-foreground">{t('settings.llm.autoScope')}</span>
        </label>
      </div>

      {/* System prompt (collapsible) */}
      <div className="space-y-1.5">
        <button
          type="button"
          onClick={() => setPromptExpanded((v) => !v)}
          className="flex items-center gap-1 text-xs font-medium text-foreground hover:text-primary transition-colors"
        >
          {promptExpanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          {t('settings.llm.systemPrompt')}
        </button>
        {promptExpanded && (
          <div className="space-y-1.5">
            <Textarea
              value={ollama.systemPrompt}
              onChange={(e) => updateOllama({ systemPrompt: e.target.value })}
              rows={5}
              className="resize-none font-mono text-xs"
            />
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
              onClick={() => updateOllama({ systemPrompt: '' })}
            >
              {t('settings.llm.resetPrompt')}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── GitHub Section ───────────────────────────────────────────────────────────





function GithubSection() {
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

  const [repos, setRepos] = useState<GitHubRepoInfo[]>([])
  const [loadingRepos, setLoadingRepos] = useState(false)
  const [loginMethod, setLoginMethod] = useState<'oauth' | 'pat' | null>(null)
  const [patToken, setPatToken] = useState('')

  const activeAccount = github.accounts.find((a) => a.id === github.activeAccountId) || null

  // Clear polling interval on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalId) clearInterval(pollingIntervalId)
    }
  }, [pollingIntervalId])

  // Fetch repositories when active account changes
  useEffect(() => {
    if (activeAccount) {
      setLoadingRepos(true)
      githubListRepos(activeAccount.token)
        .then((data) => {
          setRepos(data)
        })
        .catch((err) => {
          console.error('Error fetching repos:', err)
          setRepos([])
        })
        .finally(() => {
          setLoadingRepos(false)
        })
    } else {
      setRepos([])
    }
  }, [github.activeAccountId, activeAccount])

  async function handleOAuthLogin() {
    setError(null)
    setConnecting(true)
    setDeviceFlowData(null)
    if (pollingIntervalId) clearInterval(pollingIntervalId)

    try {
      const data = await githubDeviceCode('repo read:user user:email')
      setDeviceFlowData(data)

      const interval = data.interval || 5
      const id = setInterval(async () => {
        try {
          const pollData = await githubPollToken(data.device_code)

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
      const userData = await githubGetUser(tokenVal)

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

// ─── Git Section ──────────────────────────────────────────────────────────────

function GitSection() {
  const { t } = useTranslation('settings')
  const { settings, updateSettings } = useSettingsStore()
  const git = settings.git

  function updateGit(partial: Partial<typeof git>) {
    updateSettings({ git: { ...git, ...partial } })
  }

  const autoFetchOptions = [
    { value: null, label: t('settings.git.autoFetch.off') },
    { value: 5, label: '5 min' },
    { value: 15, label: '15 min' },
    { value: 30, label: '30 min' },
  ]

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">{t('settings.git.defaultName')}</label>
        <Input
          value={git.defaultAuthorName}
          onChange={(e) => updateGit({ defaultAuthorName: e.target.value })}
          className="h-8 text-xs"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">{t('settings.git.defaultEmail')}</label>
        <Input
          type="email"
          value={git.defaultAuthorEmail}
          onChange={(e) => updateGit({ defaultAuthorEmail: e.target.value })}
          className="h-8 text-xs"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">
          {t('settings.git.protectedBranches')}
        </label>
        <TagInput
          tags={git.protectedBranches}
          onChange={(branches) => updateGit({ protectedBranches: branches })}
          placeholder="main, master…"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">{t('settings.git.autoFetch')}</label>
        <select
          value={git.autoFetchIntervalMinutes ?? 'null'}
          onChange={(e) => {
            const val = e.target.value === 'null' ? null : parseInt(e.target.value, 10)
            updateGit({ autoFetchIntervalMinutes: val })
          }}
          className="w-full h-8 rounded-md border border-input bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {autoFetchOptions.map((opt) => (
            <option key={String(opt.value)} value={String(opt.value)}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={git.showRemoteBranches}
            onChange={(e) => updateGit({ showRemoteBranches: e.target.checked })}
            className="h-4 w-4 rounded border-border"
          />
          <span className="text-xs text-foreground">{t('settings.git.showRemotes')}</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={git.confirmBeforeForcePush}
            onChange={(e) => updateGit({ confirmBeforeForcePush: e.target.checked })}
            className="h-4 w-4 rounded border-border"
          />
          <span className="text-xs text-foreground">{t('settings.git.confirmForcePush')}</span>
        </label>
      </div>
    </div>
  )
}

// ─── Appearance Section ───────────────────────────────────────────────────────

function ThemeCard({
  label,
  colors,
  isSystem,
  isActive,
  isCustom,
  onClick,
}: {
  id: string
  label: string
  colors: { bg: string; fg: string; primary: string; accent: string } | null
  isSystem?: boolean
  isActive: boolean
  isCustom?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex flex-col gap-2 rounded-lg border p-3 text-left transition-all cursor-pointer ${
        isActive
          ? 'border-primary bg-primary/10 ring-1 ring-primary'
          : 'border-border hover:border-muted-foreground/40 hover:bg-accent/50'
      }`}
    >
      {/* Swatch preview */}
      {isSystem ? (
        <div className="flex h-12 w-full items-center justify-center rounded-md border border-border bg-gradient-to-br from-muted to-background">
          <Monitor className="h-5 w-5 text-muted-foreground" />
        </div>
      ) : colors ? (
        <div
          className="h-12 w-full overflow-hidden rounded-md border border-black/10"
          style={{ background: colors.bg }}
        >
          <div className="flex h-full gap-0.5 p-1.5">
            <div className="flex-1 rounded-sm" style={{ background: colors.primary }} />
            <div className="flex-1 rounded-sm" style={{ background: colors.accent }} />
            <div
              className="flex-1 rounded-sm opacity-60"
              style={{ background: colors.fg }}
            />
          </div>
        </div>
      ) : (
        <div className="flex h-12 w-full items-center justify-center rounded-md border border-dashed border-border bg-muted/30">
          <span className="text-[10px] text-muted-foreground">CSS</span>
        </div>
      )}

      {/* Name + badges */}
      <div className="flex items-center justify-between gap-1">
        <span className="text-xs font-medium text-foreground truncate">{label}</span>
        <div className="flex shrink-0 items-center gap-1">
          {isCustom && (
            <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground">
              custom
            </span>
          )}
          {isActive && <Check className="h-3.5 w-3.5 text-primary" />}
        </div>
      </div>
    </button>
  )
}

function AppearanceSection() {
  const { t } = useTranslation('settings')
  const { settings, updateSettings } = useSettingsStore()
  const appearance = settings.appearance
  const [userThemes, setUserThemes] = useState<UserTheme[]>([])

  useEffect(() => {
    getUserThemes()
      .then(setUserThemes)
      .catch(() => setUserThemes([]))
  }, [])

  function updateAppearance(partial: Partial<typeof appearance>) {
    updateSettings({ appearance: { ...appearance, ...partial } })
  }

  const densities: { value: 'compact' | 'normal' | 'comfortable'; label: string }[] = [
    { value: 'compact', label: t('settings.appearance.density.compact') },
    { value: 'normal', label: t('settings.appearance.density.normal') },
    { value: 'comfortable', label: t('settings.appearance.density.comfortable') },
  ]

  const fontSizes = [12, 13, 14, 16]

  return (
    <div className="space-y-6">
      {/* Theme picker */}
      <div className="space-y-3">
        <p className="text-xs font-medium text-foreground">{t('settings.appearance.theme')}</p>
        <div className="grid grid-cols-3 gap-2">
          {BUILTIN_THEMES.map((theme) => (
            <ThemeCard
              key={theme.id}
              id={theme.id}
              label={t(theme.labelKey)}
              colors={theme.colors}
              isSystem={theme.id === 'system'}
              isActive={appearance.theme === theme.id}
              onClick={() => updateAppearance({ theme: theme.id })}
            />
          ))}
          {userThemes.map((theme) => (
            <ThemeCard
              key={theme.id}
              id={theme.id}
              label={theme.name}
              colors={null}
              isActive={appearance.theme === theme.id}
              isCustom
              onClick={() => updateAppearance({ theme: theme.id })}
            />
          ))}
        </div>
        {/* Custom themes hint */}
        <p className="text-[11px] text-muted-foreground">
          {t('settings.appearance.customThemes')}:{' '}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
            ~/.git-manager/themes/
          </code>
        </p>
      </div>

      {/* Font size */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">
          {t('settings.appearance.fontSize')}
        </label>
        <select
          value={appearance.fontSize}
          onChange={(e) => updateAppearance({ fontSize: parseInt(e.target.value, 10) })}
          className="h-8 rounded-md border border-input bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {fontSizes.map((size) => (
            <option key={size} value={size}>
              {size}px
            </option>
          ))}
        </select>
      </div>

      {/* Density */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-foreground">{t('settings.appearance.density')}</p>
        <div className="flex gap-2">
          {densities.map((d) => (
            <label
              key={d.value}
              className={`flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs cursor-pointer transition-colors ${
                appearance.density === d.value
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border text-muted-foreground hover:bg-accent'
              }`}
            >
              <input
                type="radio"
                name="density"
                value={d.value}
                checked={appearance.density === d.value}
                onChange={() => updateAppearance({ density: d.value })}
                className="sr-only"
              />
              {d.label}
            </label>
          ))}
        </div>
      </div>

      {/* Checkboxes */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={appearance.showAvatars}
            onChange={(e) => updateAppearance({ showAvatars: e.target.checked })}
            className="h-4 w-4 rounded border-border"
          />
          <span className="text-xs text-foreground">{t('settings.appearance.showAvatars')}</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={appearance.enableAnimations}
            onChange={(e) => updateAppearance({ enableAnimations: e.target.checked })}
            className="h-4 w-4 rounded border-border"
          />
          <span className="text-xs text-foreground">{t('settings.appearance.animations')}</span>
        </label>
      </div>
    </div>
  )
}

// ─── Language Section ─────────────────────────────────────────────────────────

function LanguageSection() {
  const { t } = useTranslation('settings')
  const { settings, updateSettings } = useSettingsStore()

  function handleChange(lang: 'en' | 'fr') {
    updateSettings({ language: lang })
    i18next.changeLanguage(lang)
  }

  const languages: { value: 'en' | 'fr'; label: string }[] = [
    { value: 'en', label: t('settings.language.en') },
    { value: 'fr', label: t('settings.language.fr') },
  ]

  return (
    <div className="space-y-5">
      <p className="text-xs font-medium text-foreground">{t('settings.language.title')}</p>
      <div className="flex gap-3">
        {languages.map((lang) => (
          <label
            key={lang.value}
            className={`flex items-center gap-2 rounded border px-4 py-2 text-sm cursor-pointer transition-colors ${
              settings.language === lang.value
                ? 'border-primary bg-primary/10 text-foreground'
                : 'border-border text-muted-foreground hover:bg-accent'
            }`}
          >
            <input
              type="radio"
              name="language"
              value={lang.value}
              checked={settings.language === lang.value}
              onChange={() => handleChange(lang.value)}
              className="sr-only"
            />
            {lang.label}
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{t('settings.language.note')}</p>
    </div>
  )
}

// ─── Advanced Section ─────────────────────────────────────────────────────────

function AdvancedSection() {
  const { t } = useTranslation('settings')
  const { settings, updateSettings, resetSettings } = useSettingsStore()
  const advanced = settings.advanced
  const [confirmReset, setConfirmReset] = useState(false)

  function updateAdvanced(partial: Partial<typeof advanced>) {
    updateSettings({ advanced: { ...advanced, ...partial } })
  }

  async function handleOpenDataFolder() {
    const { open } = await import('@tauri-apps/plugin-shell')
    await open('~/.config/git-manager/').catch(() => {})
  }

  function handleReset() {
    if (confirmReset) {
      resetSettings()
      setConfirmReset(false)
    } else {
      setConfirmReset(true)
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">
          {t('settings.advanced.exclusions')}
        </label>
        <TagInput
          tags={advanced.scanExclusions}
          onChange={(tags) => updateAdvanced({ scanExclusions: tags })}
          placeholder="node_modules, dist…"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">
          {t('settings.advanced.scanDepth')}
        </label>
        <Input
          type="number"
          min={1}
          max={10}
          value={advanced.maxScanDepth}
          onChange={(e) => updateAdvanced({ maxScanDepth: parseInt(e.target.value, 10) })}
          className="h-8 w-24 text-xs"
        />
      </div>

      <Button
        size="sm"
        variant="outline"
        className="text-xs"
        onClick={handleOpenDataFolder}
      >
        {t('settings.advanced.openDataFolder')}
      </Button>

      <Separator />

      {/* Danger zone */}
      <div className="space-y-2 rounded border border-destructive/40 bg-destructive/5 p-4">
        <p className="text-xs font-semibold text-destructive">{t('settings.dangerZone')}</p>
        {confirmReset && (
          <p className="text-xs text-muted-foreground">{t('settings.advanced.resetConfirm')}</p>
        )}
        <Button
          size="sm"
          variant="destructive"
          className="text-xs"
          onClick={handleReset}
        >
          {confirmReset ? 'Confirm — reset all settings' : t('settings.advanced.reset')}
        </Button>
        {confirmReset && (
          <Button
            size="sm"
            variant="ghost"
            className="text-xs ml-2"
            onClick={() => setConfirmReset(false)}
          >
            Cancel
          </Button>
        )}
      </div>
    </div>
  )
}

// ─── SettingsPage ─────────────────────────────────────────────────────────────

const isMac = typeof window !== 'undefined' && navigator.userAgent.includes('Mac')

export function SettingsPage({ onClose, initialSection }: SettingsPageProps) {
  const { t } = useTranslation('settings')
  const [activeSection, setActiveSection] = useState<Section>(initialSection || 'llm')

  const navItems: { id: Section; label: string }[] = [
    { id: 'llm', label: t('settings.sections.llm') },
    { id: 'github', label: t('settings.sections.github') },
    { id: 'git', label: t('settings.sections.git') },
    { id: 'appearance', label: t('settings.sections.appearance') },
    { id: 'language', label: t('settings.sections.language') },
    { id: 'advanced', label: t('settings.sections.advanced') },
  ]

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* Header */}
      <header
        data-tauri-drag-region
        className={`flex items-center gap-3 border-b border-border px-4 py-3 shrink-0 ${
          isMac ? 'pl-[72px]' : ''
        }`}
      >
        <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={onClose}>
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </Button>
        <h1 className="text-sm font-semibold">{t('settings.title')}</h1>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left nav */}
        <nav className="w-44 shrink-0 border-r border-border bg-muted/20 p-2">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={`w-full rounded px-3 py-2 text-left text-xs transition-colors ${
                activeSection === item.id
                  ? 'bg-accent text-foreground font-medium'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Content */}
        {activeSection === 'github' ? (
          <div className="flex-1 overflow-hidden h-full">
            <GithubSection />
          </div>
        ) : (
          <ScrollArea className="flex-1">
            <div className="mx-auto max-w-xl px-8 py-6">
              {activeSection === 'llm' && <LlmSection />}
              {activeSection === 'git' && <GitSection />}
              {activeSection === 'appearance' && <AppearanceSection />}
              {activeSection === 'language' && <LanguageSection />}
              {activeSection === 'advanced' && <AdvancedSection />}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  )
}
