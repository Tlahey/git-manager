import { useState } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/queryClient'
import { DashboardPage } from './app/dashboard/DashboardPage'
import { useReposStore, DASHBOARD_TAB, REWARDS_TAB, PULL_REQUESTS_TAB } from './stores/repos.store'
import { RewardsTab } from './app/pull-requests/components/RewardsTab'
import { RepoView } from './app/repo/RepoView'
import { PullRequestsPage } from './app/pull-requests/PullRequestsPage'
import { SettingsPage } from './app/settings/SettingsPage'
import { TabBar } from './components/tab-bar'
import { useTheme } from './hooks/useTheme'
import { useMonacoTheme } from './hooks/useMonacoTheme'
import { useNotificationWatcher } from './hooks/useNotificationWatcher'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { Footer } from './components/footer/Footer'

import { useEffect } from 'react'
import { TrophyToast } from './components/trophy/TrophyToast'
import { gameObserver } from './lib/gameObserver'

export default function App() {
  const activeTab = useReposStore((s) => s.activeTab)
  const [showSettings, setShowSettings] = useState(false)
  const [settingsSection, setSettingsSection] = useState<'general' | 'ssh' | 'integrations' | 'local_ai' | 'external_tools' | 'notifications' | 'ui_customization' | 'rewards'>('general')

  useTheme()
  useMonacoTheme()
  useNotificationWatcher()

  useKeyboardShortcuts({
    onOpenSettings: () => handleOpenSettings('general'),
    onCloseSettings: () => setShowSettings(false),
    showSettings,
  })

  // Firing open_app event on launch
  useEffect(() => {
    gameObserver.notify('open_app')
  }, [])

  function handleOpenSettings(section?: 'general' | 'ssh' | 'integrations' | 'local_ai' | 'external_tools' | 'notifications' | 'ui_customization' | 'rewards') {
    setSettingsSection(section || 'general')
    setShowSettings(true)
  }

  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex h-screen flex-col bg-background text-foreground animate-fadeIn">
        {showSettings ? (
          <SettingsPage initialSection={settingsSection} onClose={() => setShowSettings(false)} />
        ) : (
          <>
            <TabBar onOpenSettings={handleOpenSettings} />
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
            <Footer onOpenSettings={handleOpenSettings} />
          </>
        )}
        <TrophyToast />
      </div>
    </QueryClientProvider>
  )
}
