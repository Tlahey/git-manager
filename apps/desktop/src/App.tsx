import { useState, useEffect } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/queryClient'
import { DashboardPage } from './app/dashboard/DashboardPage'
import {
  useRepoUIStore,
  isNewTab,
  DASHBOARD_TAB,
  REWARDS_TAB,
  PULL_REQUESTS_TAB,
} from './stores/repoUI.store'
import { NewTabPage } from './app/new-tab/NewTabPage'
import { RewardsTab } from './app/pull-requests/components/RewardsTab'
import { RepoView } from './app/repo/RepoView'
import { PullRequestsPage } from './app/pull-requests/PullRequestsPage'
import {
  SettingsPage,
  type Section,
  type Scope as SettingsScope,
} from './app/settings/SettingsPage'
import { ActivityLogsPage } from './app/activity-logs/ActivityLogsPage'
import { TabBar } from './components/tab-bar'
import { useTheme } from './hooks/useTheme'
import { useMonacoTheme } from './hooks/useMonacoTheme'
import { useNotificationWatcher } from './hooks/useNotificationWatcher'
import { useNotchQueue } from './hooks/useNotchQueue'
import { useRewardNotch } from './hooks/useRewardNotch'
import { useNotchActionListener } from './hooks/useNotchActionListener'
import { useRemoteProgressListener } from './hooks/useRemoteProgressListener'
import { useHookProgressListener } from './hooks/useHookProgressListener'
import { NotchRemoteOperations } from './components/notch/NotchRemoteOperations'
import { NotchRunningHooks } from './components/notch/NotchRunningHooks'
import { NotchAiRuns } from './components/notch/NotchAiRuns'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useDevFixtureImport } from './hooks/useDevFixtureImport'
import { useAiStatusCheck } from './hooks/useAiStatusCheck'
import { useAutoFetch } from './hooks/useAutoFetch'
import { Footer } from './components/footer/Footer'
import { AiStatusBanner } from './components/layout/AiStatusBanner'

import { Toaster } from '@git-manager/ui'
import { CommandPalette } from './components/command-palette/CommandPalette'
import { OperationProgressBar } from './components/layout/OperationProgressBar'
import { LoadingOverlay } from './components/layout/LoadingOverlay'
import { E2ePathPickerDialog } from './components/E2ePathPickerDialog'
import { useAppReadySplash } from './hooks/useAppReadySplash'
import { appEventBus } from './lib/appEventBus'
import { useOperationProgressStore } from './stores/operationProgress.store'
import { useUndoHistoryStore } from './stores/undoHistory.store'
import { useAppUpdaterStore } from './stores/appUpdater.store'
import { listen } from '@tauri-apps/api/event'
import { mutate } from 'swr'

