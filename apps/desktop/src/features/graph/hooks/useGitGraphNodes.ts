import { useMemo } from 'react'
import type { GitGraphNode, GitGraphEdge } from '@git-manager/git-types'
import { getWaterlineBucket, bucketLabel } from '../lib/waterlineBuckets'
import type { WorktreeWipStatus } from './useWorktreeWipStatuses'
import { isSyntheticRow } from '../lib/syntheticRows'
import { matchCommitSearch, matchSelectedAuthors } from '../lib/graphRowFilters'
import {
  WIP_COLOR,
  buildWipNode,
  buildConflictNode,
  buildWorktreeWipNode,
  assignColumnsToSyntheticNodes,
} from '../lib/syntheticRowBuilders'

interface WaterlineMark {
  id: string
  label: string
  /** Index of the commit (boundary) the overlay sits on. */
  index: number
}

export interface ConflictRowInfo {
  count: number
  branchName?: string
  /** Position in the rebase plan, echoed on the row so the graph alone tells the user where
   * they are once the rebase progress view is hidden. */
  currentStep?: number
  totalSteps?: number
}

type TranslateFn = (key: string, opts?: Record<string, unknown>) => string

/** Stable empty default so an omitted author filter doesn't create a fresh Set every render. */
const EMPTY_AUTHOR_SET: Set<string> = new Set()

/**
 * Derives the graph's display data (WIP node, conflict node, search filtering, time buckets,
 * position of origin/main) from the raw commits.
 */
