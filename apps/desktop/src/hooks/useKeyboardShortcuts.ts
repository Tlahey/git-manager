import { useEffect } from 'react'
import { useRepoUIStore, DASHBOARD_TAB, PULL_REQUESTS_TAB } from '../stores/repoUI.store'
import { useUndoHistoryStore } from '../stores/undoHistory.store'
import { useCommandPaletteStore } from '../stores/commandPalette.store'
import { useCommitSearchStore } from '../stores/commitSearch.store'
import { useSidebarSearchStore } from '../stores/sidebarSearch.store'
import { useIsCommitsView } from './useIsCommitsView'
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
  const { openTabs, activeTab, activeRepo, setActiveTab, closeTab } = useRepoUIStore()
  const isCommitsView = useIsCommitsView()

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Command palette: ⌘K / Ctrl+K — handled before the input guard so it toggles even while
      // typing (standard palette behaviour); cmdk owns arrow/Escape once the palette is open.
      const isModK = navigator.userAgent.includes('Mac') ? e.metaKey : e.ctrlKey
      if (isModK && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        useCommandPaletteStore.getState().toggle()
        return
      }

      // Commit search: ⌘F / Ctrl+F — toggles the floating commit search panel. Also handled
      // before the input guard (like ⌘K) so it works while focus is elsewhere, but yields to
      // Monaco's own in-file find widget when focused inside a diff/merge editor, and only
      // applies while the plain commit graph is on screen (the panel only exists there — see
      // `useIsCommitsView`, not while viewing a PR/diff/composer or with no repo open).
      const isModF = navigator.userAgent.includes('Mac') ? e.metaKey : e.ctrlKey
      if (isModF && !e.altKey && e.key.toLowerCase() === 'f' && activeRepo && isCommitsView) {
        const targetEl = e.target as HTMLElement
        if (!targetEl.closest('.monaco-editor')) {
          e.preventDefault()
          useCommitSearchStore.getState().toggle()
          return
        }
      }

      // Sidebar search: ⌥⌘F / Ctrl+Alt+F — focuses the left panel's filter input, regardless of
      // current focus (handled before the input guard below, like ⌘K/⌘F above). Matched via
      // `e.code` (physical key), not `e.key`: on macOS, Option acts as a dead-key composer, so a
      // real Option+F keypress reports `e.key === 'ƒ'` (florin sign), not `'f'` — `e.key` would
      // never match and the shortcut would silently never fire.
      const isModOptF = navigator.userAgent.includes('Mac') ? e.metaKey : e.ctrlKey
      if (isModOptF && e.altKey && e.code === 'KeyF' && activeRepo) {
        e.preventDefault()
        useSidebarSearchStore.getState().requestFocus()
        return
      }

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
    isCommitsView,
    showSettings,
    setActiveTab,
    closeTab,
    onOpenSettings,
    onCloseSettings,
  ])
}
