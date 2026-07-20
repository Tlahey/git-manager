import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from '@git-manager/i18n'
import { toast } from '@git-manager/ui'
import type { GitRef } from '@git-manager/git-types'
import { showRefDropNativeContextMenu } from '../api/nativeMenu.api'
import {
  apiCheckoutBranch,
  apiMergeBranch,
  apiFastForwardBranch,
  apiPushBranchTo,
  apiRebaseOntoCommit,
  apiResetToCommit,
} from '../api/git.api'
import { useRepoDataStore } from '../stores/repoData.store'
import { useRepoUIStore } from '../stores/repoUI.store'

/** Human-readable name for a ref — strips the remote prefix (`origin/main` → `main`). */
function displayName(ref: GitRef): string {
  if (ref.type === 'remote') {
    const parts = ref.shortName.split('/')
    if (parts.length > 1) return parts.slice(1).join('/')
  }
  return ref.shortName
}

/** The remote a ref lives on (the first segment of a `remote` ref's short name), else "origin". */
function remoteOf(ref: GitRef): string {
  if (ref.type === 'remote') {
    const parts = ref.shortName.split('/')
    if (parts.length > 1) return parts[0]
  }
  return 'origin'
}

/** Opens the interactive-rebase editor window for `baseOid` (same pattern as the fixup window). */
async function openRebaseWindow(repoPath: string, baseOid: string): Promise<void> {
  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')
  const safeLabel = `rebase-${repoPath.replace(/[^a-zA-Z0-9_-]/g, '-')}`
  const url =
    `/?window=rebase&repoPath=${encodeURIComponent(repoPath)}` +
    `&baseOid=${encodeURIComponent(baseOid)}`

  const existing = await WebviewWindow.getByLabel(safeLabel)
  if (existing) {
    await existing.show()
    await existing.setFocus()
  } else {
    new WebviewWindow(safeLabel, {
      url,
      title: 'Interactive Rebase',
      width: 1200,
      height: 850,
      minWidth: 900,
      minHeight: 600,
      decorations: true,
    })
  }
}

/**
 * Wires the branch/tag drag-and-drop menu in the commit graph. `handleDrop(source, target)` pops
 * the native drop menu (see {@link showRefDropNativeContextMenu}) with the actions relating the
 * dragged `source` ref to the drop `target` ref, each enabled per ref type and wired to the right
 * API — reusing the existing checkout/rebase/reset commands and the PR-create flow, plus the three
 * new merge/fast-forward/push commands.
 */
export function useRefDrop(repoPath: string) {
  const { t } = useTranslation('git')
  const queryClient = useQueryClient()
  const repo = useRepoDataStore((s) => s.repoCache[repoPath])
  const openPrCreateWith = useRepoUIStore((s) => s.openPrCreateWith)

  const currentBranch = repo?.head ?? null
  const isDetached = repo?.isDetached ?? false

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['git-log', repoPath] })
    queryClient.invalidateQueries({ queryKey: ['git-status', repoPath] })
    queryClient.invalidateQueries({ queryKey: ['branches', repoPath] })
  }

  /** Checks out `branch` unless it's already HEAD — a rewriting op (rebase/reset) acts on HEAD. */
  async function ensureCheckedOut(branch: string) {
    if (currentBranch === branch) return
    await apiCheckoutBranch(repoPath, branch, {
      fromRef: currentBranch ?? branch,
      fromDetached: isDetached,
    })
  }

  /** Runs a git action, refreshing the graph on success and surfacing failures as a toast. */
  async function run(fn: () => Promise<void>, successMsg?: string) {
    try {
      await fn()
      refresh()
      if (successMsg) toast.success(successMsg)
    } catch (err) {
      toast.error(String(err))
    }
  }

  function handleDrop(source: GitRef, target: GitRef) {
    const sourceName = displayName(source)
    const targetName = displayName(target)
    const remote = remoteOf(target)

    const sourceIsBranch = source.type === 'branch'
    const targetIsBranch = target.type === 'branch'
    const params = { source: sourceName, target: targetName, remote }

    void showRefDropNativeContextMenu({
      labels: {
        fastForward: t('gitTree.dragDrop.fastForward', params),
        merge: t('gitTree.dragDrop.merge', params),
        rebase: t('gitTree.dragDrop.rebase', params),
        interactiveRebase: t('gitTree.dragDrop.interactiveRebase', params),
        push: t('gitTree.dragDrop.push', params),
        resetSubmenu: t('gitTree.dragDrop.resetSubmenu', params),
        resetSoft: t('gitTree.dragDrop.resetSoft'),
        resetMixed: t('gitTree.dragDrop.resetMixed'),
        resetHard: t('gitTree.dragDrop.resetHard'),
        startPr: t('gitTree.dragDrop.startPr', params),
      },
      // Fast-forward and merge move the *target* branch, so it must be a local branch.
      fastForwardEnabled: targetIsBranch,
      mergeEnabled: targetIsBranch,
      // Rebase / reset / push rewrite or publish the *source* branch, so it must be local.
      rebaseEnabled: sourceIsBranch,
      interactiveRebaseEnabled: sourceIsBranch,
      pushEnabled: sourceIsBranch,
      resetEnabled: sourceIsBranch,
      // A pull request needs branch heads on both sides — tags can't be a PR head or base.
      prEnabled: source.type !== 'tag' && target.type !== 'tag',
      onFastForward: () =>
        void run(
          () => apiFastForwardBranch(repoPath, source.shortName, target.shortName),
          t('gitTree.dragDrop.fastForwarded', params)
        ),
      onMerge: () =>
        void run(
          () => apiMergeBranch(repoPath, source.shortName, target.shortName),
          t('gitTree.dragDrop.merged', params)
        ),
      onRebase: () =>
        void run(async () => {
          await ensureCheckedOut(source.shortName)
          await apiRebaseOntoCommit(repoPath, target.commitOid)
        }, t('gitTree.dragDrop.rebased', params)),
      onInteractiveRebase: () =>
        void run(async () => {
          await ensureCheckedOut(source.shortName)
          await openRebaseWindow(repoPath, target.commitOid)
        }),
      onPush: () =>
        void run(
          () => apiPushBranchTo(repoPath, source.shortName, targetName, remote),
          t('gitTree.dragDrop.pushed', params)
        ),
      onReset: (mode) =>
        void run(async () => {
          await ensureCheckedOut(source.shortName)
          await apiResetToCommit(repoPath, target.commitOid, mode)
        }, t('gitTree.dragDrop.reset', params)),
      onStartPr: () => openPrCreateWith(sourceName, targetName),
    })
  }

  return { handleDrop }
}
