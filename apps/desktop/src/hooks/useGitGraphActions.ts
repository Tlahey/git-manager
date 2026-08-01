import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { mutate } from 'swr'
import { open, save } from '@tauri-apps/plugin-dialog'
import { toast } from '@git-manager/ui'
import type { GitGraphNode, GitRef, GitStatus } from '@git-manager/git-types'
import { showNativeMenu } from '../api/nativeMenu.api'
import {
  apiStashApply,
  apiStashPop,
  apiStashDrop,
  apiStashPush,
  apiCreateCommit,
  apiStageAll,
  apiUnstageAll,
  apiCopyCommitSha,
  apiCherryPickCommit,
  apiRebaseOntoCommit,
  apiGetCommitWebUrl,
  apiGetBranchWebUrl,
  apiCreatePatch,
  apiCreateCommitsPatch,
  apiPullBranch,
  apiPushBranch,
  apiFastForwardBranch,
  apiMergeBranch,
  apiDeleteBranch,
  apiCreateTag,
  apiSetBranchUpstream,
} from '../api/git.api'
import { apiAddWorktree } from '../api/worktree.api'
import {
  buildCommitMenuSpec,
  buildWipMenuSpec,
  buildStashMenuSpec,
  type BranchMenuActions,
} from '../lib/graphContextMenus'
import { resolveExplanationBase } from '../lib/branchExplanationBase'
import { resolveDefaultUpstream } from '../lib/branchUpstream'
import { useRepoUIStore, type GraphCommitAction } from '../stores/repoUI.store'
import { usePinnedBranchesStore } from '../stores/pinned-branches.store'
import { useSoloModeStore } from '../stores/soloMode.store'
import { useAiEnabled } from './useAiEnabled'
import { useBranches } from './useBranches'
import { useBranchCheckout } from './useBranchCheckout'
import { useEffectiveRepoSettings } from './useEffectiveRepoSettings'

type TranslateFn = (key: string, opts?: Record<string, unknown>) => string

/**
 * How many commits descend from `oid` on the current branch — the count the "recompose children"
 * menu entry names, and the number of commits that would be *rewritten* beyond the clicked one.
 *
 * Walks parents down from the branch tip rather than children up from the commit, because the graph
 * nodes only carry `parentOids`. First-parent only: that is the branch's own line, and it is exactly
 * the set an interactive rebase from this commit would replay.
 *
 * Returns 0 when the commit is the tip, is not on the branch's first-parent line, or when the tip is
 * outside the loaded page — all cases where offering to rewrite "N children" would be a guess.
 */
export function descendantsOnCurrentBranch(
  nodes: GitGraphNode[],
  oid: string,
  branchTipOid: string | undefined
): number {
  if (!branchTipOid || branchTipOid === oid) return 0

  const byOid = new Map(nodes.map((n) => [n.commit.oid, n]))
  let cursor = byOid.get(branchTipOid)
  let count = 0

  while (cursor && cursor.commit.oid !== oid) {
    count += 1
    const firstParent = cursor.commit.parentOids[0]
    cursor = firstParent ? byOid.get(firstParent) : undefined
  }

  // Ran off the loaded page without meeting the commit: it is not on this line, as far as we know.
  return cursor ? count : 0
}

interface UseGitGraphActionsParams {
  repoPath: string
  nodes: GitGraphNode[]
  selected: Set<string>
  setPrimaryOid: (oid: string) => void
  selectSingle: (oid: string) => void
  hiddenStashes: string[]
  toggleStashVisibility: (repoPath: string, oid: string) => void
  status: GitStatus | undefined
  /** Current HEAD branch name, or `null` when detached — feeds the per-branch submenu rules. */
  currentBranch: string | null
  isDetached: boolean
  t: TranslateFn
}

/** The graph's local pending-dialog action: the shared {@link GraphCommitAction} union, or `null`
 *  for "no dialog open". The store's `pendingGraphAction` bridge feeds straight into this. */
export type PendingAction = GraphCommitAction | null

/**
 * Encapsulates the imperative actions triggered from the graph: native context menu
 * (commit/stash), SHA copy, fixup, and WIP commit.
 */
