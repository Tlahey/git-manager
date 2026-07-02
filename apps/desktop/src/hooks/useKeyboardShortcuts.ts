import { useEffect } from 'react'
import { useReposStore, DASHBOARD_TAB, PULL_REQUESTS_TAB } from '../stores/repos.store'
import { useUndoHistoryStore } from '../stores/undoHistory.store'
import { queryClient } from '../lib/queryClient'

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
  const { openTabs, activeTab, activeRepo, setActiveTab, closeTab } = useReposStore()

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

      // Undo / Redo : Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z — vérifié indépendamment de `isMod`
      // ci-dessous (qui inclut Alt) pour ne pas déclencher sur Alt+Z.
      const isCtrlOrCmd = navigator.userAgent.includes('Mac') ? e.metaKey : e.ctrlKey
      if (isCtrlOrCmd && !e.altKey && e.key.toLowerCase() === 'z' && activeRepo) {
        e.preventDefault()
        const undoHistory = useUndoHistoryStore.getState()
        const invalidate = () => {
          queryClient.invalidateQueries({ queryKey: ['branches', activeRepo] })
          queryClient.invalidateQueries({ queryKey: ['git-log', activeRepo] })
          queryClient.invalidateQueries({ queryKey: ['git-status', activeRepo] })
        }
        if (e.shiftKey) {
          if (undoHistory.canRedo(activeRepo)) {
            undoHistory.redo(activeRepo).then(invalidate)
          }
        } else if (undoHistory.canUndo(activeRepo)) {
          undoHistory.undo(activeRepo).then(invalidate)
        }
        return
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
  }, [
    openTabs,
    activeTab,
    activeRepo,
    showSettings,
    setActiveTab,
    closeTab,
    onOpenSettings,
    onCloseSettings,
  ])
}
