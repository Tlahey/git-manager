import { useState, useMemo } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { useRepoDataStore } from '../../stores/repoData.store'
import {
  useRepoUIStore,
  DASHBOARD_TAB,
  REWARDS_TAB,
  PULL_REQUESTS_TAB,
} from '../../stores/repoUI.store'
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
import type { Section } from '../../app/settings/SettingsPage'

interface FooterProps {
  onOpenSettings: (section?: Section) => void
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
  const isRepoTab =
    activeTab !== DASHBOARD_TAB && activeTab !== PULL_REQUESTS_TAB && activeTab !== REWARDS_TAB
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
        { keys: ['Alt', '1'], desc: "Aller à l'accueil (Dashboard)" },
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
        { keys: ['Alt', 'W'], desc: "Fermer l'onglet du dépôt actif" },
        { keys: ['Esc'], desc: 'Fermer les boîtes de dialogue / volets' },
      ],
    },
  ]

  return (
    <footer className="flex h-8 w-full shrink-0 select-none items-center justify-between border-t border-border bg-card/60 px-4 text-[11px] text-muted-foreground backdrop-blur-sm">
      {/* SECTION GAUCHE : État contextuel */}
      <div className="flex items-center gap-3 overflow-hidden">
        {activeTab === DASHBOARD_TAB && (
          <div className="flex items-center gap-1.5 font-medium text-foreground/80">
            <LayoutDashboard className="h-3.5 w-3.5 text-primary/80" />
            <span>{t('footer.dashboard')}</span>
            <span className="rounded-full bg-muted/60 px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
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
            <Trophy className="h-3.5 w-3.5 animate-pulse text-amber-500" />
            <span>Succès & Récompenses</span>
          </div>
        )}

        {isRepoTab && (
          <div className="flex items-center gap-3 overflow-hidden text-ellipsis whitespace-nowrap">
            {/* Nom & chemin du Repo */}
            <button
              onClick={handleCopyPath}
              className="group flex shrink-0 cursor-pointer items-center gap-1.5 font-medium text-foreground/90 transition-colors hover:text-primary"
              title="Cliquer pour copier le chemin absolu"
            >
              <Terminal className="h-3.5 w-3.5 text-primary/70" />
              <span>{currentRepo?.name || activeTab.split('/').pop()}</span>
              {copied ? (
                <span className="animate-fade-in flex shrink-0 items-center gap-1 rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-normal text-emerald-500">
                  <ClipboardCheck className="h-2.5 w-2.5" />
                  {t('footer.copiedPath')}
                </span>
              ) : (
                <ClipboardCopy className="h-2.5 w-2.5 shrink-0 text-muted-foreground/60 opacity-0 transition-opacity group-hover:opacity-100" />
              )}
            </button>

            <span className="text-border">|</span>

            {/* Branche Git Actuelle */}
            <div className="flex items-center gap-1 font-mono text-foreground/75">
              <GitBranch className="h-3.5 w-3.5 text-emerald-500/80" />
              <span className="font-semibold">{currentRepo?.head || '...'}</span>
            </div>

            {currentRepo && (
              <>
                <span className="text-border">|</span>

                {/* Statut Dirty/Clean */}
                <div className="flex items-center gap-1">
                  {currentRepo.isDirty ? (
                    <span className="flex items-center gap-1 font-medium text-amber-500/90">
                      <AlertCircle className="h-3.5 w-3.5 animate-pulse" />
                      {t('footer.dirty')}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 font-medium text-emerald-500/90">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {t('footer.clean')}
                    </span>
                  )}
                </div>

                {currentRepo.remotes.length > 0 && (
                  <>
                    <span className="text-border">|</span>
                    {/* Remotes */}
                    <div className="hidden items-center gap-1 sm:flex">
                      <span className="text-muted-foreground/60">{t('footer.remotes')}:</span>
                      <span className="font-mono text-foreground/70">
                        {currentRepo.remotes.join(', ')}
                      </span>
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
            <button className="flex items-center gap-1.5 rounded border border-transparent px-2 py-0.5 font-medium shadow-none transition-all duration-150 hover:border-border hover:bg-accent hover:text-foreground active:scale-95">
              <Keyboard className="h-3.5 w-3.5" />
              <span>{t('footer.keyboardShortcuts')}</span>
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-md rounded-xl border border-border bg-background/95 shadow-2xl backdrop-blur">
            <DialogHeader className="border-b border-border pb-3">
              <DialogTitle className="flex items-center gap-2 text-sm font-semibold tracking-wide">
                <Keyboard className="h-4 w-4 text-primary" />
                {t('footer.keyboardShortcuts')}
              </DialogTitle>
              <DialogDescription className="mt-1 text-xs text-muted-foreground">
                Raccourcis clavier globaux pour naviguer plus rapidement.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {shortcuts.map((cat, idx) => (
                <div key={idx} className="space-y-1.5">
                  <h4 className="pl-1 text-[10px] font-bold uppercase tracking-widest text-primary/70">
                    {cat.category}
                  </h4>
                  <div className="divide-y divide-border/40 rounded-lg border border-border bg-card/40 p-1">
                    {cat.items.map((item, keyIdx) => (
                      <div
                        key={keyIdx}
                        className="flex items-center justify-between rounded px-2.5 py-1.5 text-xs transition-colors hover:bg-muted/30"
                      >
                        <span className="font-sans text-foreground/80">{item.desc}</span>
                        <div className="flex items-center gap-1">
                          {item.keys.map((k, kIdx) => (
                            <span key={kIdx} className="flex items-center gap-1">
                              <kbd className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-border bg-muted/95 px-1.5 font-mono text-[10px] font-bold text-foreground shadow-sm">
                                {k}
                              </kbd>
                              {kIdx < item.keys.length - 1 && (
                                <span className="text-[9px] font-semibold text-muted-foreground/60">
                                  +
                                </span>
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
      <div className="flex shrink-0 items-center gap-3">
        {/* Game/Rewards Status Link */}
        {rewardsEnabled && (
          <>
            <button
              onClick={() => setActiveTab(REWARDS_TAB)}
              className={`flex cursor-pointer items-center gap-1.5 rounded border border-transparent px-2 py-0.5 transition-all duration-150 hover:border-border hover:bg-accent ${
                activeTab === REWARDS_TAB
                  ? 'border-border bg-accent/40 font-bold text-primary'
                  : 'font-semibold text-amber-500 hover:text-amber-600'
              }`}
              title="Consulter vos succès et récompenses Git"
            >
              <Trophy
                className={`h-3.5 w-3.5 ${activeTab === REWARDS_TAB ? '' : 'animate-pulse'}`}
              />
              <span>Niv. {level}</span>
            </button>
            <span className="text-border">|</span>
          </>
        )}

        {/* GitHub Account Link */}
        <button
          onClick={() => onOpenSettings('integrations')}
          className="flex cursor-pointer items-center gap-1.5 rounded border border-transparent px-2 py-0.5 transition-all duration-150 hover:border-border hover:bg-accent hover:text-foreground"
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
              <span className="hidden font-medium text-foreground/80 sm:inline">
                {activeAccount.user.name || activeAccount.user.login}
              </span>
            </>
          ) : (
            <>
              <Github className="h-3.5 w-3.5 text-muted-foreground/60" />
              <span className="hidden text-muted-foreground/60 sm:inline">
                {t('footer.notConnected')}
              </span>
            </>
          )}
        </button>

        <span className="text-border">|</span>

        {/* Version App */}
        <div className="flex items-center gap-1 rounded-full border border-border/50 bg-muted/80 px-2 py-0.5 font-mono text-[10px] font-semibold text-foreground/75 shadow-sm">
          <span>{t('footer.version', { version: appVersion })}</span>
        </div>
      </div>
    </footer>
  )
}
