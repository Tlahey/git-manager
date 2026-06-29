import { useEffect } from 'react'
import { useReposStore, DASHBOARD_TAB, PULL_REQUESTS_TAB } from '../stores/repos.store'

interface UseKeyboardShortcutsProps {
  onOpenSettings: () => void
  onCloseSettings: () => void
  showSettings: boolean
}

export function useKeyboardShortcuts({
  onOpenSettings,
  onCloseSettings,
  showSettings,
}: UseKeyboardShortcutsProps) {
  const { openTabs, activeTab, setActiveTab, closeTab } = useReposStore()

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ignore shortcuts if user is typing in an input, textarea or contenteditable element
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        target.closest('.monaco-editor') // Don't intercept when inside monaco diff editor
      ) {
        // Allow Escape to close settings even if an input inside settings is focused
        if (e.key === 'Escape' && showSettings) {
          e.preventDefault()
          onCloseSettings()
        }
        return
      }

      // 1. Escape to close settings
      if (e.key === 'Escape') {
        if (showSettings) {
          e.preventDefault()
          onCloseSettings()
          return
        }
      }

      // Check modifier keys: Alt (Option on Mac) or Cmd/Ctrl
      const isMod = e.altKey || (navigator.userAgent.includes('Mac') ? e.metaKey : e.ctrlKey)
      
      if (isMod) {
        // 2. Tab Navigation: 1 to 9
        if (e.key >= '1' && e.key <= '9') {
          e.preventDefault()
          const num = parseInt(e.key, 10)
          if (num === 1) {
            setActiveTab(DASHBOARD_TAB)
          } else if (num === 2) {
            setActiveTab(PULL_REQUESTS_TAB)
          } else {
            // Repo tabs are 3-indexed (mapped to openTabs index num - 3)
            const repoIndex = num - 3
            if (repoIndex >= 0 && repoIndex < openTabs.length) {
              setActiveTab(openTabs[repoIndex])
            }
          }
          return
        }

        // 3. Settings shortcut: Mod + ,
        if (e.key === ',') {
          e.preventDefault()
          onOpenSettings()
          return
        }

        // 4. Close Active Tab shortcut: Alt + W
        if (e.key.toLowerCase() === 'w') {
          // Only close if we are on a repo tab and settings are not open
          if (!showSettings && activeTab !== DASHBOARD_TAB && activeTab !== PULL_REQUESTS_TAB) {
            e.preventDefault()
            closeTab(activeTab)
            return
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [openTabs, activeTab, showSettings, setActiveTab, closeTab, onOpenSettings, onCloseSettings])
}
