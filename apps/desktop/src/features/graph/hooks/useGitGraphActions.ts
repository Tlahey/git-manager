import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from '@git-manager/ui'
import type { GitGraphNode, GitRef, GitStatus } from '@git-manager/git-types'
import { showNativeMenu } from '../../../api/nativeMenu.api'
import {
  apiCherryPickCommit,
  apiRebaseOntoCommit,
  apiCreateCommitsPatch,
  apiCreateTag,
} from '../../../api/git.api'
import { buildCommitMenuSpec } from '../../../lib/graphContextMenus'
import { shortOid } from '../../../lib/shortOid'
import { useRepoUIStore } from '../../../stores/repoUI.store'
import { useAiEnabled } from '../../../hooks/useAiEnabled'
import { useBranches } from '../../../hooks/useBranches'
import { useBranchCheckout } from '../../../hooks/useBranchCheckout'
import { useEffectiveRepoSettings } from '../../../hooks/useEffectiveRepoSettings'
import { pickSaveDestination } from '../../../lib/pickSaveDestination'
import { descendantsOnCurrentBranch } from '../lib/descendantsOnCurrentBranch'
import { refreshLogAndStatus } from '../lib/graphQueryRefresh'
import { useCommitRowActions } from './useCommitRowActions'
import { useGraphRowMenus } from './useGraphRowMenus'
import { useBranchMenuActions } from './useBranchMenuActions'
import type { PendingAction } from './pendingAction'

type TranslateFn = (key: string, opts?: Record<string, unknown>) => string

export type { PendingAction }

interface UseGitGraphActionsParams {
  repoPath: string
  nodes: GitGraphNode[]
  selected: Set<string>
  setPrimaryOid: (oid: string) => void
  selectSingle: (oid: string) => void
  /** The currently selected commit — used to resolve the `pendingGraphAction` bridge below against
   *  whichever commit is selected when the request arrives. */
  primaryOid: string | null
  hiddenStashes: string[]
  toggleStashVisibility: (repoPath: string, oid: string) => void
  status: GitStatus | undefined
  /** Current HEAD branch name, or `null` when detached — feeds the per-branch submenu rules. */
  currentBranch: string | null
  isDetached: boolean
  t: TranslateFn
}

/**
 * The graph's context menu, and the dialogs it raises.
 *
 * What is left here after the 2026-08 split is the *commit* menu: resolving what the click targets
 * (one row, or the whole selection when the clicked row is part of it), the multi-commit actions
 * that only exist because of that selection, and the assembly of the spec. Everything the menu
 * merely points at lives beside it — {@link useCommitRowActions} for the per-commit effects,
 * {@link useGraphRowMenus} for the four rows that are not commits, {@link useBranchMenuActions} for
 * the per-branch submenus.
 *
 * It also owns the two *bridges* at the bottom, which is why the composition stays a hook: both let
 * out-of-tree UI (the command palette, the sidebar's tag rows) reach a menu that can only be built
 * from the graph's own loaded page.
 */
