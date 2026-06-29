import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DashboardPage } from './app/dashboard/DashboardPage'
import { useReposStore, DASHBOARD_TAB, PULL_REQUESTS_TAB } from './stores/repos.store'
import { RepoView } from './app/repo/RepoView'
import { PullRequestsPage } from './app/pull-requests/PullRequestsPage'
import { SettingsPage } from './app/settings/SettingsPage'
import { TabBar } from './components/tab-bar'
import { useTheme } from './hooks/useTheme'
import { useMonacoTheme } from './hooks/useMonacoTheme'
import { useNotificationWatcher } from './hooks/useNotificationWatcher'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5_000,
    },
  },
})

export default function App() {
  const activeTab = useReposStore((s) => s.activeTab)
  const [showSettings, setShowSettings] = useState(false)
  const [settingsSection, setSettingsSection] = useState<'general' | 'ssh' | 'integrations' | 'local_ai' | 'external_tools' | 'notifications' | 'ui_customization'>('general')

  useTheme()
  useMonacoTheme()
  useNotificationWatcher()

  function handleOpenSettings(section?: 'general' | 'ssh' | 'integrations' | 'local_ai' | 'external_tools' | 'notifications' | 'ui_customization') {
    setSettingsSection(section || 'general')
    setShowSettings(true)
  }

  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex h-screen flex-col bg-background text-foreground">
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
              ) : (
                <RepoView />
              )}
            </div>
          </>
        )}
      </div>
    </QueryClientProvider>
  )
}
