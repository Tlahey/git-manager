import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { open, save } from '@tauri-apps/plugin-dialog'
import { toast } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import type { GitBranch, GitRef } from '@git-manager/git-types'
import { showNativeMenu } from '../api/nativeMenu.api'
import {
  buildSidebarBranchMenuSpec,
  remoteBranchTarget,
  type BranchMenuActions,
  type BranchTipCommitActions,
  type CommitCopyActions,
  type PendingDeleteRemoteBranch,
} from '../lib/graphContextMenus'
import {
  apiPullBranch,
  apiPushBranch,
  apiFastForwardBranch,
  apiMergeBranch,
  apiRebaseOntoCommit,
  apiCherryPickCommit,
  apiDeleteBranch,
  apiCopyCommitSha,
  apiGetCommitWebUrl,
  apiGetBranchWebUrl,
  apiCreatePatch,
} from '../api/git.api'
import { apiAddWorktree } from '../api/worktree.api'
import { resolveExplanationBase } from '../lib/branchExplanationBase'
import { useRepoDataStore } from '../stores/repoData.store'
import { useRepoUIStore } from '../stores/repoUI.store'
import { usePinnedBranchesStore } from '../stores/pinned-branches.store'
import { useAiEnabled } from './useAiEnabled'
import { useBranches } from './useBranches'
import { useBranchCheckout } from './useBranchCheckout'
import { useEffectiveRepoSettings } from './useEffectiveRepoSettings'
import { useSoloModeStore } from '../stores/soloMode.store'

/** Stable empty list, so an unfiltered store read doesn't hand back a new array every render. */
const EMPTY: string[] = []

/**
 * A `GitBranch` rendered as the `GitRef` the shared menu builders expect (pointing at its tip).
 *
 * A remote branch is named the way the graph names it — remote-qualified (`origin/main`), which
 * `GitBranch` carries in `name`, not in `shortName` (the backend strips the remote from that one).
 * The distinction is not cosmetic: the builders label, hide and *operate* on `shortName`, so a
 * stripped `main` would have "Merge origin/main into feat" merge the local `main` instead.
 */
function branchToRef(branch: GitBranch): GitRef {
  return {
    name: branch.isRemote ? `refs/remotes/${branch.name}` : branch.name,
    shortName: branch.isRemote ? branch.name : branch.shortName,
    type: branch.isRemote ? 'remote' : 'branch',
    commitOid: branch.commitOid,
  }
}

/**
 * The repository sidebar's branch context menus — one for a local branch row, one for a remote
 * branch row (which also carries the commit-scoped actions on the branch tip, and its own Hide
 * toggle).
 *
 * Both reuse the SAME configuration as the commit graph's per-branch menu so the three stay in
 * sync — the only sidebar specifics are that they always offer "Checkout" (a sidebar branch isn't
 * tied to a clicked commit) and that Rename opens its own dialog (rendered by the caller from
 * `renameTarget`).
 */
