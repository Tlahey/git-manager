import { useQueryClient } from '@tanstack/react-query'
import { toast } from '@git-manager/ui'
import type { GitBranch, GitRef } from '@git-manager/git-types'
import {
  apiGetBranchWebUrl,
  apiPullBranch,
  apiPushBranch,
  apiFastForwardBranch,
  apiMergeBranch,
  apiDeleteBranch,
  apiRebaseOntoCommit,
  apiSetBranchUpstream,
} from '../../../api/git.api'
import { remoteBranchTarget, type BranchMenuActions } from '../../../lib/graphContextMenus'
import { resolveExplanationBase } from '../../../lib/branchExplanationBase'
import { resolveDefaultUpstream } from '../../../lib/branchUpstream'
import { useRepoUIStore } from '../../../stores/repoUI.store'
import { useSwitchBranch } from '../../../hooks/useSwitchBranch'
import { usePinnedBranchesStore } from '../../../stores/pinned-branches.store'
import { useSoloModeStore } from '../../../stores/soloMode.store'
import { refreshLogAndStatus } from '../lib/graphQueryRefresh'
import type { PendingAction } from './pendingAction'

type TranslateFn = (key: string, opts?: Record<string, unknown>) => string

interface UseBranchMenuActionsParams {
  repoPath: string
  /** Current HEAD branch name, or `null` when detached — every "into the current branch" action
   *  reads it, and the menu spec is what gates those items out when it is null. */
  currentBranch: string | null
  /** The repo's branches, for upstream resolution and for the AI panel's base. */
  branches: GitBranch[] | undefined
  /** Configured merge targets, tried in order when resolving what a branch is read against. */
  targetBranches: string[]
  setPendingAction: (action: PendingAction) => void
  /** Shared with the commit row's own "create worktree here" — one flow, one folder picker. */
  createWorktree: (oid: string) => void
  /** Commit-scoped checkout only — a tag row's tip, which detaches HEAD on `repoPath`. Switching
   *  onto a *branch* goes through `useSwitchBranch` instead, since that targets the base project
   *  rather than the viewed worktree. */
  checkoutBranchWithStashPrompt: (repoPath: string, targetRef: string) => Promise<boolean>
  t: TranslateFn
}

/**
 * What every per-branch submenu item of the commit menu actually *does*.
 *
 * Which submenus exist and what they contain is decided by `buildCommitMenuSpec` (the configurable
 * rules live in `lib/graphContextMenus/`); this is only the wiring of the effects. The split is
 * worth keeping: the rules are what a reader checks against the UI, the effects are what a reviewer
 * checks against git, and they change for unrelated reasons.
 *
 * The same object is handed to the commit menu whatever row was clicked, because none of these
 * items depends on the clicked commit — they act on the `GitRef` the submenu was opened for.
 */
