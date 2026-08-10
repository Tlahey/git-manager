import { useQueryClient } from '@tanstack/react-query'
import { mutate } from 'swr'
import { toast } from '@git-manager/ui'
import type { GitGraphNode, GitStatus } from '@git-manager/git-types'
import { showNativeMenu } from '../../../api/nativeMenu.api'
import {
  apiStashApply,
  apiStashPop,
  apiStashDrop,
  apiStashPush,
  apiStageAll,
  apiUnstageAll,
  apiRebaseContinue,
  apiRebaseAbort,
  apiRebaseSkip,
} from '../../../api/git.api'
import { apiRevealPathInFinder } from '../../../api/repo.api'
import {
  buildWipMenuSpec,
  buildOtherWorktreeMenuSpec,
  buildStashMenuSpec,
  buildConflictMenuSpec,
} from '../../../lib/graphContextMenus'
import { useRepoUIStore } from '../../../stores/repoUI.store'
import { worktreeWipPath } from '../lib/syntheticRows'
import { refreshLogAndStatus } from '../lib/graphQueryRefresh'

type TranslateFn = (key: string, opts?: Record<string, unknown>) => string

interface UseGraphRowMenusParams {
  repoPath: string
  nodes: GitGraphNode[]
  status: GitStatus | undefined
  hiddenStashes: string[]
  toggleStashVisibility: (repoPath: string, oid: string) => void
  selectSingle: (oid: string) => void
  aiEnabled: boolean
  t: TranslateFn
}

/**
 * The context menus of every graph row that is *not* an ordinary commit: the local WIP row, a
 * linked worktree's `WIP:<path>` row, the CONFLICT row of a paused rebase, and a stash.
 *
 * They are grouped because of what they have in common — each is claimed by its oid alone, before
 * any selection or branch logic runs, and each is small and closed (no submenus, no per-branch
 * rules). The commit menu is the opposite on both counts, which is why it stays in
 * `useGitGraphActions` next to the selection it depends on.
 *
 * The returned function reports whether it *claimed* the row rather than opening a menu for every
 * oid: the caller needs to know when to fall through to the commit menu, and "did one of these own
 * this row?" is the one question the four share.
 */
