import { useState, useMemo, useEffect } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { apiGetAppVersion } from '../../api/updater.api'
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
  Terminal,
  ClipboardCopy,
  ClipboardCheck,
  Trophy,
  Search,
  Activity,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Input,
  ScrollArea,
  Kbd,
  Tag,
  Card,
  Tooltip,
} from '@git-manager/ui'
import type { Section } from '../../app/settings/SettingsPage'

interface FooterProps {
  onOpenSettings: (section?: Section) => void
  onOpenActivityLogs: () => void
}

export function Footer({ onOpenSettings, onOpenActivityLogs }: FooterProps) {
  const { t } = useTranslation('common')
  const { repoCache, savedRepos, discoveredRepos } = useRepoDataStore()
  const { activeTab, setActiveTab } = useRepoUIStore()
  const { settings } = useSettingsStore()
  const { points, rewardsEnabled } = useGameStore()
  const { level } = getLevelInfo(points)

  const [copied, setCopied] = useState(false)
  const [isShortcutOpen, setIsShortcutOpen] = useState(false)
  const [shortcutQuery, setShortcutQuery] = useState('')
  const [appVersion, setAppVersion] = useState<string | null>(null)

  useEffect(() => {
    apiGetAppVersion()
      .then(setAppVersion)
      .catch(() => {
        // Not running inside Tauri (e.g. component preview) — leave version unset.
      })
  }, [])

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

  // Raccourcis clavier pour l'affichage — doit rester en phase avec useKeyboardShortcuts.ts
  // et les raccourcis locaux au panneau de recherche de commits (CommitSearchPanel.tsx).
  const shortcuts = [
    {
      category: 'Général',
      items: [
        { keys: ['⌘', 'K'], desc: 'Ouvrir la palette de commandes' },
        { keys: ['⌘', 'P'], desc: 'Rechercher un fichier dans le dépôt' },
        { keys: ['⌘', ','], desc: 'Ouvrir les Paramètres' },
        { keys: ['Alt', 'W'], desc: "Fermer l'onglet du dépôt actif" },
        { keys: ['Esc'], desc: 'Fermer les boîtes de dialogue / volets' },
      ],
    },
    {
      category: 'Navigation',
      items: [
        { keys: ['Alt', '1'], desc: "Aller à l'accueil (Dashboard)" },
        { keys: ['Alt', '2'], desc: 'Aller au Launchpad (Pull Requests)' },
        { keys: ['Alt', '3-9'], desc: 'Basculer vers les dépôts ouverts (onglets 3 à 9)' },
      ],
    },
    {
      category: 'Recherche',
      items: [
        { keys: ['⌘', 'F'], desc: 'Rechercher un commit dans le graphe' },
        { keys: ['↵'], desc: 'Résultat suivant (recherche de commit)' },
        { keys: ['⇧', '↵'], desc: 'Résultat précédent (recherche de commit)' },
        { keys: ['Alt', '⌘', 'F'], desc: 'Filtrer les branches/tags du panneau latéral' },
      ],
    },
    {
      category: 'Dépôt & Git',
      items: [
        { keys: ['⌘', 'Z'], desc: 'Annuler la dernière action Git' },
        { keys: ['⌘', '⇧', 'Z'], desc: 'Rétablir la dernière action Git' },
      ],
    },
  ]

  const shortcutQueryLower = shortcutQuery.trim().toLowerCase()
  const filteredShortcuts = shortcutQueryLower
    ? shortcuts
        .map((cat) => ({
          ...cat,
          items: cat.items.filter(
            (item) =>
              item.desc.toLowerCase().includes(shortcutQueryLower) ||
              item.keys.some((k) => k.toLowerCase().includes(shortcutQueryLower))
          ),
        }))
        .filter((cat) => cat.items.length > 0)
    : shortcuts

  return (
    <footer className="chrome-surface flex h-8 w-full shrink-0 select-none items-center justify-between border-t border-border bg-sidebar px-4 text-[11px] text-muted-foreground">
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
              title={t('footer.copyAbsolutePath')}
            >
              <Terminal className="h-3.5 w-3.5 text-primary/70" />
              <span>{currentRepo?.name || activeTab.split('/').pop()}</span>
              {copied ? (
                <Tag tone="success" className="animate-fade-in shrink-0 font-normal">
                  <ClipboardCheck className="h-2.5 w-2.5" />
                  {t('footer.copiedPath')}
                </Tag>
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

            {currentRepo && currentRepo.remotes.length > 0 && (
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
          </div>
        )}
      </div>

      {/* SECTION CENTRALE : Activity Logs + Raccourcis Clavier (icônes seules, tooltip au hover) */}
      <div className="flex items-center gap-1">
        <Tooltip content={t('footer.activityLogs')}>
          <button
            onClick={onOpenActivityLogs}
            aria-label={t('footer.activityLogs')}
            data-testid="footer-activity-logs-button"
            className="flex items-center justify-center rounded border border-transparent p-1 shadow-none transition-all duration-150 hover:border-border hover:bg-accent hover:text-foreground active:scale-95"
          >
            <Activity className="h-3.5 w-3.5" />
          </button>
        </Tooltip>
        <Tooltip content={t('footer.keyboardShortcuts')}>
          <button
            onClick={() => setIsShortcutOpen(true)}
            aria-label={t('footer.keyboardShortcuts')}
            data-testid="footer-shortcuts-button"
            className="flex items-center justify-center rounded border border-transparent p-1 shadow-none transition-all duration-150 hover:border-border hover:bg-accent hover:text-foreground active:scale-95"
          >
            <Keyboard className="h-3.5 w-3.5" />
          </button>
        </Tooltip>
        <Dialog
          open={isShortcutOpen}
          onOpenChange={(open) => {
            setIsShortcutOpen(open)
            if (!open) setShortcutQuery('')
          }}
        >
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

            <div className="relative shrink-0">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
              <Input
                value={shortcutQuery}
                onChange={(e) => setShortcutQuery(e.target.value)}
                placeholder="Rechercher un raccourci…"
                aria-label={t('footer.searchShortcut')}
                data-testid="shortcuts-search-input"
                className="h-8 pl-8 text-xs"
              />
            </div>

            <ScrollArea className="-mr-3 max-h-[50vh] pr-3">
              <div className="space-y-4 py-2">
                {filteredShortcuts.length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">
                    Aucun raccourci ne correspond à « {shortcutQuery} ».
                  </p>
                ) : (
                  filteredShortcuts.map((cat, idx) => (
                    <div key={idx} className="space-y-1.5">
                      <h4 className="pl-1 text-[10px] font-bold uppercase tracking-widest text-primary/70">
                        {cat.category}
                      </h4>
                      <Card className="divide-y divide-border/40 bg-card/40 p-1">
                        {cat.items.map((item, keyIdx) => (
                          <div
                            key={keyIdx}
                            className="flex items-center justify-between rounded px-2.5 py-1.5 text-xs transition-colors hover:bg-muted/30"
                          >
                            <span className="font-sans text-foreground/80">{item.desc}</span>
                            <div className="flex items-center gap-1">
                              {item.keys.map((k, kIdx) => (
                                <span key={kIdx} className="flex items-center gap-1">
                                  <Kbd>{k}</Kbd>
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
                      </Card>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
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
              className={`flex cursor-pointer items-center gap-1.5 rounded border px-2 py-0.5 transition-all duration-150 ${
                activeTab === REWARDS_TAB
                  ? // Light-violet pill + near-black label (button component tokens): the old
                    // text-primary violet sat at ~4.4:1 on the dark chrome footer (below AA).
                    'border-button bg-button font-bold text-button-foreground shadow-sm'
                  : 'border-transparent font-semibold text-amber-500 hover:border-border hover:bg-accent hover:text-amber-600'
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

        {/* Version App — click opens the in-app changelog */}
        {appVersion && (
          <button
            onClick={() => onOpenSettings('changelog')}
            title={t('footer.viewChangelog')}
            data-testid="footer-version-button"
            className="flex cursor-pointer items-center gap-1 rounded-full border border-border/50 bg-muted/80 px-2 py-0.5 font-mono text-[10px] font-semibold text-foreground/75 shadow-sm transition-colors hover:border-primary/50 hover:text-primary"
          >
            <span>{t('footer.version', { version: appVersion })}</span>
          </button>
        )}
      </div>
    </footer>
  )
}