export default function App() {
  const activeTab = useRepoUIStore((s) => s.activeTab)
  const [showSettings, setShowSettings] = useState(false)
  const [settingsSection, setSettingsSection] = useState<Section>('general')
  const [settingsScope, setSettingsScope] = useState<SettingsScope>('general')
  const [showActivityLogs, setShowActivityLogs] = useState(false)

  useTheme()
  useMonacoTheme()
  useNotificationWatcher()
  // Turns the notch queue into a window. Separate from the watcher on purpose: the watcher decides
  // *what* to notify about, these two decide what happens to a card once it exists — which is what
  // lets a producer that has nothing to do with GitHub raise one.
  useNotchQueue()
  // An unlocked achievement, raised as a card like everything else. It used to be `<TrophyToast />`
  // a few lines below — a rectangle in the corner of this window, which only existed while the
  // window did and raised its own macOS banner behind the display setting's back.
  useRewardNotch()
  useNotchActionListener()
  useRemoteProgressListener()
  useHookProgressListener()
  useDevFixtureImport()
  useAppReadySplash()
  useAiStatusCheck()
  useAutoFetch()

  useKeyboardShortcuts({
    onOpenSettings: () => handleOpenSettings('general'),
    onCloseSettings: () => setShowSettings(false),
    showSettings,
  })

  // Firing open_app event on launch
  useEffect(() => {
    appEventBus.notify('open_app')
  }, [])

  // Load the running version and silently check for updates on launch. A found update flips the
  // updater footer's button (pinned in Settings) to its highlighted "available" state.
  useEffect(() => {
    const { loadVersion, checkForUpdate } = useAppUpdaterStore.getState()
    loadVersion()
    checkForUpdate({ silent: true })
  }, [])

  // Listen for conflict-resolved events from dedicated merge windows
  useEffect(() => {
    let unlisten: (() => void) | undefined
    const setupListener = async () => {
      unlisten = await listen<{ repoPath: string; filePath: string }>(
        'conflict-resolved',
        (event) => {
          const { repoPath } = event.payload
          queryClient.invalidateQueries({ queryKey: ['rebase-state', repoPath] })
          queryClient.invalidateQueries({ queryKey: ['git-status', repoPath] })
          queryClient.invalidateQueries({ queryKey: ['git-log', repoPath] })
          mutate(['conflicted-files', repoPath])
        }
      )
    }
    setupListener()
    return () => {
      if (unlisten) unlisten()
    }
  }, [])

  // Listen for fixup commits made from dedicated "Commit Changes" windows
  useEffect(() => {
    let unlisten: (() => void) | undefined
    const setupListener = async () => {
      unlisten = await listen<{ repoPath: string }>('fixup-committed', (event) => {
        const { repoPath } = event.payload
        queryClient.invalidateQueries({ queryKey: ['git-status', repoPath] })
        queryClient.invalidateQueries({ queryKey: ['git-log', repoPath] })
        queryClient.invalidateQueries({ queryKey: ['pending-fixups', repoPath] })
        // Fixup / rebasing commits are created in dedicated Tauri windows, each with its own
        // Zustand store instance. Their undo entry is persisted to localStorage but this window's
        // store was hydrated at startup and won't pick it up on its own — re-read it so the UNDO
        // button reflects the action just performed elsewhere.
        useUndoHistoryStore.persist.rehydrate()
      })
    }
    setupListener()
    return () => {
      if (unlisten) unlisten()
    }
  }, [])

  // Listen for rebase progress updates to drive the OperationProgressBar
  useEffect(() => {
    let unlisten: (() => void) | undefined
    const setupListener = async () => {
      unlisten = await listen<{ repoPath: string; phase: string }>('rebase-progress', (event) => {
        const { repoPath, phase } = event.payload
        const store = useOperationProgressStore.getState()
        if (phase === 'start') {
          store.start(repoPath, 'rebase')
        } else {
          store.clear(repoPath)
          queryClient.invalidateQueries({ queryKey: ['git-status', repoPath] })
          queryClient.invalidateQueries({ queryKey: ['git-log', repoPath] })
          queryClient.invalidateQueries({ queryKey: ['pending-fixups', repoPath] })
          queryClient.invalidateQueries({ queryKey: ['rebase-state', repoPath] })
          mutate(['conflicted-files', repoPath])
        }
      })
    }
    setupListener()
    return () => {
      if (unlisten) unlisten()
    }
  }, [])

  /** `scope` opens the Repository (per-repo) side of Settings — callers pointing at a per-repo
   * setting, like the toolbar's merge-target popover, pass `'local'`. */
  function handleOpenSettings(section?: Section, scope: SettingsScope = 'general') {
    setSettingsSection(section || 'general')
    setSettingsScope(scope)
    setShowSettings(true)
  }

  return (
    <QueryClientProvider client={queryClient}>
      <div className="animate-fadeIn flex h-screen flex-col bg-background text-foreground">
        {showSettings ? (
          <SettingsPage
            key={`${settingsScope}:${settingsSection}`}
            initialSection={settingsSection}
            initialScope={settingsScope}
            onClose={() => setShowSettings(false)}
          />
        ) : showActivityLogs ? (
          <ActivityLogsPage onClose={() => setShowActivityLogs(false)} />
        ) : (
          <>
            <TabBar onOpenSettings={handleOpenSettings} />
            <AiStatusBanner onOpenSettings={() => handleOpenSettings('local_ai')} />
            <OperationProgressBar />
            <div className="flex-1 overflow-hidden">
              {activeTab === DASHBOARD_TAB ? (
                <DashboardPage />
              ) : activeTab === PULL_REQUESTS_TAB ? (
                <PullRequestsPage onOpenSettings={() => handleOpenSettings('integrations')} />
              ) : activeTab === REWARDS_TAB ? (
                <RewardsTab />
              ) : isNewTab(activeTab) ? (
                <NewTabPage />
              ) : (
                <RepoView onOpenSettings={handleOpenSettings} />
              )}
            </div>
            <Footer
              onOpenSettings={handleOpenSettings}
              onOpenActivityLogs={() => setShowActivityLogs(true)}
            />
          </>
        )}
        <CommandPalette
          onOpenSettings={handleOpenSettings}
          onCloseSettings={() => setShowSettings(false)}
          onOpenActivityLogs={() => setShowActivityLogs(true)}
        />
        <Toaster />
        <LoadingOverlay />
        {/* Renders nothing — it holds one notch card per transfer in flight, which needs a
            component instance each (hooks can't be called in a loop over a changing list). */}
        <NotchRemoteOperations />
        <NotchRunningHooks />
        {/* Likewise — the model's own work, above all the file-by-file read that is where a long
            generation actually spends its minutes. */}
        <NotchAiRuns />
        {import.meta.env.VITE_E2E === 'true' && <E2ePathPickerDialog />}
      </div>
    </QueryClientProvider>
  )
}
