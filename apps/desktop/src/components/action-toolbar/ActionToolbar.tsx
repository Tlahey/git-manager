import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  ArrowUpFromLine,
  ChevronRight,
  GitPullRequest,
  Redo2,
  Terminal as TerminalIcon,
  Undo2,
  Archive,
  ArchiveRestore,
} from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import { useReposStore } from '../../stores/repos.store'
import {
  fetchRemote,
  pullBranch,
  pushBranch,
  stashPush,
  stashPop,
  createBranch,
} from '../../lib/tauri'
import { RepoSelector } from './RepoSelector'
import { BranchContext } from './BranchContext'
import { StateTags } from './StateTags'
import { FetchButton } from './FetchButton'
import { BranchButton } from './BranchButton'
import { ToolbarButton } from './ToolbarButton'
import { ToolbarSearch } from './ToolbarSearch'

interface ActionToolbarProps {
  searchQuery: string
  onSearchChange: (value: string) => void
}

interface Notification {
  type: 'success' | 'error'
  message: string
}

type LoadingKey = 'fetch' | 'pull' | 'push' | 'stash' | 'pop'

/** Barre d'actions principale (Partie 2) située sous les onglets. */
export function ActionToolbar({ searchQuery, onSearchChange }: ActionToolbarProps) {
  const { t } = useTranslation('git')
  const queryClient = useQueryClient()
  const { activeRepo, repoCache } = useReposStore()

  const [loading, setLoading] = useState<Record<LoadingKey, boolean>>({
    fetch: false,
    pull: false,
    push: false,
    stash: false,
    pop: false,
  })
  const [notification, setNotification] = useState<Notification | null>(null)

  const repo = activeRepo ? repoCache[activeRepo] : undefined
  const fromRef = repo ? (repo.isDetached ? 'HEAD' : repo.head) : 'HEAD'

  function notify(type: Notification['type'], message: string) {
    setNotification({ type, message })
    setTimeout(() => setNotification(null), 3500)
  }

  function invalidateRepo() {
    if (!activeRepo) return
    queryClient.invalidateQueries({ queryKey: ['branches', activeRepo] })
    queryClient.invalidateQueries({ queryKey: ['git-log', activeRepo] })
    queryClient.invalidateQueries({ queryKey: ['git-status', activeRepo] })
  }

  async function runAction(key: LoadingKey, fn: () => Promise<void>) {
    if (!activeRepo) return
    setLoading((s) => ({ ...s, [key]: true }))
    try {
      await fn()
    } catch (err) {
      notify('error', String(err))
    } finally {
      setLoading((s) => ({ ...s, [key]: false }))
    }
  }

  const handleFetch = () =>
    runAction('fetch', async () => {
      await fetchRemote(activeRepo!)
      notify('success', t('remote.fetchSuccess'))
      invalidateRepo()
    })

  const handleFetchAll = () =>
    runAction('fetch', async () => {
      const remotes = repo?.remotes ?? []
      if (remotes.length === 0) {
        await fetchRemote(activeRepo!)
      } else {
        for (const remote of remotes) {
          await fetchRemote(activeRepo!, remote)
        }
      }
      notify('success', t('remote.fetchSuccess'))
      invalidateRepo()
    })

  const handlePull = () =>
    runAction('pull', async () => {
      const result = await pullBranch(activeRepo!)
      if (result.conflicts.length > 0) {
        notify('error', t('remote.conflict', { count: result.conflicts.length }))
      } else {
        notify('success', t('remote.pullSuccess', { commits: result.commitsMerged }))
      }
      invalidateRepo()
    })

  const handlePush = () =>
    runAction('push', async () => {
      await pushBranch(activeRepo!)
      notify('success', t('remote.pushSuccess'))
      invalidateRepo()
    })

  const handleStash = () =>
    runAction('stash', async () => {
      await stashPush(activeRepo!)
      notify('success', t('toolbar.stashSuccess'))
      invalidateRepo()
    })

  const handlePop = () =>
    runAction('pop', async () => {
      await stashPop(activeRepo!)
      notify('success', t('toolbar.popSuccess'))
      invalidateRepo()
    })

  async function handleCreateBranch(name: string) {
    if (!activeRepo) return
    try {
      await createBranch(activeRepo, name, fromRef)
      notify('success', t('toolbar.branchCreated', { name }))
      invalidateRepo()
    } catch (err) {
      notify('error', String(err))
    }
  }

  const disabled = !activeRepo

  return (
    <div className="flex h-[52px] shrink-0 items-center gap-1 overflow-hidden border-b border-border bg-muted/30 px-2">
      {/* ── Section gauche : contexte ─────────────────────────── */}
      <div className="flex min-w-0 shrink items-center gap-1">
        <RepoSelector />
        <ChevronRight className="h-4 w-4 shrink-0 self-end pb-0.5 text-muted-foreground/40" />
        <BranchContext />
        <div className="ml-1 self-end pb-0.5">
          <StateTags />
        </div>
      </div>

      <div className="mx-1 hidden h-6 w-px shrink-0 bg-border sm:block" />

      {/* ── Section centrale : actions rapides ────────────────── */}
      <div className="flex min-w-0 shrink items-center gap-0.5 overflow-x-auto">
        <ToolbarButton
          icon={<Undo2 className="h-4 w-4 text-muted-foreground" />}
          label={t('toolbar.undo')}
          title={t('toolbar.undoSoon')}
          disabled
        />
        <ToolbarButton
          icon={<Redo2 className="h-4 w-4 text-muted-foreground" />}
          label={t('toolbar.redo')}
          title={t('toolbar.redoSoon')}
          disabled
        />

        <div className="mx-1 h-6 w-px shrink-0 bg-border" />

        <FetchButton
          loading={loading.fetch}
          onFetch={handleFetch}
          onFetchAll={handleFetchAll}
          onFetchPrune={handleFetch}
        />
        <ToolbarButton
          icon={<GitPullRequest className="h-4 w-4 text-blue-400" />}
          label={t('remote.pull')}
          loading={loading.pull}
          disabled={disabled}
          onClick={handlePull}
        />
        <ToolbarButton
          icon={<ArrowUpFromLine className="h-4 w-4 text-green-400" />}
          label={t('remote.push')}
          loading={loading.push}
          disabled={disabled}
          onClick={handlePush}
        />

        <div className="mx-1 h-6 w-px shrink-0 bg-border" />

        <BranchButton fromRef={fromRef} onCreate={handleCreateBranch} />
        <ToolbarButton
          icon={<Archive className="h-4 w-4 text-violet-400" />}
          label={t('toolbar.stash')}
          loading={loading.stash}
          disabled={disabled}
          onClick={handleStash}
        />
        <ToolbarButton
          icon={<ArchiveRestore className="h-4 w-4 text-violet-400" />}
          label={t('toolbar.pop')}
          loading={loading.pop}
          disabled={disabled}
          onClick={handlePop}
        />

        <div className="mx-1 h-6 w-px shrink-0 bg-border" />

        <ToolbarButton
          icon={<TerminalIcon className="h-4 w-4 text-muted-foreground" />}
          label={t('toolbar.terminal')}
          title={t('toolbar.terminalSoon')}
          disabled
        />
      </div>

      {/* ── Section droite : recherche & outils ───────────────── */}
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <ToolbarSearch value={searchQuery} onChange={onSearchChange} />
      </div>

      {/* Toast transitoire */}
      {notification &&
        createPortal(
          <div
            className={`fixed bottom-4 right-4 z-50 flex items-center rounded-md px-3 py-2 text-xs shadow-lg ${
              notification.type === 'success'
                ? 'bg-green-500/15 text-green-400 ring-1 ring-green-500/30'
                : 'bg-destructive/15 text-destructive ring-1 ring-destructive/30'
            }`}
          >
            {notification.message}
          </div>,
          document.body,
        )}
    </div>
  )
}
