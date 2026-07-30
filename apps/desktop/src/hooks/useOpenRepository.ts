import { useCallback } from 'react'
import { pickFolder } from '../lib/pickFolder'
import { apiOpenRepo } from '../api/repo.api'
import { useRepoDataStore } from '../stores/repoData.store'
import { useOpenRepoTab } from './useOpenRepoTab'

/**
 * Opens the folder picker, opens the chosen repo through the backend and adds it as a tab. Shared
 * by the dashboard "Browse" button and the command palette so the flow lives in one place. Returns
 * `true` if a repo was opened, `false` if the picker was cancelled; throws on backend error
 * (callers decide how to surface it — inline error vs. toast).
 */
export function useOpenRepository() {
  const addRepo = useRepoDataStore((s) => s.addRepo)
  const openRepoTab = useOpenRepoTab()

  return useCallback(async (): Promise<boolean> => {
    const selected = await pickFolder()
    if (!selected) return false
    const repo = await apiOpenRepo(selected)
    addRepo(repo)
    openRepoTab(repo.path)
    return true
  }, [addRepo, openRepoTab])
}
