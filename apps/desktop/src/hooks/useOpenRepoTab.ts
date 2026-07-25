import { useCallback } from 'react'
import { useRepoDataStore } from '../stores/repoData.store'
import { useRepoUIStore } from '../stores/repoUI.store'

/**
 * Opens an already-known repo path as a tab (focusing it if it's already open) and records it as
 * the most recently opened one. Every "open this repo in a tab" entry point goes through here so
 * the New Tab page's recent list stays accurate — calling `openTab` directly would silently skip
 * the recency bookkeeping.
 */
export function useOpenRepoTab() {
  const markRepoOpened = useRepoDataStore((s) => s.markRepoOpened)
  const openTab = useRepoUIStore((s) => s.openTab)

  return useCallback(
    (path: string) => {
      markRepoOpened(path)
      openTab(path)
    },
    [markRepoOpened, openTab]
  )
}
