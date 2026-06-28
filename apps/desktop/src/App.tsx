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

  useTheme()
  useMonacoTheme()

  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex h-screen flex-col bg-background text-foreground">
        {showSettings ? (
          <SettingsPage onClose={() => setShowSettings(false)} />
        ) : (
          <>
            <TabBar onOpenSettings={() => setShowSettings(true)} />
            <div className="flex-1 overflow-hidden">
              {activeTab === DASHBOARD_TAB ? (
                <DashboardPage onOpenSettings={() => setShowSettings(true)} />
              ) : activeTab === PULL_REQUESTS_TAB ? (
                <PullRequestsPage />
              ) : (
                <RepoView onOpenSettings={() => setShowSettings(true)} />
              )}
            </div>
          </>
        )}
      </div>
    </QueryClientProvider>
  )
}