export function useGitGraphActions({
  repoPath,
  nodes,
  selected,
  setPrimaryOid,
  selectSingle,
  primaryOid,
  hiddenStashes,
  toggleStashVisibility,
  status,
  currentBranch,
  isDetached,
  t,
}: UseGitGraphActionsParams) {
  const queryClient = useQueryClient()
  // Bridges: let out-of-tree UI (the command palette, the sidebar's tag rows) request a
  // commit-scoped dialog/menu without rebuilding it — see the two effects below.
  const pendingGraphAction = useRepoUIStore((s) => s.pendingGraphAction)
  const setPendingGraphAction = useRepoUIStore((s) => s.setPendingGraphAction)
  const pendingCommitMenuOid = useRepoUIStore((s) => s.pendingCommitMenuOid)
  const setPendingCommitMenuOid = useRepoUIStore((s) => s.setPendingCommitMenuOid)
  const setAiPanelTarget = useRepoUIStore((s) => s.setAiPanelTarget)
  const { checkoutBranchWithStashPrompt, checkoutRemoteBranchAsLocal } = useBranchCheckout()
  // Branch-explanation inputs: the master AI switch gates the menu item, and the repo's merge
  // targets + known refs decide which branch the explanation is diffed against.
  const aiEnabled = useAiEnabled()
  const { targetBranches, protectedBranches } = useEffectiveRepoSettings(repoPath)
  const { data: branches } = useBranches(repoPath)

  const [pendingAction, setPendingAction] = useState<PendingAction>(null)
  // Inline tag creation: the commit awaiting a tag name (via the row's refs-column input, or the
  // top bar when that column is hidden), plus whether the tag should be annotated. `null` = idle.
  const [tagDraft, setTagDraft] = useState<{ oid: string; annotated: boolean } | null>(null)

  const commitActions = useCommitRowActions({
    repoPath,
    nodes,
    status,
    checkoutBranchWithStashPrompt,
    t,
  })
  const { openFixupWindow } = commitActions

  const openRowMenu = useGraphRowMenus({
    repoPath,
    nodes,
    status,
    hiddenStashes,
    toggleStashVisibility,
    selectSingle,
    aiEnabled,
    t,
  })

  const branchActions = useBranchMenuActions({
    repoPath,
    currentBranch,
    branches,
    targetBranches,
    setPendingAction,
    createWorktree: (oid) => void commitActions.createWorktree(oid),
    checkoutBranchWithStashPrompt,
    checkoutRemoteBranchAsLocal,
    t,
  })

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

    // The WIP row, a worktree's `WIP:<path>` row, the CONFLICT row and a stash each own their menu
    // outright; only an ordinary commit falls through to the rest of this function.
    if (openRowMenu(oid)) return

    const clickedNode = nodes.find((n) => n.commit.oid === oid)

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
        refreshLogAndStatus(queryClient, repoPath)
        toast.success(t('gitTree.contextMenu.cherryPicked'))
      } catch (err) {
        toast.error(String(err))
      }
    }

    async function handleCreatePatchSelection() {
      try {
        const destPath = await pickSaveDestination(
          `${shortOid(oid)}-and-${targets.length - 1}-more.patch`
        )
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
        refreshLogAndStatus(queryClient, repoPath)
        toast.success(t('gitTree.contextMenu.rebased'))
      } catch (err) {
        toast.error(String(err))
      }
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
          onCheckout: () => commitActions.checkoutDetached(oid),
          onCreateWorktree: () => commitActions.createWorktree(oid),
          onCreateBranch: () => setPendingAction({ kind: 'branch' }),
          onCherryPick: () => commitActions.cherryPick(oid),
          onReset: (mode) => setPendingAction({ kind: 'reset', mode }),
          onRevert: () => setPendingAction({ kind: 'revert' }),
          onCopySha: () => void commitActions.copySha(oid),
          onCopyLink: () => void commitActions.copyWebLink(oid),
          onCreatePatch: () => void commitActions.createPatch(oid),
          onCreateTag: () => setTagDraft({ oid, annotated: false }),
          onCreateAnnotatedTag: () => setTagDraft({ oid, annotated: true }),
          onCherryPickSelection: () => void handleCherryPickSelection(),
          onRebaseOntoCommit: () => void handleRebaseOntoCommit(),
          onCreatePatchSelection: () => void handleCreatePatchSelection(),
          onCompareToWorkdir: () => setPendingAction({ kind: 'compare' }),
          // Merge commits only (the menu gates it): opens the same diff viewer scoped to one side
          // of the merge. 1-based here, as in `git revert -m` and in the label the user just read.
          onCompareToParent: (parentNumber) =>
            setPendingAction({ kind: 'compareParent', parentNumber }),
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

  // Bridge: lets out-of-tree UI (the command palette) trigger a commit-scoped action on the
  // currently selected commit. Dialog-based actions forward into `setPendingAction` (which opens
  // the matching dialog against `primaryOid`); `fixup` instead opens the dedicated "Commit
  // Changes" window directly (same as the native menu's `onFixup`), since there's no in-page
  // dialog to route it through. Either way, we clear the pending action once handled.
  useEffect(() => {
    if (pendingGraphAction && primaryOid) {
      if (pendingGraphAction.kind === 'fixup') {
        void openFixupWindow(primaryOid).catch(console.error)
      } else if (pendingGraphAction.kind === 'tag') {
        // Tag creation is an inline input on the row (or top bar), not a dialog.
        setTagDraft({ oid: primaryOid, annotated: pendingGraphAction.annotated })
      } else {
        setPendingAction(pendingGraphAction)
      }
      setPendingGraphAction(null)
    }
  }, [
    pendingGraphAction,
    primaryOid,
    setPendingAction,
    setTagDraft,
    setPendingGraphAction,
    openFixupWindow,
  ])

  // The sidebar's tag rows ask for a commit's full menu through the store rather than rebuilding
  // it: the menu is assembled from this graph's loaded page, so the request comes here instead of
  // the menu going there. The commit is selected first, so the dialogs its items raise (reset,
  // revert, create branch) act on the tag's commit and not on whatever was selected before.
  useEffect(() => {
    if (!pendingCommitMenuOid) return
    selectSingle(pendingCommitMenuOid)
    void openMenuAt(undefined, pendingCommitMenuOid)
    setPendingCommitMenuOid(null)
    // `openMenuAt` closes over nearly every param/store value this hook reads, so it's a new
    // function every render — only `pendingCommitMenuOid` itself should retrigger this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCommitMenuOid])

  return {
    pendingAction,
    setPendingAction,
    tagDraft,
    setTagDraft,
    submitTagDraft,
    cancelTagDraft,
    openMenuAt,
    handleCommitWip: commitActions.commitWip,
    openFixupWindow,
  }
}
