import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { ScrollArea } from '@git-manager/ui'
import type { GitHubUser } from '@git-manager/git-types'
import { useSettingsStore } from '../../../stores/settings.store'
import { apiGithubDisconnectAccount } from '../../../api/github.api'
import { useGitHubRepos } from '../../../hooks/useGitHubRepos'
import { useGithubDeviceFlow } from '../../../hooks/useGithubDeviceFlow'
import { GithubDeviceFlowCard } from './github/GithubDeviceFlowCard'
import { GithubLoginForm, type LoginMethod } from './github/GithubLoginForm'
import { GithubAccountList } from './github/GithubAccountList'
import { GithubReposPanel } from './github/GithubReposPanel'

/**
 * GitHub settings: the accounts on the left, the active one's repositories on the right.
 *
 * What stays here is the account *state* — the list, which one is active, and the login flow that
 * adds to it — because all three write to the same `settings.github` object and every one of the
 * four panels below is a view of it. Splitting that ownership across them would mean four
 * components each doing a read-modify-write on one shared record.
 */
export function GithubSection() {
  const { t } = useTranslation('settings')
  const { settings, updateSettings } = useSettingsStore()
  const github = settings.github || { accounts: [], activeAccountId: null }

  const [loginMethod, setLoginMethod] = useState<LoginMethod>(null)
  const [patToken, setPatToken] = useState('')

  const activeAccount = github.accounts.find((a) => a.id === github.activeAccountId) || null
  const { data: reposData, isLoading: loadingRepos } = useGitHubRepos(activeAccount?.id ?? null)
  const repos = reposData ?? []

  const { connecting, error, deviceFlowData, startOAuthLogin, completeLoginWithToken, cancelFlow } =
    useGithubDeviceFlow({
      // The token is already in the keychain by the time this runs — Rust stored it. What is
      // recorded here is the account's public half, which is all `settings.json` holds now.
      onLoginSuccess: (user: GitHubUser) => {
        // Logging in as someone already connected replaces that entry rather than adding a second:
        // the account id *is* the login, and it is the key the keychain entry is filed under.
        const updatedAccounts = github.accounts.filter((a) => a.id !== user.login)
        updatedAccounts.push({ id: user.login, user })
        updateSettings({
          github: { ...github, accounts: updatedAccounts, activeAccountId: user.login },
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
    updateSettings({ github: { ...github, activeAccountId: id } })
  }

  function handleRemoveAccount(id: string) {
    // Forget the credential first: dropping the account from the settings while its token stayed in
    // the keychain would leave an entry the user can see in Keychain Access and no longer revoke
    // from here. Best effort — a keychain that refuses must not strand the account on screen.
    void apiGithubDisconnectAccount(id).catch((err) => {
      console.error('Failed to remove the stored GitHub token:', err)
    })
    const updatedAccounts = github.accounts.filter((a) => a.id !== id)
    // Removing the active account promotes the first one left rather than leaving the app pointing
    // at an id that no longer exists.
    const nextActiveId =
      github.activeAccountId === id ? (updatedAccounts[0]?.id ?? null) : github.activeAccountId

    updateSettings({
      github: { ...github, accounts: updatedAccounts, activeAccountId: nextActiveId },
    })
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

            {/* A device flow in progress owns the slot: the code on screen is the only thing that
                can finish it, so offering the choice again underneath would be a dead end. */}
            {deviceFlowData ? (
              <GithubDeviceFlowCard flow={deviceFlowData} onCancel={handleCancelFlow} />
            ) : (
              <GithubLoginForm
                method={loginMethod}
                onPickMethod={setLoginMethod}
                onCancel={handleCancelFlow}
                connecting={connecting}
                error={error}
                onStartOAuth={startOAuthLogin}
                patToken={patToken}
                onPatTokenChange={setPatToken}
                onSubmitPat={handleAddPatToken}
              />
            )}

            <GithubAccountList
              accounts={github.accounts}
              activeAccountId={github.activeAccountId}
              onSetActive={handleSetActive}
              onRemove={handleRemoveAccount}
            />
          </div>
        </ScrollArea>
      </div>

      <GithubReposPanel account={activeAccount} repos={repos} isLoading={loadingRepos} />
    </div>
  )
}