export function useGitGraphNodes(
  nodes: GitGraphNode[],
  searchQuery: string | undefined,
  totalChanges: number,
  t: TranslateFn,
  conflictInfo: ConflictRowInfo | null,
  worktreeWipStatuses: WorktreeWipStatus[] = [],
  selectedAuthorEmails: Set<string> = EMPTY_AUTHOR_SET
) {
  const primaryAnchor = useMemo(() => {
    if (nodes.length === 0) return null
    return (
      nodes.find((n) => n.refs.some((r) => r.type === 'HEAD')) ||
      nodes.find((n) => n.column === 0) ||
      nodes[0]
    )
  }, [nodes])

  const worktreeWipsByAnchor = useMemo(() => {
    const map = new Map<string, { anchor: GitGraphNode; wips: WorktreeWipStatus[] }>()
    if (nodes.length === 0) return map

    for (const wip of worktreeWipStatuses) {
      const anchor = nodes.find((n) =>
        n.refs.some((r) => r.type === 'branch' && r.shortName === wip.branch)
      )
      if (anchor) {
        let entry = map.get(anchor.commit.oid)
        if (!entry) {
          entry = { anchor, wips: [] }
          map.set(anchor.commit.oid, entry)
        }
        entry.wips.push(wip)
      }
    }
    return map
  }, [nodes, worktreeWipStatuses])

  const syntheticColumns = useMemo(() => {
    const columnMap = new Map<unknown, number>() // key: 'primary' | 'conflict' | WorktreeWipStatus
    if (nodes.length === 0 || !primaryAnchor) return columnMap

    const hasConflict = !!conflictInfo
    const hasPrimaryWip = !hasConflict && totalChanges > 0

    // Process primaryAnchor
    const primaryWips = worktreeWipsByAnchor.get(primaryAnchor.commit.oid)?.wips ?? []
    const primarySpecs: Array<{
      type: 'primary' | 'conflict' | 'worktree'
      wip?: WorktreeWipStatus
    }> = []
    if (hasConflict) {
      primarySpecs.push({ type: 'conflict' })
    } else if (hasPrimaryWip) {
      primarySpecs.push({ type: 'primary' })
    }
    for (let i = primaryWips.length - 1; i >= 0; i--) {
      primarySpecs.push({ type: 'worktree', wip: primaryWips[i] })
    }

    const topmostOid = nodes[0].commit.oid

    if (primarySpecs.length > 0) {
      const primaryCols = assignColumnsToSyntheticNodes(
        primaryAnchor,
        primarySpecs,
        primaryAnchor.commit.oid === topmostOid
      )
      for (const [key, col] of primaryCols.entries()) {
        columnMap.set(key, col)
      }
    }

    // Process other anchors
    for (const [oid, entry] of worktreeWipsByAnchor.entries()) {
      if (oid === primaryAnchor.commit.oid) continue
      const specs: Array<{ type: 'primary' | 'conflict' | 'worktree'; wip?: WorktreeWipStatus }> =
        []
      for (let i = entry.wips.length - 1; i >= 0; i--) {
        specs.push({ type: 'worktree', wip: entry.wips[i] })
      }
      const cols = assignColumnsToSyntheticNodes(
        entry.anchor,
        specs,
        entry.anchor.commit.oid === topmostOid
      )
      for (const [key, col] of cols.entries()) {
        columnMap.set(key, col)
      }
    }

    return columnMap
  }, [nodes, primaryAnchor, worktreeWipsByAnchor, conflictInfo, totalChanges])

  const conflictNode = useMemo(() => {
    if (!conflictInfo || nodes.length === 0 || !primaryAnchor) return null
    const col = syntheticColumns.get('conflict') ?? 0
    return buildConflictNode(primaryAnchor.commit.oid, col)
  }, [conflictInfo, nodes, primaryAnchor, syntheticColumns])

  const wipNode = useMemo(() => {
    if (conflictNode || totalChanges === 0 || nodes.length === 0 || !primaryAnchor) return null
    const col = syntheticColumns.get('primary') ?? 0
    return buildWipNode(primaryAnchor.commit.oid, col)
  }, [totalChanges, nodes, conflictNode, primaryAnchor, syntheticColumns])

  const worktreeWipNodes = useMemo(() => {
    if (worktreeWipStatuses.length === 0 || nodes.length === 0) return []
    const resultList: { anchor: GitGraphNode; node: GitGraphNode }[] = []
    for (const wip of worktreeWipStatuses) {
      const anchor = nodes.find((n) =>
        n.refs.some((r) => r.type === 'branch' && r.shortName === wip.branch)
      )
      if (anchor) {
        const col = syntheticColumns.get(wip)
        if (col !== undefined) {
          resultList.push({ anchor, node: buildWorktreeWipNode(anchor, wip, col) })
        }
      }
    }
    return resultList
  }, [nodes, worktreeWipStatuses, syntheticColumns])

  // All nodes to render (WIP/CONFLICT synthetic row prepended when present, plus one synthetic
  // row per dirty linked worktree inserted right above its branch's tip commit). Search no
  // longer removes rows from here — see `matchingOids` below — so the graph's column/connection
  // shape (computed for the full history) never gets distorted by a search that would otherwise
  // hide some of the commits it depends on.
  const filteredNodes = useMemo(() => {
    const specialNode = conflictNode ?? wipNode
    let result = specialNode ? [specialNode, ...nodes] : nodes

    if (worktreeWipNodes.length > 0) {
      // Insert bottom-up so an earlier insertion never shifts a later target index.
      const insertions = worktreeWipNodes
        .map(({ anchor, node: syntheticNode }) => ({
          index: result.indexOf(anchor),
          node: syntheticNode,
        }))
        .filter((insertion) => insertion.index !== -1)
        .sort((a, b) => b.index - a.index)

      for (const { index, node: syntheticNode } of insertions) {
        result = [...result.slice(0, index), syntheticNode, ...result.slice(index)]
      }
    }

    return result
  }, [nodes, wipNode, conflictNode, worktreeWipNodes])

  /** `null` when the search box is empty — see `graphRowFilters` on why that is not an empty list. */
  const matchingOids = useMemo(
    () => matchCommitSearch(filteredNodes, searchQuery),
    [filteredNodes, searchQuery]
  )

  /** `null` when no author is selected. Consumed alongside `matchingOids` for row dimming. */
  const authorMatchingOids = useMemo(
    () => matchSelectedAuthors(filteredNodes, selectedAuthorEmails),
    [filteredNodes, selectedAuthorEmails]
  )

  // Waterlines are emitted MONOTONICALLY (increasing rank): a bucket only appears when entering
  // an older period, never going back (the commits aren't always sorted).
  const waterlines = useMemo<WaterlineMark[]>(() => {
    const out: WaterlineMark[] = []
    let maxRank = -1
    filteredNodes.forEach((node, index) => {
      const bucket = getWaterlineBucket(node.commit.author.timestamp)
      if (bucket.rank > maxRank) {
        if (index > 0) {
          out.push({ id: `wl:${index}:${bucket.key}`, label: bucketLabel(bucket, t), index })
        }
        maxRank = bucket.rank
      }
    })
    return out
  }, [filteredNodes, t])

  // Index (in `filteredNodes`) of the origin/main or origin/master commit, used to dash the
  // vertical connections above the remote boundary.
  const originMainIndex = useMemo(
    () =>
      filteredNodes.findIndex((n) =>
        n.refs.some((r) => r.shortName === 'origin/main' || r.shortName === 'origin/master')
      ),
    [filteredNodes]
  )

  /** The column origin/main sits on — the lane whose segments above it are the unpushed ones. */
  const originMainColumn = useMemo(
    () => (originMainIndex === -1 ? 0 : filteredNodes[originMainIndex].column),
    [filteredNodes, originMainIndex]
  )

  // Nodes ready for rendering: same as filteredNodes, but with the WIP(s)→anchor-commit
  // connector(s) and the dashed origin/main boundary already patched in. Derived once here
  // rather than per visible row on every render (that used to re-run this reasoning inside
  // the virtualization loop's .map() callback).
  const renderNodes = useMemo(() => {
    // Every synthetic WIP row needs a real row below it (its anchor commit) to carry a matching
    // connection, or GraphSvg has nothing to draw the dashed line into. Per-worktree WIP rows
    // anchor wherever they were inserted, but the connector is a diagonal "arrival" patched onto
    // the anchor (fromColumn = the WIP row's offset column, toColumn = the anchor's own column) —
    // see `buildWorktreeWipNode`'s comment for why it's this way round (starts at the commit,
    // rises into the WIP row) rather than the other.
    const continuityPatches: {
      index: number
      fromColumn: number
      toColumn: number
      color: string
    }[] = []

    // The primary WIP/CONFLICT row's dashed connector runs down its own lane until it actually
    // TOUCHES a node: the first real (non-synthetic) commit rendered ON that column — NOT merely
    // the first real commit in display order. When the checked-out main is behind origin/main,
    // the display-first commit (origin/main's tip) sits on another column entirely, while column
    // 0 is the lane reserved for the local main further down: every column-0 segment in between
    // crosses those rows without contacting any node, so the whole run must stay dashed until the
    // local main node itself (see the dashing block below), then turn solid exactly there.
    const hasPrimarySpecial =
      filteredNodes.length > 0 &&
      (filteredNodes[0].commit.oid === 'WIP' || filteredNodes[0].commit.oid === 'CONFLICT')
    const wipColumn = hasPrimarySpecial ? filteredNodes[0].column : 0
    const primaryAnchorIndex = hasPrimarySpecial
      ? filteredNodes.findIndex((n) => !isSyntheticRow(n.commit.oid) && n.column === wipColumn)
      : -1

    // Topmost REAL commit: the one row whose incoming edges can only be reserved lanes, since every
    // row above it is synthetic (a WIP / paused-rebase row this hook spliced in itself).
    const firstRealIndex = filteredNodes.findIndex((n) => !isSyntheticRow(n.commit.oid))

    if (primaryAnchorIndex !== -1) {
      continuityPatches.push({
        index: primaryAnchorIndex,
        fromColumn: wipColumn,
        toColumn: wipColumn,
        color: WIP_COLOR,
      })
    }

    // Dashed vertical runs that must stay continuous: each worktree WIP connector flows down its
    // own lane from its row to its anchor. When several WIP rows stack above one shared anchor
    // (e.g. several branches pointing at main's tip), the rows in between don't carry that lane
    // naturally — their pass-throughs only mirror the anchor's own edges — so add it explicitly.
    const laneRuns: { start: number; end: number; column: number }[] = []

    for (const { anchor, node: syntheticNode } of worktreeWipNodes) {
      const syntheticIndex = filteredNodes.indexOf(syntheticNode)
      // The anchor is NOT always the row directly below the WIP: several worktree WIP rows can
      // stack above one shared anchor commit, so resolve the anchor's real display index rather
      // than assuming `syntheticIndex + 1` (which would target the next WIP row and, since its
      // column differs, silently drop the connector — the offset bug where the top WIP never
      // links down to main).
      const anchorIndex = filteredNodes.indexOf(anchor)
      if (syntheticIndex === -1 || anchorIndex === -1) continue
      continuityPatches.push({
        index: anchorIndex,
        fromColumn: syntheticNode.column,
        toColumn: anchor.column,
        color: WIP_COLOR,
      })
      if (anchorIndex - syntheticIndex > 1) {
        laneRuns.push({ start: syntheticIndex, end: anchorIndex, column: syntheticNode.column })
      }
    }

    return filteredNodes.map((node, index) => {
      let patched = node

      // Rows strictly inside a worktree connector's vertical run get its dashed lane added when
      // nothing occupies that column yet — without it the connector shows a row-tall gap.
      for (const run of laneRuns) {
        if (
          index > run.start &&
          index < run.end &&
          !patched.connections.some((c) => c.fromColumn === run.column && c.toColumn === run.column)
        ) {
          patched = {
            ...patched,
            connections: [
              ...patched.connections,
              { fromColumn: run.column, toColumn: run.column, color: WIP_COLOR, dashed: true },
            ],
          }
        }
      }

      const matchingPatches = continuityPatches.filter(
        (p) => p.index === index && patched.column === p.toColumn
      )
      for (const patch of matchingPatches) {
        // On the graph's topmost real row, the edge arriving on its own lane is the backend's
        // reserved lane, not history (nothing is displayed above it) — see the matching note in
        // `assignColumnsToSyntheticNodes`. Once a WIP row sits on that lane, that reservation IS
        // the connector, so it renders dashed and in the WIP violet instead of as a solid stub of
        // branch line rising out of the commit dot.
        if (index === firstRealIndex && patch.fromColumn === patch.toColumn) {
          patched = {
            ...patched,
            connections: patched.connections.map((c) =>
              c.fromColumn === patch.fromColumn && c.toColumn === patch.toColumn && !c.startsAtNode
                ? { ...c, dashed: true, color: patch.color }
                : c
            ),
          }
        }
        // Only an edge that reaches UP into this node (arriving from the top of the row) already
        // wires it to the WIP row above. A `startsAtNode`-only edge is a *departure* going down to
        // a parent — e.g. a merge commit's straight line to its first parent — and does NOT reach
        // the WIP; treating it as "already connected" is what left the top merge unlinked. So we
        // still add the connector unless a non-`startsAtNode` edge on that lane is present.
        const hasUpwardEdge = patched.connections.some(
          (c) =>
            c.fromColumn === patch.fromColumn && c.toColumn === patch.toColumn && !c.startsAtNode
        )
        if (!hasUpwardEdge) {
          // Annotated as `GitGraphEdge` so `connections` stays `GitGraphEdge[]` (not a widened
          // union) and downstream code can read the optional `startsAtNode`/`endsAtNode` flags.
          // `endsAtNode` makes the dashed line arrive at the node center (like a real incoming
          // edge) instead of stopping short with the synthetic HEAD-line geometry.
          const wipEdge: GitGraphEdge = {
            fromColumn: patch.fromColumn,
            toColumn: patch.toColumn,
            color: patch.color,
            dashed: true,
            endsAtNode: true,
          }
          patched = {
            ...patched,
            connections: [...patched.connections, wipEdge],
          }
        }
      }

      // Keep the primary WIP/CONFLICT connector dashed the WHOLE way down its lane — from its own
      // row to the anchor node it drops into. Rows in between (synthetic worktree WIP rows, and
      // real commits sitting on other columns) only carry pass-through segments on this lane: none
      // of them is a node the line touches, so each one must render dashed (and in the WIP violet,
      // so the run reads as one connector). At the anchor row itself, only the edge arriving at the
      // node center (`endsAtNode`) is dashed; the anchor's own downward departure (`startsAtNode`)
      // is real history below the node and stays solid. When the anchor commit is below the loaded
      // page (`primaryAnchorIndex === -1` with the WIP row present), the whole visible stretch of
      // the lane is above it, so dash it all.
      if (
        hasPrimarySpecial &&
        index >= 1 &&
        (primaryAnchorIndex === -1 || index <= primaryAnchorIndex)
      ) {
        patched = {
          ...patched,
          connections: patched.connections.map((conn) => {
            if (conn.fromColumn !== wipColumn || conn.toColumn !== wipColumn) return conn
            if (conn.startsAtNode) return conn
            if (index === primaryAnchorIndex && !conn.endsAtNode) return conn
            return { ...conn, dashed: true, color: WIP_COLOR }
          }),
        }
      }

      if (originMainIndex !== -1 && index <= originMainIndex) {
        // Everything above origin/main on the lane that runs down INTO it is unpushed, so that
        // whole vertical must be dashed — including a merge commit's straight-down departure to its
        // first parent. A mainline built of "Merge pull request" commits is the common case:
        // keeping each merge's downward leg solid (as an earlier version did) shattered the dashed
        // line into mostly-solid segments that visibly stopped short of the origin/main node
        // instead of reaching it. The one departure that stays solid is the origin/main commit's
        // OWN (`index === originMainIndex`): it leads into already-pushed history below the
        // boundary, so the dashed→solid transition lands exactly on that node. (A merge's diagonal
        // leg to its second parent is left untouched here — it isn't a straight vertical.)
        //
        // The lane is origin/main's OWN column, read off the node — not a hardcoded 0. Columns are
        // assigned strictly top-to-bottom (see the invariant comment in `build_graph_nodes`), so
        // column 0 belongs to whichever lane the topmost row starts, which is the mainline only by
        // coincidence. Rust used to inject this dashing itself, on column 0; that block encoded the
        // same false assumption and was dead in practice, so it was removed rather than fixed.
        //
        // Three unrelated things render dashed, and each is owned by exactly ONE layer — do not
        // move one across the boundary:
        //   * the stash → base-commit bridge, owned by Rust (`build_graph_nodes`), because that
        //     link is not real history;
        //   * the WIP / paused-rebase connector, owned by this hook, because the row it descends
        //     from is synthetic and spliced in here;
        //   * this unpushed run above origin/main, owned by this hook, because only the frontend
        //     knows which node is on screen to read the column off.
        // `GraphSvg` draws the flags it is handed and infers none of this.
        patched = {
          ...patched,
          connections: patched.connections.map((conn) => {
            if (conn.fromColumn !== originMainColumn || conn.toColumn !== originMainColumn)
              return conn
            if (conn.startsAtNode && index === originMainIndex) return conn
            return { ...conn, dashed: true }
          }),
        }
      }

      return patched
    })
  }, [filteredNodes, originMainIndex, originMainColumn, worktreeWipNodes])

  return {
    wipNode,
    conflictNode,
    filteredNodes,
    renderNodes,
    waterlines,
    originMainIndex,
    matchingOids,
    authorMatchingOids,
  }
}