export function useGraphRowMenus({
  repoPath,
  nodes,
  status,
  hiddenStashes,
  toggleStashVisibility,
  selectSingle,
  aiEnabled,
  t,
}: UseGraphRowMenusParams) {
  const queryClient = useQueryClient()
  const setEditingOid = useRepoUIStore((s) => s.setEditingOid)
  const setAiPanelTarget = useRepoUIStore((s) => s.setAiPanelTarget)
  // Entering a linked worktree from the graph is a view switch, not a new tab — see
  // `repoUI.store.ts`'s `activeWorkspacePath` doc comment. The `WIP:<path>` row's own "Open
  // Worktree" button and the sidebar's worktree row already use this; the context menu's "Open
  // worktree" item reuses it too, so there is exactly one meaning of "open" a worktree in the app.
  const setActiveWorkspacePath = useRepoUIStore((s) => s.setActiveWorkspacePath)

  const refresh = () => refreshLogAndStatus(queryClient, repoPath)

  /** Opens the local WIP row's menu: stash / stage / unstage the work in progress. */
  function openWipMenu() {
    async function runWip(fn: () => Promise<unknown>, successMsg?: string) {
      try {
        await fn()
        refresh()
        mutate(['git-stashes', repoPath])
        if (successMsg) toast.success(successMsg)
      } catch (err) {
        toast.error(String(err))
      }
    }
    void showNativeMenu(
      buildWipMenuSpec(
        {
          hasStaged: (status?.staged.length ?? 0) > 0,
          hasUnstaged: (status?.unstaged.length ?? 0) + (status?.untracked.length ?? 0) > 0,
          aiEnabled,
        },
        {
          onStash: (includeUntracked) =>
            void runWip(
              () => apiStashPush(repoPath, undefined, includeUntracked),
              t('gitTree.wipMenu.stashed')
            ),
          onStageAll: () => void runWip(() => apiStageAll(repoPath)),
          onUnstageAll: () => void runWip(() => apiUnstageAll(repoPath)),
          onExplainChanges: () => setAiPanelTarget({ kind: 'working' }),
          onReviewChanges: () => setAiPanelTarget({ kind: 'reviewWorking' }),
        },
        t
      )
    ).catch(console.error)
  }

  /**
   * Opens the menu of a linked worktree's own uncommitted changes. Every action here targets THAT
   * worktree's path, never the active repo (see `buildOtherWorktreeMenuSpec`'s doc comment for why
   * the menu stays smaller than the local WIP row's).
   */
  function openOtherWorktreeMenu(otherPath: string) {
    const runOtherWorktreeStash = async (includeUntracked: boolean) => {
      try {
        await apiStashPush(otherPath, undefined, includeUntracked)
        // The pushed stash lands in the shared `refs/stash`, so it also shows up back in the
        // active repo's own graph/stash list — refreshed here like the local WIP row's stash.
        refresh()
        mutate(['git-stashes', repoPath])
        mutate(['worktree-wip-statuses', repoPath])
        toast.success(t('gitTree.otherWorktreeMenu.stashed'))
      } catch (err) {
        toast.error(String(err))
      }
    }
    void showNativeMenu(
      buildOtherWorktreeMenuSpec(
        {
          onOpenWorktree: () => setActiveWorkspacePath(otherPath),
          onStash: (includeUntracked) => void runOtherWorktreeStash(includeUntracked),
          onRevealInFinder: () =>
            apiRevealPathInFinder(otherPath).catch((err) => toast.error(String(err))),
        },
        t
      )
    ).catch(console.error)
  }

  /**
   * The CONFLICT row (a paused rebase/merge) gets a shortcut to the same Continue/Skip/Abort
   * actions the conflict-resolution panel offers, gated on the same conditions (see
   * `ConflictResolutionPanel`'s `allResolved`/`noneResolved`, derived here from the same `status`
   * this hook already receives — `status.conflicted` is the paused rebase's remaining conflicts,
   * `status.staged` is what has already been resolved).
   */
  function openConflictMenu() {
    const conflictedCount = status?.conflicted.length ?? 0
    const allResolved = conflictedCount === 0
    const noneResolved = (status?.staged.length ?? 0) === 0 && conflictedCount > 0

    async function runRebaseControl(fn: () => Promise<unknown>) {
      try {
        await fn()
        queryClient.invalidateQueries({ queryKey: ['rebase-state', repoPath] })
        refresh()
        mutate(['conflicted-files', repoPath])
        mutate(['rebase-state', repoPath])
      } catch (err) {
        toast.error(String(err))
      }
    }

    void showNativeMenu(
      buildConflictMenuSpec(
        { allResolved, noneResolved },
        {
          onContinue: () => void runRebaseControl(() => apiRebaseContinue(repoPath)),
          onSkip: () => void runRebaseControl(() => apiRebaseSkip(repoPath)),
          onAbort: () => void runRebaseControl(() => apiRebaseAbort(repoPath)),
        },
        t
      )
    ).catch(console.error)
  }

  function openStashMenu(oid: string, index: number) {
    selectSingle(oid)

    async function runStash(fn: () => Promise<unknown>) {
      try {
        await fn()
        mutate(['git-stashes', repoPath])
        refresh()
      } catch (err) {
        toast.error(String(err))
      }
    }

    void showNativeMenu(
      buildStashMenuSpec(
        { isHidden: hiddenStashes.includes(oid) },
        {
          onApply: () => void runStash(() => apiStashApply(repoPath, index)),
          onPop: () => void runStash(() => apiStashPop(repoPath, index)),
          onDelete: () => void runStash(() => apiStashDrop(repoPath, index)),
          onEditMessage: () => {
            selectSingle(oid)
            setEditingOid(oid)
          },
          onToggleVisibility: () => toggleStashVisibility(repoPath, oid),
        },
        t
      )
    ).catch(console.error)
  }

  /**
   * Opens whichever of the four menus owns `oid`, and reports it. `false` means the row is an
   * ordinary commit and the caller should build the commit menu instead.
   */
  return function openRowMenu(oid: string): boolean {
    if (oid === 'WIP') {
      openWipMenu()
      return true
    }

    const otherPath = worktreeWipPath(oid)
    if (otherPath !== null) {
      openOtherWorktreeMenu(otherPath)
      return true
    }

    if (oid === 'CONFLICT') {
      openConflictMenu()
      return true
    }

    const stashRef = nodes.find((n) => n.commit.oid === oid)?.refs.find((r) => r.type === 'stash')
    if (stashRef) {
      const stashMatch = stashRef.shortName.match(/stash@\{(\d+)\}/)
      openStashMenu(oid, stashMatch ? parseInt(stashMatch[1], 10) : 0)
      return true
    }

    return false
  }
}