export function useBranchMenuActions({
  repoPath,
  currentBranch,
  branches,
  targetBranches,
  setPendingAction,
  createWorktree,
  checkoutBranchWithStashPrompt,
  t,
}: UseBranchMenuActionsParams): BranchMenuActions {
  const queryClient = useQueryClient()
  const { switchBranch, switchRemoteBranch } = useSwitchBranch()
  const openPrCreateWith = useRepoUIStore((s) => s.openPrCreateWith)
  const setAiPanelTarget = useRepoUIStore((s) => s.setAiPanelTarget)
  // The branch comparison dialog is mounted by `RepoView`, not by the graph's overlay manager: it
  // is about two refs, not about the selected commit (see the store's `compareRefsTarget`).
  const setCompareRefsTarget = useRepoUIStore((s) => s.setCompareRefsTarget)
  // Shared state, not `useState` — see `pendingRemoteBranchDelete` on the repoUI store: the graph
  // opens this dialog but `RepoWorkspace` mounts it, so it survives the file explorer unmounting
  // the graph.
  const setPendingDeleteRemoteBranch = useRepoUIStore((s) => s.setPendingRemoteBranchDelete)
  const setPin = usePinnedBranchesStore((s) => s.setPin)
  const enableSolo = useSoloModeStore((s) => s.enable)

  /** Runs a git action, refreshing the graph on success and surfacing failures as a toast. */
  async function run(fn: () => Promise<unknown>, successMsg?: string) {
    try {
      await fn()
      refreshLogAndStatus(queryClient, repoPath)
      queryClient.invalidateQueries({ queryKey: ['branches', repoPath] })
      if (successMsg) toast.success(successMsg)
    } catch (err) {
      toast.error(String(err))
    }
  }

  async function copyBranchName(name: string) {
    await navigator.clipboard.writeText(name)
    toast.success(t('gitTree.branchMenu.nameCopied'))
  }

  async function copyBranchLink(ref: GitRef) {
    try {
      // The GitHub tree URL wants the branch name without the remote prefix (origin/x → x).
      const name =
        ref.type === 'remote' ? ref.shortName.split('/').slice(1).join('/') : ref.shortName
      const url = await apiGetBranchWebUrl(repoPath, name)
      if (!url) {
        toast.error(t('gitTree.contextMenu.noRemoteLink'))
        return
      }
      await navigator.clipboard.writeText(url)
      toast.success(t('gitTree.contextMenu.linkCopied'))
    } catch (err) {
      toast.error(String(err))
    }
  }

  /**
   * Opens one of the two branch-scoped AI right panels on `ref`, resolving the base it should be
   * read against first.
   *
   * Shared by the explanation and the review because the base resolution is the whole subtlety and
   * must not drift between them: it looks only at local refs (the panel has to work on a repo with
   * no remote and no GitHub token), and a branch with no resolvable merge target opens nothing
   * rather than silently comparing against something arbitrary.
   */
  function openBranchAiPanel(ref: GitRef, kind: 'branch' | 'reviewBranch') {
    const baseRef = resolveExplanationBase(
      ref.shortName,
      targetBranches,
      // `name`, not `shortName`: the latter strips the remote prefix, so `origin/main` would
      // arrive as `main` and never match a configured `origin/*` merge target.
      (branches ?? []).map((b) => b.name)
    )
    if (!baseRef) {
      toast.error(t('gitTree.branchExplanation.noBase', { branch: ref.shortName }))
      return
    }
    // Straight to the shared UI state rather than through `pendingAction`: this opens a right
    // panel, not one of the overlay manager's dialogs, and the sidebar menu opens the same one.
    setAiPanelTarget({ kind, branch: ref.shortName, baseRef })
  }

  const relParams = (ref: GitRef) => ({ branch: ref.shortName, current: currentBranch ?? '' })

  return {
    onPull: (ref) =>
      void run(() => apiPullBranch(repoPath), t('gitTree.branchMenu.pulled', relParams(ref))),
    onPush: (ref) =>
      void run(() => apiPushBranch(repoPath), t('gitTree.branchMenu.pushed', relParams(ref))),
    // An unambiguous origin/<name> match (see resolveDefaultUpstream) applies straight away;
    // anything else opens the picker dialog so the user chooses instead of the app guessing.
    onSetUpstream: (ref) => {
      const target = resolveDefaultUpstream(ref.shortName, branches ?? [])
      if (target) {
        void run(
          () => apiSetBranchUpstream(repoPath, ref.shortName, target),
          t('gitTree.branchMenu.upstreamSet', { branch: ref.shortName, upstream: target })
        )
      } else {
        setPendingAction({ kind: 'setUpstream', branch: ref.shortName })
      }
    },
    onFastForward: (ref) =>
      void run(
        () => apiFastForwardBranch(repoPath, ref.shortName, currentBranch as string),
        t('gitTree.branchMenu.fastForwarded', relParams(ref))
      ),
    onMergeInto: (ref) =>
      void run(
        () => apiMergeBranch(repoPath, ref.shortName, currentBranch as string),
        t('gitTree.branchMenu.merged', relParams(ref))
      ),
    onRebaseOntoBranch: (ref) =>
      void run(
        () => apiRebaseOntoCommit(repoPath, ref.commitOid),
        t('gitTree.branchMenu.rebased', relParams(ref))
      ),
    // A remote ref switches onto its LOCAL branch, creating it (tracking that remote) if it
    // doesn't exist — `git switch x`, not the detached `git checkout origin/x`. See
    // `checkoutRemoteBranchAsLocal`.
    //
    // Both branch cases land on the base project (`useSwitchBranch`); only a tag's tip still
    // detaches on `repoPath`, because a detached HEAD belongs to the worktree being looked at.
    onCheckoutBranch: (ref) => {
      if (ref.type === 'remote') {
        void switchRemoteBranch(ref.shortName)
      } else if (ref.type === 'branch') {
        void switchBranch(ref.shortName)
      } else {
        void checkoutBranchWithStashPrompt(repoPath, ref.commitOid)
      }
    },
    onOpenWorktreeFrom: (ref) => createWorktree(ref.commitOid),
    // PR-create flow prefilled with head = current branch, base = the remote branch (without
    // its remote prefix) — the flow itself handles pushing.
    onStartPr: (ref) => {
      const base =
        ref.type === 'remote' ? ref.shortName.split('/').slice(1).join('/') : ref.shortName
      openPrCreateWith(currentBranch ?? '', base)
    },
    // Opens the branch-vs-branch diff from the clicked branch towards the checked-out one — the
    // usual question ("what does my work change compared to that branch?"). Both sides stay
    // re-pickable in the dialog, so a detached HEAD just starts on the same ref twice.
    onCompareWithBranch: (ref) =>
      setCompareRefsTarget({ baseRef: ref.shortName, headRef: currentBranch ?? ref.shortName }),
    // Both branch-scoped AI panels read the branch against the repo's merge target, resolved from
    // local refs only — they must open on a repo with no remote and no GitHub token.
    onExplainBranch: (ref) => openBranchAiPanel(ref, 'branch'),
    onReviewBranch: (ref) => openBranchAiPanel(ref, 'reviewBranch'),
    onRenameBranch: (ref) => setPendingAction({ kind: 'renameBranch', branch: ref.shortName }),
    // A remote ref is never deleted outright from the menu: it needs a real network push
    // (`git push origin :refs/heads/<name>`), so it goes through a confirmation dialog instead —
    // unlike a local branch, which stays instant (git itself already refuses an unmerged one).
    onDeleteBranch: (ref) => {
      if (ref.type === 'remote') {
        setPendingDeleteRemoteBranch(remoteBranchTarget(ref))
        return
      }
      void run(
        () => apiDeleteBranch(repoPath, ref.shortName, { targetOid: ref.commitOid }),
        t('gitTree.branchMenu.deleted', relParams(ref))
      )
    },
    onCopyBranchName: (ref) => void copyBranchName(ref.shortName),
    onCopyBranchLink: (ref) => void copyBranchLink(ref),
    onPinToLeft: (ref) => {
      setPin(repoPath, ref.shortName, true)
      toast.success(t('gitTree.branchMenu.pinned', relParams(ref)))
    },
    onSolo: (ref) => enableSolo([ref.shortName]),
  }
}