export function useGitGraphActions({
  repoPath,
  nodes,
  selected,
  setPrimaryOid,
  selectSingle,
  hiddenStashes,
  toggleStashVisibility,
  status,
  currentBranch,
  isDetached,
  t,
}: UseGitGraphActionsParams) {
  const queryClient = useQueryClient()
  const setEditingOid = useRepoUIStore((s) => s.setEditingOid)
  const openPrCreateWith = useRepoUIStore((s) => s.openPrCreateWith)
  const setAiPanelTarget = useRepoUIStore((s) => s.setAiPanelTarget)
  const setPin = usePinnedBranchesStore((s) => s.setPin)
  const enableSolo = useSoloModeStore((s) => s.enable)
  const { checkoutBranchWithStashPrompt } = useBranchCheckout()
  // Branch-explanation inputs: the master AI switch gates the menu item, and the repo's merge
  // targets + known refs decide which branch the explanation is diffed against.
  const aiEnabled = useAiEnabled()
  const { targetBranches, protectedBranches } = useEffectiveRepoSettings(repoPath)
  const { data: branches } = useBranches(repoPath)

  const [pendingAction, setPendingAction] = useState<PendingAction>(null)
  // Inline tag creation: the commit awaiting a tag name (via the row's refs-column input, or the
  // top bar when that column is hidden), plus whether the tag should be annotated. `null` = idle.
  const [tagDraft, setTagDraft] = useState<{ oid: string; annotated: boolean } | null>(null)

  function refreshLogAndStatus() {
    queryClient.invalidateQueries({ queryKey: ['git-log', repoPath] })
    queryClient.invalidateQueries({ queryKey: ['git-status', repoPath] })
  }

  async function handleCopySha(oid: string) {
    await apiCopyCommitSha(oid)
    toast.success(t('gitTree.contextMenu.shaCopied'))
  }

  /** Opens the dedicated "Commit Changes" fixup window (same pattern as the merge window). */
  async function openFixupWindow(oid: string) {
    const node = nodes.find((n) => n.commit.oid === oid)
    if (!node) return
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')
    const safeLabel = `fixup-${repoPath.replace(/[^a-zA-Z0-9_-]/g, '-')}-${node.commit.shortOid}`
    const url =
      `/?window=fixup&repoPath=${encodeURIComponent(repoPath)}` +
      `&oid=${encodeURIComponent(oid)}` +
      `&shortOid=${encodeURIComponent(node.commit.shortOid)}` +
      `&subject=${encodeURIComponent(node.commit.subject)}`

    const existing = await WebviewWindow.getByLabel(safeLabel)
    if (existing) {
      await existing.show()
      await existing.setFocus()
    } else {
      new WebviewWindow(safeLabel, {
        url,
        title: `Commit Changes - fixup! ${node.commit.subject}`,
        width: 1200,
        height: 850,
        minWidth: 900,
        minHeight: 600,
        decorations: true,
      })
    }
  }

  /** Detaches HEAD onto `oid`. The hook refreshes the graph queries itself on success, and falls
   * back to the stash prompt when uncommitted changes block the checkout. */
  async function handleCheckoutDetached(oid: string) {
    await checkoutBranchWithStashPrompt(repoPath, oid)
  }

  async function handleCreateWorktree(oid: string) {
    try {
      const destPath = await open({ directory: true, multiple: false })
      if (!destPath || typeof destPath !== 'string') return
      await apiAddWorktree(repoPath, oid, destPath)
      toast.success(t('gitTree.contextMenu.worktreeCreated'))
    } catch (err) {
      toast.error(String(err))
    }
  }

  async function handleCherryPick(oid: string) {
    try {
      await apiCherryPickCommit(repoPath, oid)
      refreshLogAndStatus()
      toast.success(t('gitTree.contextMenu.cherryPicked'))
    } catch (err) {
      toast.error(String(err))
    }
  }

  async function handleCopyWebLink(oid: string) {
    try {
      const url = await apiGetCommitWebUrl(repoPath, oid)
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

  async function handleCreatePatch(oid: string) {
    try {
      const destPath = await save({ defaultPath: `${oid.slice(0, 7)}.patch` })
      if (!destPath) return
      await apiCreatePatch(repoPath, oid, destPath)
      toast.success(t('gitTree.contextMenu.patchCreated'))
    } catch (err) {
      toast.error(String(err))
    }
  }

  async function handleCommitWip(message: string) {
    if (!message.trim()) return
    try {
      const stagedCount = status?.staged?.length || 0
      if (stagedCount === 0) {
        await apiStageAll(repoPath)
      }
      await apiCreateCommit(repoPath, message)
      queryClient.invalidateQueries({ queryKey: ['git-status', repoPath] })
      queryClient.invalidateQueries({ queryKey: ['git-log', repoPath] })
    } catch (err) {
      toast.error(String(err))
    }
  }

  /** Creates the tag currently being drafted inline (see {@link tagDraft}). Annotated tags are
   *  created with an empty message — the inline flow collects a name only. */
  async function submitTagDraft(name: string) {
    const draft = tagDraft
    if (!draft) return
    const trimmed = name.trim()
    if (!trimmed) return
    try {
      await apiCreateTag(repoPath, trimmed, draft.oid, draft.annotated ? '' : undefined)
      queryClient.invalidateQueries({ queryKey: ['tags', repoPath] })
      queryClient.invalidateQueries({ queryKey: ['git-log', repoPath] })
      toast.success(t('gitTree.contextMenu.tagCreated'))
      setTagDraft(null)
    } catch (err) {
      toast.error(String(err))
    }
  }

  function cancelTagDraft() {
    setTagDraft(null)
  }

  // `e` is optional: the menu is also opened without a click, from the sidebar's tag rows through
  // the `pendingCommitMenuOid` bridge. The native menu pops at the cursor either way, so the event
  // is only ever needed to stop the originating click from also selecting the row.
  async function openMenuAt(e: React.MouseEvent | undefined, oid: string) {
    e?.preventDefault()
    e?.stopPropagation()

    // The local WIP row gets its own menu (stash / stage / unstage the work in progress). The
    // other synthetic rows (a worktree's `WIP:<path>`, the CONFLICT row) are not commit-action
    // targets — no menu.
    if (oid === 'WIP') {
      async function runWip(fn: () => Promise<unknown>, successMsg?: string) {
        try {
          await fn()
          refreshLogAndStatus()
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
            hasUnstaged:
              (status?.unstaged.length ?? 0) + (status?.untracked.length ?? 0) > 0,
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
      return
    }
    if (oid === 'CONFLICT' || oid.startsWith('WIP:')) return

    // Check if this is a stash commit
    const clickedNode = nodes.find((n) => n.commit.oid === oid)
    const stashRef = clickedNode?.refs.find((r) => r.type === 'stash')

    if (stashRef) {
      const stashMatch = stashRef.shortName.match(/stash@\{(\d+)\}/)
      const index = stashMatch ? parseInt(stashMatch[1], 10) : 0

      selectSingle(oid)

      async function runStash(fn: () => Promise<unknown>) {
        try {
          await fn()
          mutate(['git-stashes', repoPath])
          queryClient.invalidateQueries({ queryKey: ['git-log', repoPath] })
          queryClient.invalidateQueries({ queryKey: ['git-status', repoPath] })
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
      return
    }

    let targets: string[]
    if (selected.has(oid)) {
      targets = Array.from(selected)
      setPrimaryOid(oid)
    } else {
      selectSingle(oid)
      targets = [oid]
    }

    const isSingle = targets.length === 1
    // Selected commits in graph order → oldest first, for cherry-pick and multi-patch (git applies
    // and formats oldest→newest). `nodes` are newest-first, so filter-then-reverse.
    const selectedOldestFirst = nodes
      .filter((n) => targets.includes(n.commit.oid))
      .map((n) => n.commit.oid)
      .reverse()

    async function handleCherryPickSelection() {
      try {
        for (const target of selectedOldestFirst) {
          await apiCherryPickCommit(repoPath, target)
        }
        refreshLogAndStatus()
        toast.success(t('gitTree.contextMenu.cherryPicked'))
      } catch (err) {
        toast.error(String(err))
      }
    }

    async function handleCreatePatchSelection() {
      try {
        const destPath = await save({ defaultPath: `${oid.slice(0, 7)}-and-${targets.length - 1}-more.patch` })
        if (!destPath) return
        await apiCreateCommitsPatch(repoPath, selectedOldestFirst, destPath)
        toast.success(t('gitTree.contextMenu.patchCreated'))
      } catch (err) {
        toast.error(String(err))
      }
    }

    async function handleRebaseOntoCommit() {
      try {
        await apiRebaseOntoCommit(repoPath, oid)
        refreshLogAndStatus()
        toast.success(t('gitTree.contextMenu.rebased'))
      } catch (err) {
        toast.error(String(err))
      }
    }

    // ── Per-branch submenu actions ────────────────────────────────────────────
    // Which submenus exist and what they contain is decided by `buildCommitMenuSpec` (the
    // configurable rules live in `lib/graphContextMenus.ts`); here we only wire the effects.

    /** Runs a git action, refreshing the graph on success and surfacing failures as a toast. */
    async function run(fn: () => Promise<unknown>, successMsg?: string) {
      try {
        await fn()
        refreshLogAndStatus()
        queryClient.invalidateQueries({ queryKey: ['branches', repoPath] })
        if (successMsg) toast.success(successMsg)
      } catch (err) {
        toast.error(String(err))
      }
    }

    async function handleCopyBranchName(name: string) {
      await navigator.clipboard.writeText(name)
      toast.success(t('gitTree.branchMenu.nameCopied'))
    }

    async function handleCopyBranchLink(ref: GitRef) {
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
    const branchActions: BranchMenuActions = {
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
      // A remote ref checks out its commit (detached) — exactly what `git checkout origin/x` does.
      onCheckoutBranch: (ref) => {
        const target = ref.type === 'branch' ? ref.shortName : ref.commitOid
        void checkoutBranchWithStashPrompt(repoPath, target)
      },
      onOpenWorktreeFrom: (ref) => void handleCreateWorktree(ref.commitOid),
      // PR-create flow prefilled with head = current branch, base = the remote branch (sans
      // remote prefix) — the flow itself handles pushing.
      onStartPr: (ref) => {
        const base =
          ref.type === 'remote' ? ref.shortName.split('/').slice(1).join('/') : ref.shortName
        openPrCreateWith(currentBranch ?? '', base)
      },
      // Both branch-scoped AI panels read the branch against the repo's merge target, resolved from
      // local refs only — they must open on a repo with no remote and no GitHub token.
      onExplainBranch: (ref) => openBranchAiPanel(ref, 'branch'),
      onReviewBranch: (ref) => openBranchAiPanel(ref, 'reviewBranch'),
      onRenameBranch: (ref) => setPendingAction({ kind: 'renameBranch', branch: ref.shortName }),
      onDeleteBranch: (ref) =>
        void run(
          () => apiDeleteBranch(repoPath, ref.shortName, { targetOid: ref.commitOid }),
          t('gitTree.branchMenu.deleted', relParams(ref))
        ),
      onCopyBranchName: (ref) => void handleCopyBranchName(ref.shortName),
      onCopyBranchLink: (ref) => void handleCopyBranchLink(ref),
      onPinToLeft: (ref) => {
        setPin(repoPath, ref.shortName, true)
        toast.success(t('gitTree.branchMenu.pinned', relParams(ref)))
      },
      onSolo: (ref) => enableSolo([ref.shortName]),
    }

    // The current branch as a ref pointing at its OWN tip (the node carrying that branch label),
    // so a plain history commit still flattens to the branch menu relative to HEAD. Null when
    // detached or when the tip isn't in the loaded page.
    const currentBranchTip = currentBranch
      ? nodes.find((n) => n.refs.some((r) => r.type === 'branch' && r.shortName === currentBranch))
      : undefined
    const currentBranchRef: GitRef | null =
      currentBranch && !isDetached && currentBranchTip
        ? {
            name: `refs/heads/${currentBranch}`,
            shortName: currentBranch,
            type: 'branch',
            commitOid: currentBranchTip.commit.oid,
          }
        : null

    void showNativeMenu(
      buildCommitMenuSpec(
        {
          isSingle,
          targetCount: targets.length,
          isMergeCommit: (clickedNode?.commit.parentOids.length ?? 0) > 1,
          refs: clickedNode?.refs ?? [],
          currentBranch,
          isDetached,
          currentBranchRef,
          aiEnabled,
          primaryShortOid: clickedNode?.commit.shortOid ?? '',
          descendantCount: descendantsOnCurrentBranch(nodes, oid, currentBranchTip?.commit.oid),
          isOnProtectedBranch: currentBranch !== null && protectedBranches.includes(currentBranch),
        },
        {
          onCheckout: () => handleCheckoutDetached(oid),
          onCreateWorktree: () => handleCreateWorktree(oid),
          onCreateBranch: () => setPendingAction({ kind: 'branch' }),
          onCherryPick: () => handleCherryPick(oid),
          onReset: (mode) => setPendingAction({ kind: 'reset', mode }),
          onRevert: () => setPendingAction({ kind: 'revert' }),
          onCopySha: () => void handleCopySha(oid),
          onCopyLink: () => void handleCopyWebLink(oid),
          onCreatePatch: () => void handleCreatePatch(oid),
          onCreateTag: () => setTagDraft({ oid, annotated: false }),
          onCreateAnnotatedTag: () => setTagDraft({ oid, annotated: true }),
          onCherryPickSelection: () => void handleCherryPickSelection(),
          onRebaseOntoCommit: () => void handleRebaseOntoCommit(),
          onCreatePatchSelection: () => void handleCreatePatchSelection(),
          onCompareToWorkdir: () => setPendingAction({ kind: 'compare' }),
          // Explains the clicked commit itself — the metadata travels with the target so the panel
          // can show a header before the diff has even been fetched.
          // Rewriting messages is gated in the menu (protected branch, detached HEAD, AI off); the
          // dialog re-states what will be rewritten and only then writes anything.
          onRecomposeCommit: (includeChildren) =>
            setPendingAction({ kind: 'recompose', includeChildren }),
          onExplainCommit: () => {
            if (!clickedNode) return
            const { commit } = clickedNode
            setAiPanelTarget({
              kind: 'commit',
              oid: commit.oid,
              shortOid: commit.shortOid,
              subject: commit.subject,
              body: commit.body ?? '',
              author: commit.author?.name ?? '',
              parentCount: commit.parentOids.length,
            })
          },
        },
        branchActions,
        t
      )
    ).catch(console.error)
  }

  return {
    pendingAction,
    setPendingAction,
    tagDraft,
    setTagDraft,
    submitTagDraft,
    cancelTagDraft,
    openMenuAt,
    handleCommitWip,
    openFixupWindow,
  }
}
