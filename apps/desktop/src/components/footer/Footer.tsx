import { useState, useMemo } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { useRepoDataStore } from '../../stores/repoData.store'
import { useRepoUIStore, DASHBOARD_TAB, REWARDS_TAB, PULL_REQUESTS_TAB } from '../../stores/repoUI.store'
import { useSettingsStore } from '../../stores/settings.store'
import { useGameStore, getLevelInfo } from '../../stores/game.store'
import {
  LayoutDashboard,
  Rocket,
  GitBranch,
  Keyboard,
  Github,
  CheckCircle2,
  AlertCircle,
  Terminal,
  ClipboardCopy,
  ClipboardCheck,
  Trophy,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from '@git-manager/ui'

interface FooterProps {
  onOpenSettings: (section?: 'general' | 'ssh' | 'integrations' | 'local_ai' | 'external_tools' | 'notifications' | 'ui_customization' | 'rewards') => void
}

export function Footer({ onOpenSettings }: FooterProps) {
  const { t } = useTranslation('common')
  const { repoCache, savedRepos, discoveredRepos } = useRepoDataStore()
  const { activeTab, setActiveTab } = useRepoUIStore()
  const { settings } = useSettingsStore()
  const { points, rewardsEnabled } = useGameStore()
  const { level } = getLevelInfo(points)
  
  const [copied, setCopied] = useState(false)
  const [isShortcutOpen, setIsShortcutOpen] = useState(false)

  // Calcule le nombre total de dépôts uniques connus
  const totalRepos = useMemo(() => {
    const uniquePaths = new Set([
      ...savedRepos.map((r) => r.path),
      ...(discoveredRepos || []).map((r) => r.path),
    ])
    return uniquePaths.size
  }, [savedRepos, discoveredRepos])

  // Dépôt actuel si on est sur un onglet de dépôt
  const isRepoTab = activeTab !== DASHBOARD_TAB && activeTab !== PULL_REQUESTS_TAB && activeTab !== REWARDS_TAB
  const currentRepo = isRepoTab ? repoCache[activeTab] : null

  // Compte GitHub connecté
  const github = settings.github || { accounts: [], activeAccountId: null }
  const activeAccount = github.accounts.find((a) => a.id === github.activeAccountId) || null

  const appVersion = '0.1.0' // Version statique définie dans package.json

  // Copie le chemin du dépôt dans le presse-papier
  const handleCopyPath = async () => {
    if (!activeTab || !isRepoTab) return
    try {
      await navigator.clipboard.writeText(activeTab)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy path:', err)
    }
  }

  // Raccourcis clavier pour l'affichage
  const shortcuts = [
    {
      category: 'Navigation',
      items: [
        { keys: ['Alt', '1'], desc: 'Aller à l\'accueil (Dashboard)' },
        { keys: ['Alt', '2'], desc: 'Aller au Launchpad (PRs)' },
        { keys: ['Alt', '3-9'], desc: 'Basculer vers les dépôts ouverts (onglets 3 à 9)' },
      ],
    },
    {
      category: 'Dépôts & Actions',
      items: [
        { keys: ['⌘', 'O'], desc: 'Ouvrir un dépôt Git local' },
        { keys: ['⌘', 'D'], desc: 'Scanner un dossier pour trouver des dépôts' },
        { keys: ['⌘', 'F'], desc: 'Filtrer/Rechercher un dépôt dans la liste' },
      ],
    },
    {
      category: 'Général',
      items: [
        { keys: ['Alt', ','], desc: 'Ouvrir les Paramètres' },
        { keys: ['Alt', 'W'], desc: 'Fermer l\'onglet du dépôt actif' },
        { keys: ['Esc'], desc: 'Fermer les boîtes de dialogue / volets' },
      ],
    },
  ]

  return (
    <footer className="flex h-8 w-full items-center justify-between border-t border-border bg-card/60 px-4 text-[11px] text-muted-foreground shrink-0 backdrop-blur-sm select-none">
      {/* SECTION GAUCHE : État contextuel */}
      <div className="flex items-center gap-3 overflow-hidden">
        {activeTab === DASHBOARD_TAB && (
          <div className="flex items-center gap-1.5 font-medium text-foreground/80">
            <LayoutDashboard className="h-3.5 w-3.5 text-primary/80" />
            <span>{t('footer.dashboard')}</span>
            <span className="text-[10px] text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded-full font-normal">
              {totalRepos > 1
                ? t('footer.totalRepos_plural', { count: totalRepos })
                : t('footer.totalRepos', { count: totalRepos })}
            </span>
          </div>
        )}

        {activeTab === PULL_REQUESTS_TAB && (
          <div className="flex items-center gap-1.5 font-medium text-foreground/80">
            <Rocket className="h-3.5 w-3.5 text-indigo-500" />
            <span>{t('footer.launchpad')}</span>
          </div>
        )}

        {activeTab === REWARDS_TAB && (
          <div className="flex items-center gap-1.5 font-medium text-foreground/80">
            <Trophy className="h-3.5 w-3.5 text-amber-500 animate-pulse" />
            <span>Succès & Récompenses</span>
          </div>
        )}

        {isRepoTab && (
          <div className="flex items-center gap-3 overflow-hidden text-ellipsis whitespace-nowrap">
            {/* Nom & chemin du Repo */}
            <button
              onClick={handleCopyPath}
              className="flex items-center gap-1.5 font-medium text-foreground/90 hover:text-primary transition-colors cursor-pointer group shrink-0"
              title="Cliquer pour copier le chemin absolu"
            >
              <Terminal className="h-3.5 w-3.5 text-primary/70" />
              <span>{currentRepo?.name || activeTab.split('/').pop()}</span>
              {copied ? (
                <span className="flex items-center gap-1 text-[10px] text-emerald-500 font-normal bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 animate-fade-in shrink-0">
                  <ClipboardCheck className="h-2.5 w-2.5" />
                  {t('footer.copiedPath')}
                </span>
              ) : (
                <ClipboardCopy className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 text-muted-foreground/60 transition-opacity shrink-0" />
              )}
            </button>

            <span className="text-border">|</span>

            {/* Branche Git Actuelle */}
            <div className="flex items-center gap-1 text-foreground/75 font-mono">
              <GitBranch className="h-3.5 w-3.5 text-emerald-500/80" />
              <span className="font-semibold">{currentRepo?.head || '...'}</span>
            </div>

            {currentRepo && (
              <>
                <span className="text-border">|</span>

                {/* Statut Dirty/Clean */}
                <div className="flex items-center gap-1">
                  {currentRepo.isDirty ? (
                    <span className="flex items-center gap-1 text-amber-500/90 font-medium">
                      <AlertCircle className="h-3.5 w-3.5 animate-pulse" />
                      {t('footer.dirty')}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-emerald-500/90 font-medium">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {t('footer.clean')}
                    </span>
                  )}
                </div>

                {currentRepo.remotes.length > 0 && (
                  <>
                    <span className="text-border">|</span>
                    {/* Remotes */}
                    <div className="hidden sm:flex items-center gap-1">
                      <span className="text-muted-foreground/60">{t('footer.remotes')}:</span>
                      <span className="font-mono text-foreground/70">{currentRepo.remotes.join(', ')}</span>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* SECTION CENTRALE : Raccourcis Clavier Dialog */}
      <div>
        <Dialog open={isShortcutOpen} onOpenChange={setIsShortcutOpen}>
          <DialogTrigger asChild>
            <button className="flex items-center gap-1.5 rounded px-2 py-0.5 hover:bg-accent hover:text-foreground transition-all duration-150 active:scale-95 font-medium border border-transparent hover:border-border shadow-none">
              <Keyboard className="h-3.5 w-3.5" />
              <span>{t('footer.keyboardShortcuts')}</span>
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-md bg-background/95 backdrop-blur border border-border shadow-2xl rounded-xl">
            <DialogHeader className="border-b border-border pb-3">
              <DialogTitle className="flex items-center gap-2 text-sm font-semibold tracking-wide">
                <Keyboard className="h-4 w-4 text-primary" />
                {t('footer.keyboardShortcuts')}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-1">
                Raccourcis clavier globaux pour naviguer plus rapidement.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {shortcuts.map((cat, idx) => (
                <div key={idx} className="space-y-1.5">
                  <h4 className="text-[10px] font-bold text-primary/70 uppercase tracking-widest pl-1">
                    {cat.category}
                  </h4>
                  <div className="divide-y divide-border/40 rounded-lg border border-border bg-card/40 p-1">
                    {cat.items.map((item, keyIdx) => (
                      <div
                        key={keyIdx}
                        className="flex items-center justify-between px-2.5 py-1.5 text-xs hover:bg-muted/30 transition-colors rounded"
                      >
                        <span className="text-foreground/80 font-sans">{item.desc}</span>
                        <div className="flex items-center gap-1">
                          {item.keys.map((k, kIdx) => (
                            <span key={kIdx} className="flex items-center gap-1">
                              <kbd className="inline-flex h-5 items-center justify-center rounded border border-border bg-muted/95 px-1.5 font-mono text-[10px] font-bold text-foreground shadow-sm min-w-[20px]">
                                {k}
                              </kbd>
                              {kIdx < item.keys.length - 1 && (
                                <span className="text-[9px] text-muted-foreground/60 font-semibold">+</span>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* SECTION DROITE : Connexion GitHub & Version */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Game/Rewards Status Link */}
        {rewardsEnabled && (
          <>
            <button
              onClick={() => setActiveTab(REWARDS_TAB)}
              className={`flex items-center gap-1.5 rounded px-2 py-0.5 border border-transparent hover:border-border hover:bg-accent transition-all duration-150 cursor-pointer ${
                activeTab === REWARDS_TAB
                  ? 'text-primary font-bold bg-accent/40 border-border'
                  : 'text-amber-500 hover:text-amber-600 font-semibold'
              }`}
              title="Consulter vos succès et récompenses Git"
            >
              <Trophy className={`h-3.5 w-3.5 ${activeTab === REWARDS_TAB ? '' : 'animate-pulse'}`} />
              <span>Niv. {level}</span>
            </button>
            <span className="text-border">|</span>
          </>
        )}

        {/* GitHub Account Link */}
        <button
          onClick={() => onOpenSettings('integrations')}
          className="flex items-center gap-1.5 rounded px-2 py-0.5 hover:bg-accent hover:text-foreground border border-transparent hover:border-border transition-all duration-150 cursor-pointer"
        >
          {activeAccount ? (
            <>
              {activeAccount.user.avatarUrl ? (
                <img
                  src={activeAccount.user.avatarUrl}
                  alt={activeAccount.user.login}
                  className="h-3.5 w-3.5 rounded-full border border-border/80 object-cover"
                />
              ) : (
                <Github className="h-3.5 w-3.5 text-foreground/80" />
              )}
              <span className="hidden sm:inline font-medium text-foreground/80">
                {activeAccount.user.name || activeAccount.user.login}
              </span>
            </>
          ) : (
            <>
              <Github className="h-3.5 w-3.5 text-muted-foreground/60" />
              <span className="hidden sm:inline text-muted-foreground/60">
                {t('footer.notConnected')}
              </span>
            </>
          )}
        </button>

        <span className="text-border">|</span>

        {/* Version App */}
        <div className="flex items-center gap-1 bg-muted/80 border border-border/50 text-[10px] font-semibold text-foreground/75 px-2 py-0.5 rounded-full font-mono shadow-sm">
          <span>{t('footer.version', { version: appVersion })}</span>
        </div>
      </div>
    </footer>
  )
}
