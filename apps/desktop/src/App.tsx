import { useState, useEffect } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/queryClient'
import { DashboardPage } from './app/dashboard/DashboardPage'
import {
  useRepoUIStore,
  DASHBOARD_TAB,
  REWARDS_TAB,
  PULL_REQUESTS_TAB,
} from './stores/repoUI.store'
import { RewardsTab } from './app/pull-requests/components/RewardsTab'
import { RepoView } from './app/repo/RepoView'
import { PullRequestsPage } from './app/pull-requests/PullRequestsPage'
import { SettingsPage, type Section } from './app/settings/SettingsPage'
import { ActivityLogsPage } from './app/activity-logs/ActivityLogsPage'
import { TabBar } from './components/tab-bar'
import { useTheme } from './hooks/useTheme'
import { useMonacoTheme } from './hooks/useMonacoTheme'
import { useNotificationWatcher } from './hooks/useNotificationWatcher'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useDevFixtureImport } from './hooks/useDevFixtureImport'
import { Footer } from './components/footer/Footer'

import { Toaster } from '@git-manager/ui'
import { CommandPalette } from './components/command-palette/CommandPalette'
import { TrophyToast } from './components/trophy/TrophyToast'
import { OperationProgressBar } from './components/layout/OperationProgressBar'
import { appEventBus } from './lib/appEventBus'
import { useOperationProgressStore } from './stores/operationProgress.store'
import { useUndoHistoryStore } from './stores/undoHistory.store'
import { listen } from '@tauri-apps/api/event'
import { mutate } from 'swr'

export default function App() {
  const activeTab = useRepoUIStore((s) => s.activeTab)
  const [showSettings, setShowSettings] = useState(false)
  const [settingsSection, setSettingsSection] = useState<Section>('general')
  const [showActivityLogs, setShowActivityLogs] = useState(false)

  useTheme()
  useMonacoTheme()
  useNotificationWatcher()
  useDevFixtureImport()

  useKeyboardShortcuts({
    onOpenSettings: () => handleOpenSettings('general'),
    onCloseSettings: () => setShowSettings(false),
    showSettings,
  })

  // Firing open_app event on launch
  useEffect(() => {
    appEventBus.notify('open_app')
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

  function handleOpenSettings(section?: Section) {
    setSettingsSection(section || 'general')
    setShowSettings(true)
  }

  return (
    <QueryClientProvider client={queryClient}>
      <div className="animate-fadeIn flex h-screen flex-col bg-background text-foreground">
        {showSettings ? (
          <SettingsPage
            key={settingsSection}
            initialSection={settingsSection}
            onClose={() => setShowSettings(false)}
          />
        ) : showActivityLogs ? (
          <ActivityLogsPage onClose={() => setShowActivityLogs(false)} />
        ) : (
          <>
            <TabBar onOpenSettings={handleOpenSettings} />
            <OperationProgressBar />
            <div className="flex-1 overflow-hidden">
              {activeTab === DASHBOARD_TAB ? (
                <DashboardPage onOpenSettings={() => handleOpenSettings('local_ai')} />
              ) : activeTab === PULL_REQUESTS_TAB ? (
                <PullRequestsPage />
              ) : activeTab === REWARDS_TAB ? (
                <RewardsTab />
              ) : (
                <RepoView />
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
        <TrophyToast />
        <Toaster />
      </div>
    </QueryClientProvider>
  )
}
