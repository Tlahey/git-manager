import { useCallback, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from '@git-manager/i18n'
import { toast } from '@git-manager/ui'
import type { GitGraphNode } from '@git-manager/git-types'
import { apiListRebaseCommits, apiRunInteractiveRebase, apiGetRebaseState } from '../api/git.api'
import { validatePlan, toTodoSteps } from '../components/rebase-editor/rebasePlan'
import {
  buildReorderPlan,
  collectReorderableOids,
  findHeadOid,
  firstPublishedIndex,
  planOperation,
  type CommitDropTarget,
  type CommitReorderOperation,
} from '../components/git-graph/commitReorder'
import type { CommitDragContextValue } from '../components/git-graph/useCommitRowDrag'

/** One commit as the confirmation dialog needs to name it. */
export interface ReorderCommitSummary {
  oid: string
  shortOid: string
  subject: string
}

/** A drop the user has made and not yet confirmed. */
export interface PendingCommitReorder {
  operation: CommitReorderOperation
  /** The dragged commits, newest first. */
  sources: ReorderCommitSummary[]
  /** The commit the drop was aimed at — the combine target, or the gap's neighbour. */
  target: ReorderCommitSummary
  /** The whole rewritten range in its resulting order, newest first — the dialog's preview. */
  preview: ReorderCommitSummary[]
  /** True when the rewrite reaches commits already pushed to a remote (force-push territory). */
  rewritesPublished: boolean
}

/**
 * Drag-and-drop reordering and combining of commits, straight in the graph.
 *
 * Dropping a commit *between* two others moves it there; dropping it *onto* another folds the two
 * together. Either way the gesture is turned into a `git rebase -i` todo (see
 * `components/git-graph/commitReorder.ts` for the plan, and `rebase-editor/rebasePlan.ts` for the
 * transitions both this and the "Rebasing Commit" window share) and only runs once the user has
 * confirmed it in {@link ../components/git-graph/CommitReorderDialog CommitReorderDialog}.
 *
 * Conflicts are not handled here, on purpose: `run_interactive_rebase` treats a conflict pause as a
 * success (`err_unless_paused`), so the app's existing paused-rebase UI — the CONFLICT row, the
 * progress rail and `ConflictResolutionPanel` — takes over exactly as it does for a rebase started
 * any other way. All this hook adds is telling the user, once, that it happened.
 */
export function useCommitReorderDrag({
  repoPath,
  nodes,
  selected,
  headBranchName,
  isRebasing,
  enabled = true,
}: {
  repoPath: string
  nodes: GitGraphNode[]
  /** The graph's current multi-selection. */
  selected: Set<string>
  headBranchName: string | null
  /** A rebase already in progress — every drop is refused until it settles. */
  isRebasing: boolean
  /**
   * False while the graph is showing something other than the repository's real history — today,
   * the undo/redo timeline's preview. Rewriting from a hypothetical graph would submit a plan
   * built against commits the branch does not point at, so nothing is draggable at all.
   */
  enabled?: boolean
}) {
  const { t } = useTranslation('git')
  const queryClient = useQueryClient()
  const [pending, setPending] = useState<PendingCommitReorder | null>(null)
  const [busy, setBusy] = useState(false)
  // The operation that just landed, kept until the reloaded graph has been re-focused on the
  // commits it moved (see `useCommitReorderFocus`) — the rebase gave them new OIDs, so the
  // selection has to be re-derived rather than survive.
  const [landed, setLanded] = useState<CommitReorderOperation | null>(null)

  const headOid = useMemo(() => findHeadOid(nodes, headBranchName), [nodes, headBranchName])
  // Named `movableOids` rather than `window` — that one is the global object here.
  const movableOids = useMemo(
    () => (enabled ? collectReorderableOids(nodes, headOid) : []),
    [enabled, nodes, headOid]
  )
  const reorderable = useMemo(() => new Set(movableOids), [movableOids])
  const publishedFrom = useMemo(() => firstPublishedIndex(nodes, movableOids), [nodes, movableOids])

  const summarize = useCallback(
    (oid: string): ReorderCommitSummary => {
      const commit = nodes.find((n) => n.commit.oid === oid)?.commit
      return {
        oid,
        shortOid: commit?.shortOid ?? oid.slice(0, 7),
        subject: commit?.subject ?? oid.slice(0, 7),
      }
    },
    [nodes]
  )

  const handleDrop = useCallback(
    (target: CommitDropTarget, sourceOids: string[]) => {
      if (isRebasing) {
        toast.error(t('commitReorder.reject.rebaseInProgress'))
        return
      }
      const result = planOperation(movableOids, sourceOids, target)
      if ('error' in result) {
        // A no-op drop (onto itself, or into the gap it already sits in) is how a drag is
        // abandoned mid-gesture — say nothing rather than scold.
        if (result.error === 'notReorderable') toast.error(t('commitReorder.reject.notReorderable'))
        return
      }
      const lastAffected = result.affectedOids.length - 1
      setPending({
        operation: result,
        sources: result.sourceOids.map(summarize),
        target: summarize(target.oid),
        preview: result.resultOids.map(summarize),
        rewritesPublished: publishedFrom !== null && publishedFrom <= lastAffected,
      })
    },
    [isRebasing, movableOids, publishedFrom, summarize, t]
  )

  const dragContext: CommitDragContextValue = useMemo(
    () => ({
      reorderable,
      selectedOids: selected,
      dragLabel: (count) => t('commitReorder.dragGhost', { count }),
      onDrop: handleDrop,
    }),
    [reorderable, selected, handleDrop, t]
  )

  const cancel = useCallback(() => setPending(null), [])

  /**
   * Runs the confirmed plan. `mode` only matters for a combine: `squash` keeps both messages,
   * `fixup` discards the dragged commits'.
   */
  const confirm = useCallback(
    async (mode: 'squash' | 'fixup') => {
      if (!pending) return
      setBusy(true)
      try {
        // The authoritative range comes from the backend rather than the graph's nodes: it is what
        // `git rebase -i` will actually replay, and re-reading it here catches a history that
        // moved under the drag (a fetch landed, a hook committed) before anything is rewritten.
        const commits = await apiListRebaseCommits(repoPath, pending.operation.baseOid)
        const plan = buildReorderPlan(commits, pending.operation, mode)
        const invalid = validatePlan(plan)
        if (invalid) {
          toast.error(t(invalid))
          return
        }
        await apiRunInteractiveRebase(repoPath, pending.operation.baseOid, toTodoSteps(plan))
        setPending(null)

        const state = await apiGetRebaseState(repoPath).catch(() => null)
        if (state && state.kind !== 'idle') {
          // Paused on a conflict: the commits don't have their final OIDs yet — the rest of the
          // plan is still to replay — so there is nothing to re-focus on. The paused-rebase UI
          // takes the screen over anyway.
          toast.error(t('commitReorder.paused'))
        } else {
          setLanded(pending.operation)
          toast.success(
            pending.operation.kind === 'combine'
              ? t('commitReorder.combined', { count: pending.sources.length })
              : t('commitReorder.reordered', { count: pending.sources.length })
          )
        }
      } catch (error) {
        toast.error(String(error))
      } finally {
        setBusy(false)
        queryClient.invalidateQueries({ queryKey: ['git-log', repoPath] })
        queryClient.invalidateQueries({ queryKey: ['git-status', repoPath] })
        queryClient.invalidateQueries({ queryKey: ['branches', repoPath] })
        queryClient.invalidateQueries({ queryKey: ['rebase-state', repoPath] })
      }
    },
    [pending, repoPath, queryClient, t]
  )

  const clearLanded = useCallback(() => setLanded(null), [])

  return { dragContext, pending, busy, confirm, cancel, landed, clearLanded }
}