export function useSidebarBranchMenu(repoPath: string) {
  const { t } = useTranslation('git')
  const queryClient = useQueryClient()
  const repo = useRepoDataStore((s) => s.repoCache[repoPath])
  const openPrCreateWith = useRepoUIStore((s) => s.openPrCreateWith)
  const setPin = usePinnedBranchesStore((s) => s.setPin)
  const enableSolo = useSoloModeStore((s) => s.enable)
  const { checkoutBranchWithStashPrompt } = useBranchCheckout()
  // The branch whose rename dialog is open, or null. The caller renders `<RenameBranchDialog>`.
  const [renameTarget, setRenameTarget] = useState<string | null>(null)
  // The remote branch awaiting its delete confirmation, or null. The caller renders
  // `<DeleteRemoteBranchDialog>` — same "own it locally, caller renders it" split as rename above.
  const [pendingDeleteRemoteBranch, setPendingDeleteRemoteBranch] =
    useState<PendingDeleteRemoteBranch>(null)
  // The AI branch explanation opens a right panel driven by shared UI state, so — unlike the
  // rename dialog above — there is nothing for the caller to render: the graph already shows it.
  const setAiPanelTarget = useRepoUIStore((s) => s.setAiPanelTarget)
  // The commit-scoped items of the remote menu reuse the graph's own dialogs through the shared
  // "pending graph action" bridge — the same route the sidebar's tag menu and the command palette
  // take to act on a commit from outside the graph.
  const setPendingGraphSelection = useRepoUIStore((s) => s.setPendingGraphSelection)
  const setPendingGraphAction = useRepoUIStore((s) => s.setPendingGraphAction)
  const hiddenBranches = useRepoDataStore((s) => s.hiddenBranches[repoPath]) ?? EMPTY
  const toggleBranchVisibility = useRepoDataStore((s) => s.toggleBranchVisibility)
  const aiEnabled = useAiEnabled()
  const { targetBranches } = useEffectiveRepoSettings(repoPath)
  const { data: branches } = useBranches(repoPath)

  const currentBranch = repo?.head ?? null
  const isDetached = repo?.isDetached ?? false

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['git-log', repoPath] })
    queryClient.invalidateQueries({ queryKey: ['git-status', repoPath] })
    queryClient.invalidateQueries({ queryKey: ['branches', repoPath] })
  }

  async function run(fn: () => Promise<unknown>, successMsg?: string) {
    try {
      await fn()
      refresh()
      if (successMsg) toast.success(successMsg)
    } catch (err) {
      toast.error(String(err))
    }
  }

  async function copyBranchLink(ref: GitRef) {
    try {
      const name =
        ref.type === 'remote' ? ref.shortName.split('/').slice(1).join('/') : ref.shortName
      const url = await apiGetBranchWebUrl(repoPath, name)
      if (!url) return toast.error(t('gitTree.contextMenu.noRemoteLink'))
      await navigator.clipboard.writeText(url)
      toast.success(t('gitTree.contextMenu.linkCopied'))
    } catch (err) {
      toast.error(String(err))
    }
  }

  async function copyCommitLink(oid: string) {
    try {
      const url = await apiGetCommitWebUrl(repoPath, oid)
      if (!url) return toast.error(t('gitTree.contextMenu.noRemoteLink'))
      await navigator.clipboard.writeText(url)
      toast.success(t('gitTree.contextMenu.linkCopied'))
    } catch (err) {
      toast.error(String(err))
    }
  }

  async function createWorktreeFrom(oid: string) {
    try {
      const destPath = await open({ directory: true, multiple: false })
      if (!destPath || typeof destPath !== 'string') return
      await apiAddWorktree(repoPath, oid, destPath)
      toast.success(t('gitTree.contextMenu.worktreeCreated'))
    } catch (err) {
      toast.error(String(err))
    }
  }

  async function createPatch(oid: string) {
    try {
      const destPath = await save({ defaultPath: `${oid.slice(0, 7)}.patch` })
      if (!destPath) return
      await apiCreatePatch(repoPath, oid, destPath)
      toast.success(t('gitTree.contextMenu.patchCreated'))
    } catch (err) {
      toast.error(String(err))
    }
  }

  /**
   * Opens one of the two branch-scoped AI right panels, resolving the base to read the branch
   * against. Mirrors the graph menu's helper of the same name — both entry points must resolve the
   * base identically, or the same branch would be explained against one base and reviewed against
   * another.
   */
  function openBranchAiPanel(r: GitRef, kind: 'branch' | 'reviewBranch') {
    const baseRef = resolveExplanationBase(
      r.shortName,
      targetBranches,
      // `name`, not `shortName`: the latter strips the remote prefix, so `origin/main` would
      // arrive as `main` and never match a configured `origin/*` merge target.
      (branches ?? []).map((b) => b.name)
    )
    if (!baseRef) {
      toast.error(t('gitTree.branchExplanation.noBase', { branch: r.shortName }))
      return
    }
    setAiPanelTarget({ kind, branch: r.shortName, baseRef })
  }

  /** The branch-scoped callbacks both menus share, bound to one row's branch. */
  function branchActionsFor(branch: GitBranch): BranchMenuActions {
    const ref = branchToRef(branch)
    const rel = (r: GitRef) => ({ branch: r.shortName, current: currentBranch ?? '' })
    return {
      onPull: () => void run(() => apiPullBranch(repoPath), t('gitTree.branchMenu.pulled', rel(ref))),
      onPush: () => void run(() => apiPushBranch(repoPath), t('gitTree.branchMenu.pushed', rel(ref))),
      onFastForward: (r) =>
        void run(
          () => apiFastForwardBranch(repoPath, r.shortName, currentBranch as string),
          t('gitTree.branchMenu.fastForwarded', rel(r))
        ),
      onMergeInto: (r) =>
        void run(
          () => apiMergeBranch(repoPath, r.shortName, currentBranch as string),
          t('gitTree.branchMenu.merged', rel(r))
        ),
      onRebaseOntoBranch: (r) =>
        void run(() => apiRebaseOntoCommit(repoPath, r.commitOid), t('gitTree.branchMenu.rebased', rel(r))),
      onCheckoutBranch: (r) => {
        const target = r.type === 'branch' ? r.shortName : r.commitOid
        void checkoutBranchWithStashPrompt(repoPath, target)
      },
      onOpenWorktreeFrom: (r) => void createWorktreeFrom(r.commitOid),
      onStartPr: (r) => {
        const base = r.type === 'remote' ? r.shortName.split('/').slice(1).join('/') : r.shortName
        openPrCreateWith(currentBranch ?? '', base)
      },
      onExplainBranch: (r) => openBranchAiPanel(r, 'branch'),
      onReviewBranch: (r) => openBranchAiPanel(r, 'reviewBranch'),
      onRenameBranch: (r) => setRenameTarget(r.shortName),
      // Same split as the graph's own branch menu: a remote ref needs a real network push, so it
      // goes through a confirmation dialog rather than deleting outright.
      onDeleteBranch: (r) => {
        if (r.type === 'remote') {
          setPendingDeleteRemoteBranch(remoteBranchTarget(r))
          return
        }
        void run(
          () => apiDeleteBranch(repoPath, r.shortName, { targetOid: r.commitOid, upstream: branch.upstream }),
          t('gitTree.branchMenu.deleted', rel(r))
        )
      },
      onCopyBranchName: (r) =>
        void navigator.clipboard
          .writeText(r.shortName)
          .then(() => toast.success(t('gitTree.branchMenu.nameCopied'))),
      onCopyBranchLink: (r) => void copyBranchLink(r),
      onPinToLeft: (r) => {
        setPin(repoPath, r.shortName, true)
        toast.success(t('gitTree.branchMenu.pinned', rel(r)))
      },
      onSolo: (r) => enableSolo([r.shortName]),
    }
  }

  /** Copy/patch callbacks acting on the branch's tip commit. */
  function copyActionsFor(branch: GitBranch): CommitCopyActions {
    return {
      onCopySha: () =>
        void apiCopyCommitSha(branch.commitOid).then(() =>
          toast.success(t('gitTree.contextMenu.shaCopied'))
        ),
      onCopyLink: () => void copyCommitLink(branch.commitOid),
      onCreatePatch: () => void createPatch(branch.commitOid),
    }
  }

  /** The menu context both rows share. `refs` holds the row's own ref and nothing else. */
  function menuContext(ref: GitRef) {
    return {
      isSingle: true,
      targetCount: 1,
      isMergeCommit: false,
      refs: [ref],
      currentBranch,
      isDetached,
      currentBranchRef: null,
      aiEnabled,
      // Neither sidebar menu renders the commit-recompose section, so these carry the inert values
      // that disable it rather than a computed descendant count.
      primaryShortOid: '',
      descendantCount: 0,
      isOnProtectedBranch: false,
    }
  }

  /**
   * Both rows open the same menu: the branch sections, the commit-scoped ones on the branch tip,
   * and the row's Hide toggle. What differs between a local and a remote branch is decided by the
   * ref's own type inside the builder, not here.
   */
  function openBranchMenu(e: React.MouseEvent, branch: GitBranch) {
    e.preventDefault()
    const ref = branchToRef(branch)

    // Select the branch tip up front, exactly as the tag menu does: the commit-scoped dialogs
    // (create branch / reset / revert / compare / tag) act on the graph's selected commit, so the
    // selection has to be in place well before one of those items is picked. It follows that they
    // do nothing while the graph is unmounted — with the file explorer open, notably.
    setPendingGraphSelection(branch.commitOid)

    const commitActions: BranchTipCommitActions = {
      ...copyActionsFor(branch),
      onCreateBranch: () => setPendingGraphAction({ kind: 'branch' }),
      onCherryPick: () =>
        void run(
          () => apiCherryPickCommit(repoPath, branch.commitOid),
          t('gitTree.contextMenu.cherryPicked')
        ),
      onReset: (mode) => setPendingGraphAction({ kind: 'reset', mode }),
      onRevert: () => setPendingGraphAction({ kind: 'revert' }),
      onCompareToWorkdir: () => setPendingGraphAction({ kind: 'compare' }),
      onCreateTag: () => setPendingGraphAction({ kind: 'tag', annotated: false }),
      onCreateAnnotatedTag: () => setPendingGraphAction({ kind: 'tag', annotated: true }),
    }

    void showNativeMenu(
      buildSidebarBranchMenuSpec(
        ref,
        { ...menuContext(ref), isHidden: hiddenBranches.includes(ref.shortName) },
        {
          ...branchActionsFor(branch),
          onToggleVisibility: (r) => toggleBranchVisibility(repoPath, r.shortName),
        },
        commitActions,
        t
      )
    ).catch(console.error)
  }

  return {
    openBranchMenu,
    renameTarget,
    setRenameTarget,
    pendingDeleteRemoteBranch,
    setPendingDeleteRemoteBranch,
  }
}
