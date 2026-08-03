import { useState, useMemo, useEffect } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { apiGetAppVersion } from '../../api/updater.api'
import { useRepoDataStore } from '../../stores/repoData.store'
import {
  useRepoUIStore,
  isSpecialTab,
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
  GraduationCap,
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
import { AiStatusIndicator } from './AiStatusIndicator'
import { DebugMenu } from './DebugMenu'
import { openActionJournalWindow } from '../../lib/actionJournalWindow'

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

  // Total number of distinct known repositories
  const totalRepos = useMemo(() => {
    const uniquePaths = new Set([
      ...savedRepos.map((r) => r.path),
      ...(discoveredRepos || []).map((r) => r.path),
    ])
    return uniquePaths.size
  }, [savedRepos, discoveredRepos])

  // Current repository, when the active tab is a repo tab
  const isRepoTab = !isSpecialTab(activeTab)
  const currentRepo = isRepoTab ? repoCache[activeTab] : null

  // Connected GitHub account
  const github = settings.github || { accounts: [], activeAccountId: null }
  const activeAccount = github.accounts.find((a) => a.id === github.activeAccountId) || null

  // Copies the repository path to the clipboard
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

  // Keyboard shortcuts, for display only — must stay in sync with useKeyboardShortcuts.ts and
  // with the shortcuts local to the commit search panel (CommitSearchPanel.tsx).
  const shortcuts = [
    {
      category: t('footer.shortcutsCategoryGeneral'),
      items: [
        { keys: ['⌘', 'K'], desc: t('footer.shortcut.commandPalette') },
        { keys: ['⌘', 'P'], desc: t('footer.shortcut.findFile') },
        { keys: ['⌘', ','], desc: t('footer.shortcut.openSettings') },
        { keys: ['⌘', 'T'], desc: t('footer.shortcut.newTab') },
        { keys: ['Alt', 'W'], desc: t('footer.shortcut.closeTab') },
        { keys: ['Esc'], desc: t('footer.shortcut.closeDialogs') },
      ],
    },
    {
      category: t('footer.shortcutsCategoryNavigation'),
      items: [
        { keys: ['Alt', '1'], desc: t('footer.shortcut.goHome') },
        { keys: ['Alt', '2'], desc: t('footer.shortcut.goLaunchpad') },
        { keys: ['Alt', '3-9'], desc: t('footer.shortcut.switchRepoTabs') },
      ],
    },
    {
      category: t('footer.shortcutsCategorySearch'),
      items: [
        { keys: ['⌘', 'F'], desc: t('footer.shortcut.findCommit') },
        { keys: ['↵'], desc: t('footer.shortcut.nextResult') },
        { keys: ['⇧', '↵'], desc: t('footer.shortcut.prevResult') },
        { keys: ['Alt', '⌘', 'F'], desc: t('footer.shortcut.filterSidebar') },
      ],
    },
    {
      category: t('footer.shortcutsCategoryRepoGit'),
      items: [
        { keys: ['⌘', 'Z'], desc: t('footer.shortcut.undoGitAction') },
        { keys: ['⌘', '⇧', 'Z'], desc: t('footer.shortcut.redoGitAction') },
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
    <footer
      data-testid="app-footer"
      className="chrome-surface flex h-8 w-full shrink-0 select-none items-center justify-between border-t border-border bg-sidebar px-4 text-[11px] text-muted-foreground"
    >
      {/* LEFT SECTION: contextual state */}
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
            <span>{t('settings:settings.sections.rewards')}</span>
          </div>
        )}

        {isRepoTab && (
          <div className="flex items-center gap-3 overflow-hidden text-ellipsis whitespace-nowrap">
            {/* Repository name & path */}
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

            {/* Current git branch */}
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

      {/* CENTER SECTION: behind the scenes + activity logs + keyboard shortcuts (icon-only,
          tooltip on hover) */}
      <div className="flex items-center gap-1">
        {/* Every "make the app do X" trigger, in one menu. `import.meta.env.DEV` is a build-time
            constant, so this branch — and the fixtures `DebugMenu` pulls in — is dead-code-
            eliminated from a production bundle rather than merely hidden. */}
        {import.meta.env.DEV && <DebugMenu />}
        {/* Next to the Activity Logs button, and deliberately not merged into it: that view is an IPC
            trace for debugging, this one is a lesson about git. Same source, opposite audiences. */}
        <Tooltip content={t('footer.actionJournal')}>
          <button
            onClick={() => void openActionJournalWindow()}
            aria-label={t('footer.actionJournal')}
            data-testid="footer-action-journal-button"
            className="flex cursor-pointer items-center justify-center rounded border border-transparent p-1 shadow-none transition-all duration-150 hover:border-border hover:bg-accent hover:text-foreground active:scale-95"
          >
            <GraduationCap className="h-3.5 w-3.5" />
          </button>
        </Tooltip>
        <Tooltip content={t('footer.activityLogs')}>
          <button
            onClick={onOpenActivityLogs}
            aria-label={t('footer.activityLogs')}
            data-testid="footer-activity-logs-button"
            className="flex cursor-pointer items-center justify-center rounded border border-transparent p-1 shadow-none transition-all duration-150 hover:border-border hover:bg-accent hover:text-foreground active:scale-95"
          >
            <Activity className="h-3.5 w-3.5" />
          </button>
        </Tooltip>
        <Tooltip content={t('footer.keyboardShortcuts')}>
          <button
            onClick={() => setIsShortcutOpen(true)}
            aria-label={t('footer.keyboardShortcuts')}
            data-testid="footer-shortcuts-button"
            className="flex cursor-pointer items-center justify-center rounded border border-transparent p-1 shadow-none transition-all duration-150 hover:border-border hover:bg-accent hover:text-foreground active:scale-95"
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
                {t('footer.shortcutsDescription')}
              </DialogDescription>
            </DialogHeader>

            <div className="relative shrink-0">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
              <Input
                value={shortcutQuery}
                onChange={(e) => setShortcutQuery(e.target.value)}
                placeholder={t('footer.searchShortcut')}
                aria-label={t('footer.searchShortcut')}
                data-testid="shortcuts-search-input"
                className="h-8 pl-8 text-xs"
              />
            </div>

            <ScrollArea className="-mr-3 max-h-[50vh] pr-3">
              <div className="space-y-4 py-2">
                {filteredShortcuts.length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">
                    {t('footer.noShortcutsMatch', { query: shortcutQuery })}
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

      {/* RIGHT SECTION: AI status, GitHub account & version */}
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
              title={t('footer.rewardsTooltip')}
            >
              <Trophy
                className={`h-3.5 w-3.5 ${activeTab === REWARDS_TAB ? '' : 'animate-pulse'}`}
              />
              <span>{t('footer.level', { level })}</span>
            </button>
            <span className="text-border">|</span>
          </>
        )}

        {/* AI provider status — hidden entirely when AI features are off */}
        <AiStatusIndicator onOpenSettings={() => onOpenSettings('local_ai')} />

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

        {/* App version — click opens the in-app changelog */}
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
