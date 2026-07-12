import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { mutate } from 'swr'
import { toast } from '@git-manager/ui'
import { useRepoDataStore } from '../stores/repoData.store'
import { useRepoUIStore } from '../stores/repoUI.store'
import { useUndoHistoryStore } from '../stores/undoHistory.store'
import { useSettingsStore } from '../stores/settings.store'
import {
  apiStashPush,
  apiStashPop,
  apiFetchRemote,
  apiPullBranch,
  apiPushBranch,
  apiCreateBranch,
} from '../api/git.api'
import { apiOpenTerminal } from '../api/shell.api'
import { useGitStatus } from './useGitStatus'
import { useGitStashes } from './useGitStashes'

type TranslateFn = (key: string, opts?: Record<string, unknown>) => string

type LoadingKey = 'fetch' | 'pull' | 'push' | 'stash' | 'pop' | 'undo' | 'redo'

/**
 * Actions et état dérivé de la barre d'actions principale : fetch/pull/push,
 * undo/redo, stash/pop, création de branche, terminal — plus l'état de
 * chargement par action. Les notifications passent par le toast global (@git-manager/ui).
 */
export function useActionToolbar(t: TranslateFn) {
  const queryClient = useQueryClient()
  const { activeRepo } = useRepoUIStore()
  const { repoCache } = useRepoDataStore()
  const settings = useSettingsStore((s) => s.settings)

  const [loading, setLoading] = useState<Record<LoadingKey, boolean>>({
    fetch: false,
    pull: false,
    push: false,
    stash: false,
    pop: false,
    undo: false,
    redo: false,
  })
  const wipMessages = useRepoDataStore((s) => s.wipMessages)
  const setWipMessage = useRepoDataStore((s) => s.setWipMessage)

  const repo = activeRepo ? repoCache[activeRepo] : undefined
  const fromRef = repo ? (repo.isDetached ? 'HEAD' : repo.head) : 'HEAD'

  const { data: gitStatus } = useGitStatus(activeRepo || '')
  const { data: stashes } = useGitStashes(activeRepo)

  const hasChanges = gitStatus
    ? gitStatus.staged.length > 0 || gitStatus.unstaged.length > 0 || gitStatus.untracked.length > 0
    : false

  const hasStashes = stashes ? stashes.length > 0 : false

  const canUndo = useUndoHistoryStore((s) => (activeRepo ? s.canUndo(activeRepo) : false))
  const canRedo = useUndoHistoryStore((s) => (activeRepo ? s.canRedo(activeRepo) : false))
  const undoLabel = useUndoHistoryStore((s) => (activeRepo ? s.peekUndoLabel(activeRepo) : null))
  const redoLabel = useUndoHistoryStore((s) => (activeRepo ? s.peekRedoLabel(activeRepo) : null))

  const handleOpenTerminal = async () => {
    if (!activeRepo) return
    const terminal = settings.externalTools?.externalTerminal || 'system'
    const customCommand = settings.externalTools?.externalTerminalCommand
    await apiOpenTerminal(activeRepo, terminal, customCommand)
  }

  function invalidateRepo() {
    if (!activeRepo) return
    queryClient.invalidateQueries({ queryKey: ['branches', activeRepo] })
    queryClient.invalidateQueries({ queryKey: ['git-log', activeRepo] })
    queryClient.invalidateQueries({ queryKey: ['git-status', activeRepo] })
    mutate(['git-stashes', activeRepo])
  }

  async function runAction(key: LoadingKey, fn: () => Promise<void>) {
    if (!activeRepo) return
    setLoading((s) => ({ ...s, [key]: true }))
    try {
      await fn()
    } catch (err) {
      toast.error(String(err))
    } finally {
      setLoading((s) => ({ ...s, [key]: false }))
    }
  }

  function clearRedoForActiveRepo() {
    if (activeRepo) useUndoHistoryStore.getState().clearRedo(activeRepo)
  }

  const handleFetch = () =>
    runAction('fetch', async () => {
      await apiFetchRemote(activeRepo!)
      toast.success(t('remote.fetchSuccess'))
      clearRedoForActiveRepo()
      invalidateRepo()
    })

  const handleFetchAll = () =>
    runAction('fetch', async () => {
      const remotes = repo?.remotes ?? []
      if (remotes.length === 0) {
        await apiFetchRemote(activeRepo!)
      } else {
        for (const remote of remotes) {
          await apiFetchRemote(activeRepo!, remote)
        }
      }
      toast.success(t('remote.fetchSuccess'))
      clearRedoForActiveRepo()
      invalidateRepo()
    })

  const handlePull = () =>
    runAction('pull', async () => {
      const result = await apiPullBranch(activeRepo!)
      if (result.conflicts.length > 0) {
        toast.error(t('remote.conflict', { count: result.conflicts.length }))
      } else {
        toast.success(t('remote.pullSuccess', { commits: result.commitsMerged }))
      }
      clearRedoForActiveRepo()
      invalidateRepo()
    })

  const handlePush = () =>
    runAction('push', async () => {
      await apiPushBranch(activeRepo!)
      toast.success(t('remote.pushSuccess'))
      clearRedoForActiveRepo()
      invalidateRepo()
    })

  const handleUndo = () =>
    runAction('undo', async () => {
      await useUndoHistoryStore.getState().undo(activeRepo!)
      invalidateRepo()
    })

  const handleRedo = () =>
    runAction('redo', async () => {
      await useUndoHistoryStore.getState().redo(activeRepo!)
      invalidateRepo()
    })

  const handleStash = () =>
    runAction('stash', async () => {
      const wipMsg = activeRepo ? wipMessages[activeRepo] || '' : ''
      const defaultMessage = `WIP on ${fromRef}`
      const stashMessage = wipMsg.trim() ? wipMsg.trim() : defaultMessage
      // Always stash untracked
      await apiStashPush(activeRepo!, stashMessage, true)
      // Clear WIP message
      if (activeRepo) {
        setWipMessage(activeRepo, '')
      }
      toast.success(t('toolbar.stashSuccess'))
      invalidateRepo()
    })

  const handlePop = () =>
    runAction('pop', async () => {
      await apiStashPop(activeRepo!)
      toast.success(t('toolbar.popSuccess'))
      invalidateRepo()
    })

  async function handleCreateBranch(name: string) {
    if (!activeRepo) return
    try {
      await apiCreateBranch(activeRepo, name, fromRef)
      toast.success(t('toolbar.branchCreated', { name }))
      invalidateRepo()
    } catch (err) {
      toast.error(String(err))
    }
  }

  return {
    activeRepo,
    fromRef,
    loading,
    hasChanges,
    hasStashes,
    canUndo,
    canRedo,
    undoLabel,
    redoLabel,
    handleOpenTerminal,
    handleFetch,
    handleFetchAll,
    handlePull,
    handlePush,
    handleUndo,
    handleRedo,
    handleStash,
    handlePop,
    handleCreateBranch,
  }
}
