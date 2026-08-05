import { useEffect, useRef, type RefObject } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { toast } from '@git-manager/ui'
import type { GitGraphNode } from '@git-manager/git-types'
import { isSyntheticRow } from '../components/git-graph/syntheticRows'

type TranslateFn = (key: string, opts?: Record<string, unknown>) => string

/**
 * Virtualizes the commit list and keeps it scrolled to wherever selection moved from outside a
 * click: a search-match navigation, an out-of-tree SHA lookup (command palette, toolbar conflict
 * indicator), or the auto-select that runs on branch/repo change (including the paused-rebase
 * CONFLICT row auto-open).
 *
 * Extracted from GitGraph.tsx (2026-08 retrofit, see architecture-guardian skill's R3) — these
 * three effects all exist to answer the same question ("selection moved without a click; scroll to
 * it"), so they're grouped here rather than split further.
 */
export function useGraphScrollSync({
  parentRef,
  rowHeight,
  nodes,
  filteredNodes,
  conflictNode,
  isRebasePaused,
  branch,
  repoPath,
  primaryOid,
  selectSingle,
  matchingOids,
  clampedMatchIndex,
  pendingGraphSelection,
  setPendingGraphSelection,
  t,
}: {
  parentRef: RefObject<HTMLDivElement | null>
  rowHeight: number
  nodes: GitGraphNode[]
  filteredNodes: GitGraphNode[]
  conflictNode: GitGraphNode | null
  isRebasePaused: boolean
  branch: string | undefined
  repoPath: string
  primaryOid: string | null
  selectSingle: (oid: string) => void
  matchingOids: string[] | null
  clampedMatchIndex: number
  pendingGraphSelection: string | null
  setPendingGraphSelection: (oid: string | null) => void
  t: TranslateFn
}) {
  const lastScrolledRef = useRef<{ branch: string | undefined; repoPath: string }>({
    branch: undefined,
    repoPath: '',
  })

  const virtualizer = useVirtualizer({
    count: filteredNodes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 20,
  })

  // Select and scroll the currently focused search match into view — as if it had been clicked —
  // whenever the up/down navigation (or a fresh query) moves it.
  useEffect(() => {
    if (!matchingOids || matchingOids.length === 0) return
    const oid = matchingOids[clampedMatchIndex]
    selectSingle(oid)
    const index = filteredNodes.findIndex((n) => n.commit.oid === oid)
    if (index !== -1) {
      virtualizer.scrollToIndex(index, { align: 'center' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clampedMatchIndex, matchingOids])

  // Bridge: lets out-of-tree UI (the command palette's SHA lookup, the toolbar's conflict indicator)
  // select a graph row by OID. A pasted SHA may be abbreviated, so resolve it to a loaded commit by
  // prefix; the synthetic 'WIP'/'CONFLICT' rows pass through untouched. On a hit we select and scroll
  // the row into view, exactly as a click would; a SHA outside the loaded window reports "not found".
  useEffect(() => {
    if (!pendingGraphSelection) return
    const raw = pendingGraphSelection
    const isSynthetic = isSyntheticRow(raw)
    // Wait for the log to load before resolving a real SHA, so a selection dispatched just before
    // the graph mounts isn't dropped against an empty list.
    if (!isSynthetic && filteredNodes.length === 0) return
    setPendingGraphSelection(null)
    const prefix = raw.toLowerCase()
    const target = isSynthetic
      ? raw
      : filteredNodes.find((n) => n.commit.oid.toLowerCase().startsWith(prefix))?.commit.oid
    if (!target) {
      toast.error(t('gitTree.commitNotFound', { sha: raw.slice(0, 12) }))
      return
    }
    selectSingle(target)
    const index = filteredNodes.findIndex((n) => n.commit.oid === target)
    if (index !== -1) virtualizer.scrollToIndex(index, { align: 'center' })
  }, [pendingGraphSelection, filteredNodes, virtualizer, selectSingle, setPendingGraphSelection, t])

  // One-shot guard so the conflict panel auto-opens once per pause (below) without snapping
  // back to the CONFLICT row every time the user navigates away to inspect another commit.
  const autoOpenedConflictRef = useRef(false)
  useEffect(() => {
    if (!isRebasePaused) autoOpenedConflictRef.current = false
  }, [isRebasePaused])

  // Auto-select commit when branch/reference or repository changes
  useEffect(() => {
    if (!nodes || nodes.length === 0) return

    // When a rebase pauses on a conflict, surface the resolution panel automatically by
    // selecting the synthetic CONFLICT row — otherwise the user only sees conflict markers in
    // the diff and no obvious way forward (no Continue/Abort). Done once per pause; while paused
    // we also suppress the branch-head auto-select below so a background refetch can't snap the
    // user off the conflict row (or off a commit they navigated to) mid-resolution.
    if (isRebasePaused && conflictNode) {
      if (!autoOpenedConflictRef.current) {
        autoOpenedConflictRef.current = true
        selectSingle('CONFLICT')
      }
      return
    }

    const currentSelected = branch || primaryOid
    // Find a node that has a ref matching the branch name, or matches by OID (stashes)
    const matchNode =
      nodes.find(
        (node) =>
          node.commit.oid === currentSelected ||
          node.refs.some((r) => r.name === currentSelected || r.shortName === currentSelected)
      ) || nodes[0]

    if (matchNode && matchNode.commit.oid !== 'WIP') {
      selectSingle(matchNode.commit.oid)

      if (
        lastScrolledRef.current.branch !== branch ||
        lastScrolledRef.current.repoPath !== repoPath
      ) {
        lastScrolledRef.current = { branch, repoPath }
        const index = filteredNodes.findIndex((n) => n.commit.oid === matchNode.commit.oid)
        if (index !== -1) {
          setTimeout(() => {
            virtualizer.scrollToIndex(index, { align: 'center' })
          }, 50)
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch, repoPath, nodes, isRebasePaused, conflictNode])

  return { virtualizer }
}
