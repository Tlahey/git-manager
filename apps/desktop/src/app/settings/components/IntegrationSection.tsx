import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Button, Input, ScrollArea } from '@git-manager/ui'
import { Github, Flame, Gitlab, Check, Trash2, Key, Globe, User, Plus, RefreshCw } from 'lucide-react'
import { GithubSection } from './GithubSection'
import { useSettingsStore } from '../../../stores/settings.store'
import type { ProviderAccount } from '@git-manager/git-types'

type Provider = 'github' | 'gitlab' | 'bitbucket'

export function IntegrationSection() {
  const { t } = useTranslation('settings')
  const [activeProvider, setActiveProvider] = useState<Provider>('github')
  const { settings, updateSettings } = useSettingsStore()

  const integrations = settings.integrations || {
    gitlabAccounts: [],
    gitlabActiveAccountId: null,
    bitbucketAccounts: [],
    bitbucketActiveAccountId: null,
  }

  // GitLab Form state
  const [glHost, setGlHost] = useState('https://gitlab.com')
  const [glUser, setGlUser] = useState('')
  const [glToken, setGlToken] = useState('')
  const [glConnecting, setGlConnecting] = useState(false)

  // Bitbucket Form state
  const [bbHost, setBbHost] = useState('https://bitbucket.org')
  const [bbUser, setBbUser] = useState('')
  const [bbToken, setBbToken] = useState('')
  const [bbConnecting, setBbConnecting] = useState(false)

  const navProviders: { id: Provider; label: string; icon: any }[] = [
    { id: 'github', label: 'GitHub', icon: Github },
    { id: 'gitlab', label: 'GitLab', icon: Gitlab },
    { id: 'bitbucket', label: 'Bitbucket', icon: Flame },
  ]

  function updateIntegrations(partial: Partial<typeof integrations>) {
    updateSettings({ integrations: { ...integrations, ...partial } })
  }

  // --- GitLab Actions ---
  function handleConnectGitLab() {
    if (!glUser.trim() || !glToken.trim()) return
    setGlConnecting(true)

    // Simulate key validation and connect
    setTimeout(() => {
      const newAccount: ProviderAccount = {
        id: `${glUser.trim()}@${glHost.replace('https://', '').replace('http://', '')}`,
        host: glHost.trim(),
        username: glUser.trim(),
        token: glToken.trim(),
      }

      const updated = integrations.gitlabAccounts.filter((a) => a.id !== newAccount.id)
      updated.push(newAccount)

      updateIntegrations({
        gitlabAccounts: updated,
        gitlabActiveAccountId: newAccount.id,
      })

      setGlUser('')
      setGlToken('')
      setGlConnecting(false)
    }, 800)
  }

  function handleRemoveGitLab(id: string) {
    const updated = integrations.gitlabAccounts.filter((a) => a.id !== id)
    let activeId = integrations.gitlabActiveAccountId
    if (activeId === id) {
      activeId = updated.length > 0 ? updated[0].id : null
    }
    updateIntegrations({
      gitlabAccounts: updated,
      gitlabActiveAccountId: activeId,
    })
  }

  // --- Bitbucket Actions ---
  function handleConnectBitbucket() {
    if (!bbUser.trim() || !bbToken.trim()) return
    setBbConnecting(true)

    // Simulate connection
    setTimeout(() => {
      const newAccount: ProviderAccount = {
        id: `${bbUser.trim()}@${bbHost.replace('https://', '').replace('http://', '')}`,
        host: bbHost.trim(),
        username: bbUser.trim(),
        token: bbToken.trim(),
      }

      const updated = integrations.bitbucketAccounts.filter((a) => a.id !== newAccount.id)
      updated.push(newAccount)

      updateIntegrations({
        bitbucketAccounts: updated,
        bitbucketActiveAccountId: newAccount.id,
      })

      setBbUser('')
      setBbToken('')
      setBbConnecting(false)
    }, 800)
  }

  function handleRemoveBitbucket(id: string) {
    const updated = integrations.bitbucketAccounts.filter((a) => a.id !== id)
    let activeId = integrations.bitbucketActiveAccountId
    if (activeId === id) {
      activeId = updated.length > 0 ? updated[0].id : null
    }
    updateIntegrations({
      bitbucketAccounts: updated,
      bitbucketActiveAccountId: activeId,
    })
  }

  return (
    <div className="flex h-[calc(100vh-140px)] w-full overflow-hidden border border-border rounded-lg bg-card text-card-foreground">
      {/* Sub-panel left: select provider */}
      <div className="w-40 shrink-0 border-r border-border bg-muted/10 p-2 flex flex-col gap-1">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase px-2 py-1 tracking-wider">
          Fournisseurs
        </p>
        {navProviders.map((prov) => {
          const Icon = prov.icon
          const isActive = activeProvider === prov.id
          return (
            <button
              key={prov.id}
              onClick={() => setActiveProvider(prov.id)}
              className={`flex items-center gap-2 w-full rounded px-2.5 py-1.5 text-left text-xs transition-colors cursor-pointer ${
                isActive
                  ? 'bg-primary/10 text-primary font-medium'
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
      <div className="flex-1 overflow-hidden h-full bg-background/50">
        {activeProvider === 'github' && <GithubSection />}

        {activeProvider === 'gitlab' && (
          <ScrollArea className="h-full">
            <div className="p-6 space-y-6 max-w-xl">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Intégration GitLab</h3>
                <p className="text-xs text-muted-foreground">
                  Synchronisez vos dépôts GitLab en connectant vos comptes personnels ou auto-hébergés.
                </p>
              </div>

              {/* Form connection */}
              <div className="space-y-4 rounded-lg border border-border bg-muted/5 p-4">
                <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Plus className="h-3.5 w-3.5" />
                  Connecter un compte GitLab
                </h4>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-foreground flex items-center gap-1.5">
                      <Globe className="h-3 w-3 text-muted-foreground" />
                      URL de l'instance GitLab
                    </label>
                    <Input
                      value={glHost}
                      onChange={(e) => setGlHost(e.target.value)}
                      placeholder="https://gitlab.com"
                      className="h-8 text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-foreground flex items-center gap-1.5">
                      <User className="h-3 w-3 text-muted-foreground" />
                      Nom d'utilisateur
                    </label>
                    <Input
                      value={glUser}
                      onChange={(e) => setGlUser(e.target.value)}
                      placeholder="Ex: adupont"
                      className="h-8 text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-foreground flex items-center gap-1.5">
                      <Key className="h-3 w-3 text-muted-foreground" />
                      Personal Access Token (PAT)
                    </label>
                    <Input
                      type="password"
                      value={glToken}
                      onChange={(e) => setGlToken(e.target.value)}
                      placeholder="glpat-..."
                      className="h-8 text-xs"
                    />
                  </div>

                  <Button
                    size="sm"
                    className="h-8 text-xs w-full gap-1.5"
                    onClick={handleConnectGitLab}
                    disabled={glConnecting || !glUser || !glToken}
                  >
                    {glConnecting ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        Connexion...
                      </>
                    ) : (
                      'Ajouter le compte GitLab'
                    )}
                  </Button>
                </div>
              </div>

              {/* Accounts list */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-foreground">Comptes connectés</h4>
                {integrations.gitlabAccounts.length > 0 ? (
                  <div className="divide-y divide-border border rounded-md overflow-hidden bg-muted/5">
                    {integrations.gitlabAccounts.map((account) => {
                      const isActive = integrations.gitlabActiveAccountId === account.id
                      return (
                        <div key={account.id} className="flex items-center justify-between p-3">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-medium text-foreground">{account.username}</span>
                            <span className="text-[10px] text-muted-foreground font-mono">{account.host}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {isActive ? (
                              <span className="text-[10px] bg-green-500/10 text-green-500 rounded px-1.5 py-0.5 flex items-center gap-1">
                                <Check className="h-3 w-3" /> Actif
                              </span>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-[10px]"
                                onClick={() => updateIntegrations({ gitlabActiveAccountId: account.id })}
                              >
                                Activer
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                              onClick={() => handleRemoveGitLab(account.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground p-4 text-center border border-dashed rounded-md">
                    Aucun compte GitLab connecté
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        )}

        {activeProvider === 'bitbucket' && (
          <ScrollArea className="h-full">
            <div className="p-6 space-y-6 max-w-xl">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Intégration Bitbucket</h3>
                <p className="text-xs text-muted-foreground">
                  Synchronisez vos dépôts Bitbucket en connectant vos comptes personnels ou Cloud.
                </p>
              </div>

              {/* Form connection */}
              <div className="space-y-4 rounded-lg border border-border bg-muted/5 p-4">
                <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Plus className="h-3.5 w-3.5" />
                  Connecter un compte Bitbucket
                </h4>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-foreground flex items-center gap-1.5">
                      <Globe className="h-3 w-3 text-muted-foreground" />
                      Instance Bitbucket URL
                    </label>
                    <Input
                      value={bbHost}
                      onChange={(e) => setBbHost(e.target.value)}
                      placeholder="https://bitbucket.org"
                      className="h-8 text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-foreground flex items-center gap-1.5">
                      <User className="h-3 w-3 text-muted-foreground" />
                      Nom d'utilisateur
                    </label>
                    <Input
                      value={bbUser}
                      onChange={(e) => setBbUser(e.target.value)}
                      placeholder="Ex: antoine-d"
                      className="h-8 text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-foreground flex items-center gap-1.5">
                      <Key className="h-3 w-3 text-muted-foreground" />
                      App Password / Token
                    </label>
                    <Input
                      type="password"
                      value={bbToken}
                      onChange={(e) => setBbToken(e.target.value)}
                      placeholder="Saisissez votre mot de passe d'application"
                      className="h-8 text-xs"
                    />
                  </div>

                  <Button
                    size="sm"
                    className="h-8 text-xs w-full gap-1.5"
                    onClick={handleConnectBitbucket}
                    disabled={bbConnecting || !bbUser || !bbToken}
                  >
                    {bbConnecting ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        Connexion...
                      </>
                    ) : (
                      'Ajouter le compte Bitbucket'
                    )}
                  </Button>
                </div>
              </div>

              {/* Accounts list */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-foreground">Comptes connectés</h4>
                {integrations.bitbucketAccounts.length > 0 ? (
                  <div className="divide-y divide-border border rounded-md overflow-hidden bg-muted/5">
                    {integrations.bitbucketAccounts.map((account) => {
                      const isActive = integrations.bitbucketActiveAccountId === account.id
                      return (
                        <div key={account.id} className="flex items-center justify-between p-3">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-medium text-foreground">{account.username}</span>
                            <span className="text-[10px] text-muted-foreground font-mono">{account.host}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {isActive ? (
                              <span className="text-[10px] bg-green-500/10 text-green-500 rounded px-1.5 py-0.5 flex items-center gap-1">
                                <Check className="h-3 w-3" /> Actif
                              </span>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-[10px]"
                                onClick={() => updateIntegrations({ bitbucketActiveAccountId: account.id })}
                              >
                                Activer
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                              onClick={() => handleRemoveBitbucket(account.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground p-4 text-center border border-dashed rounded-md">
                    Aucun compte Bitbucket connecté
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  )
}
