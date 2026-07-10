import { useEffect, useState } from 'react'
import { useNotificationStore, type AppNotification } from '../../stores/notification.store'
import { useRepoUIStore, PULL_REQUESTS_TAB } from '../../stores/repoUI.store'
import { useLaunchpadStore } from '../../stores/launchpad.store'
import { useSettingsStore } from '../../stores/settings.store'
import { useTranslation } from '@git-manager/i18n'
import { Bell, CheckCheck, Trash2, Play, Sparkles } from 'lucide-react'
import { getNotificationIcon, getNotificationText } from './utils'
import { showNativeNotification } from '../../hooks/useNotificationWatcher'
import { Popover, PopoverTrigger, PopoverContent } from '@git-manager/ui'
import type { TFunction } from '@git-manager/i18n'

function formatRelativeTime(timestamp: number, t: TFunction): string {
  const diff = Date.now() - timestamp
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return t('time.justNow')

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return t('time.minutesAgo', { count: minutes })

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('time.hoursAgo', { count: hours })

  const days = Math.floor(hours / 24)
  return t('time.daysAgo', { count: days })
}

export function NotificationDropdown() {
  const { t } = useTranslation('common')
  const {
    notifications,
    markAsRead,
    markAllAsRead,
    clearNotifications,
    mockPRs,
    simulateChange,
  } = useNotificationStore()

  const { setActiveTab: setMainActiveTab } = useRepoUIStore()
  const { setActiveTab: setLaunchpadActiveTab } = useLaunchpadStore()
  const githubSettings = useSettingsStore((s) => s.settings.github)
  
  const activeAccount =
    githubSettings?.accounts?.find((a) => a.id === githubSettings.activeAccountId) ?? null
  const hasToken = !!activeAccount?.token

  // Simulator states
  const [simPrId, setSimPrId] = useState('')
  const [simAction, setSimAction] = useState<'merge' | 'close' | 'request_review' | 'approve' | 'new_pr' | 'ci_success' | 'ci_failed'>('merge')

  const [menuOpen, setMenuOpen] = useState(false)

  // Initialize simulator PR selection
  useEffect(() => {
    if (mockPRs.length > 0 && !simPrId) {
      setSimPrId(mockPRs[0].id)
    }
  }, [mockPRs, simPrId])

  const unreadCount = notifications.filter((n) => !n.read).length
  const recentNotifications = notifications.slice(0, 5)

  function handleNotificationClick(notif: AppNotification) {
    markAsRead(notif.id)
    setMainActiveTab(PULL_REQUESTS_TAB)
    setLaunchpadActiveTab(notif.targetTab)
    setMenuOpen(false)
  }

  function runSimulation() {
    simulateChange(simPrId, simAction)
  }

  return (
    <Popover open={menuOpen} onOpenChange={setMenuOpen}>
      <PopoverTrigger asChild>
        <button
          className={`relative flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground ${
            menuOpen ? 'bg-accent text-foreground' : ''
          }`}
          title={t('notifications.title')}
        >
          <Bell className="h-3.5 w-3.5" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-[8px] font-bold text-primary-foreground ring-2 ring-card animate-pulse">
              {unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="z-[99] flex w-80 flex-col rounded-lg border border-border bg-popover text-popover-foreground shadow-2xl backdrop-blur-sm"
      >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-foreground">{t('notifications.title')}</span>
                {unreadCount > 0 && (
                  <span className="rounded-full bg-primary/10 px-1.5 py-0.2 text-[9px] font-medium text-primary">
                    {unreadCount} new
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {notifications.length > 0 && (
                  <>
                    <button
                      onClick={markAllAsRead}
                      className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                      title={t('notifications.markAllAsRead')}
                    >
                      <CheckCheck className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={clearNotifications}
                      className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-destructive transition-colors"
                      title={t('notifications.clearAll')}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Notifications List */}
            <div className="max-h-[280px] overflow-y-auto min-h-[100px]">
              {recentNotifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center px-4">
                  <Bell className="h-7 w-7 text-muted-foreground/30 mb-2 stroke-[1.5]" />
                  <p className="text-[11px] text-muted-foreground">{t('notifications.empty')}</p>
                </div>
              ) : (
                <div className="divide-y divide-border/40">
                  {recentNotifications.map((notif) => {
                    const { title, message } = getNotificationText(notif, t)
                    return (
                      <button
                        key={notif.id}
                        onClick={() => handleNotificationClick(notif)}
                        className={`flex w-full items-start gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-accent/40 ${
                          !notif.read ? 'bg-primary/5' : ''
                        }`}
                      >
                        <div className="mt-0.5 shrink-0">{getNotificationIcon(notif.type)}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[11px] font-semibold text-foreground truncate">
                              {title}
                            </span>
                            <span className="text-[9px] text-muted-foreground/60 shrink-0 font-sans">
                              {formatRelativeTime(notif.createdAt, t)}
                            </span>
                          </div>
                          <p className="mt-0.5 text-[10px] text-muted-foreground leading-snug line-clamp-2 break-words font-sans">
                            {message}
                          </p>
                        </div>
                        {!notif.read && (
                          <div className="ml-1 mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Simulated actions panel (only when no github token) */}
            {(import.meta.env.DEV || !hasToken) && (
              <div className="border-t border-border bg-accent/20 p-2.5">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-1 text-[10px] font-semibold text-amber-500/80">
                    <Sparkles className="h-3 w-3" />
                    <span>{t('notifications.simulator')}</span>
                  </div>
                  {import.meta.env.DEV && (
                    <span className="rounded bg-primary/10 px-1 py-0.2 text-[8px] font-bold text-primary tracking-wide">
                      DEV MODE
                    </span>
                  )}
                </div>
                
                <div className="flex flex-col gap-1.5">
                  {/* Test triggers visible only in development mode */}
                  {import.meta.env.DEV && (
                    <div className="grid grid-cols-2 gap-1.5 mb-1">
                      <button
                        onClick={() => {
                          const newNotif = useNotificationStore.getState().addNotification({
                            type: 'review_requested',
                            repo: 'git-manager',
                            prNumber: 247,
                            prTitle: 'feat: Add support for dev-mode test notifications',
                            prId: 'test-pr-review',
                            author: 'antoine',
                            url: 'https://github.com/Tlahey/git-manager/pull/247',
                            targetTab: 'waiting',
                          })
                          showNativeNotification(newNotif, t)
                        }}
                        className="flex items-center justify-center h-5.5 rounded border border-amber-500/20 bg-amber-500/5 text-amber-400 hover:bg-amber-500/10 text-[8px] font-semibold transition-colors"
                      >
                        Test Review
                      </button>
                      <button
                        onClick={() => {
                          const newNotif = useNotificationStore.getState().addNotification({
                            type: 'pr_merged',
                            repo: 'git-manager',
                            prNumber: 244,
                            prTitle: 'fix: Memory leak in GraphRow',
                            prId: 'test-pr-merge',
                            author: 'marie',
                            url: 'https://github.com/Tlahey/git-manager/pull/244',
                            targetTab: 'prs',
                          })
                          showNativeNotification(newNotif, t)
                        }}
                        className="flex items-center justify-center h-5.5 rounded border border-purple-500/20 bg-purple-500/5 text-purple-400 hover:bg-purple-500/10 text-[8px] font-semibold transition-colors"
                      >
                        Test Merge
                      </button>
                      <button
                        onClick={() => {
                          const newNotif = useNotificationStore.getState().addNotification({
                            type: 'ci_success',
                            repo: 'git-manager',
                            prNumber: 250,
                            prTitle: 'ci: Add automatic lint and code style check',
                            prId: 'test-pr-ci-green',
                            author: 'github-actions',
                            url: 'https://github.com/Tlahey/git-manager/pull/250',
                            targetTab: 'prs',
                          })
                          showNativeNotification(newNotif, t)
                        }}
                        className="flex items-center justify-center h-5.5 rounded border border-emerald-500/20 bg-emerald-500/5 text-emerald-400 hover:bg-emerald-500/10 text-[8px] font-semibold transition-colors"
                      >
                        Test CI Green
                      </button>
                      <button
                        onClick={() => {
                          const newNotif = useNotificationStore.getState().addNotification({
                            type: 'ci_failed',
                            repo: 'git-manager',
                            prNumber: 251,
                            prTitle: 'test: Add integration tests for Tauri bridge',
                            prId: 'test-pr-ci-red',
                            author: 'github-actions',
                            url: 'https://github.com/Tlahey/git-manager/pull/251',
                            targetTab: 'prs',
                          })
                          showNativeNotification(newNotif, t)
                        }}
                        className="flex items-center justify-center h-5.5 rounded border border-rose-500/20 bg-rose-500/5 text-rose-400 hover:bg-rose-500/10 text-[8px] font-semibold transition-colors"
                      >
                        Test CI Red
                      </button>
                    </div>
                  )}

                  {/* PR State Mutator (only if using mock data/no token) */}
                  {!hasToken && (
                    <>
                      <div className="flex items-center gap-2">
                        <select
                          value={simPrId}
                          onChange={(e) => setSimPrId(e.target.value)}
                          className="flex-1 h-6 rounded border border-border bg-background px-1.5 text-[9px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                          {mockPRs.map((pr) => (
                            <option key={pr.id} value={pr.id}>
                              PR #{pr.number} ({pr.repo})
                            </option>
                          ))}
                        </select>

                        <select
                          value={simAction}
                          onChange={(e) => setSimAction(e.target.value as Parameters<typeof simulateChange>[1])}
                          className="h-6 rounded border border-border bg-background px-1.5 text-[9px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                          <option value="merge">{t('notifications.sim.prMerged')}</option>
                          <option value="close">{t('notifications.sim.prClosed')}</option>
                          <option value="request_review">{t('notifications.sim.reviewRequested')}</option>
                          <option value="approve">{t('notifications.sim.reviewApproved')}</option>
                          <option value="new_pr">{t('notifications.sim.newPR')}</option>
                          <option value="ci_success">{t('notifications.sim.ciSuccess')}</option>
                          <option value="ci_failed">{t('notifications.sim.ciFailed')}</option>
                        </select>
                      </div>
                      <button
                        onClick={runSimulation}
                        className="flex items-center justify-center gap-1 h-6 rounded bg-primary text-primary-foreground font-medium text-[9px] transition-colors hover:bg-primary/95"
                      >
                        <Play className="h-2.5 w-2.5 fill-current" />
                        <span>Run Sim</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
      </PopoverContent>
    </Popover>
  )
}
