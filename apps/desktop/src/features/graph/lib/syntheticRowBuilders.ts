import type { GitGraphNode, GitGraphEdge } from '@git-manager/git-types'
import type { WorktreeWipStatus } from '../hooks/useWorktreeWipStatuses'

/**
 * Construction and lane placement of the graph's synthetic rows — the working tree, each dirty
 * linked worktree, and a paused rebase's conflict row.
 *
 * The sibling `syntheticRows.ts` answers "is this row synthetic?" for the ~11 call sites that have
 * to skip one; this file answers "what does one look like, and which lane does it go in", which is
 * the part with the reasoning in it. Kept out of `useGitGraphNodes` because none of it is React:
 * given a node list and a column, every function here is a pure mapping, and the lane rules below
 * are the kind that get re-broken by a plausible edit.
 */

/** Fixed color for every "// WIP" synthetic row (own repo and other worktrees alike) — always
 * this violet, never the target branch's own color, so a WIP row reads as "not a real commit"
 * at a glance regardless of which branch it's attached to. */
export const WIP_COLOR = '#7c3aed'

export function buildWipNode(parentOid: string, column: number): GitGraphNode {
  return {
    commit: {
      oid: 'WIP',
      shortOid: 'WIP',
      message: '',
      subject: '',
      body: '',
      author: {
        name: '',
        email: '',
        timestamp: Date.now() / 1000,
      },
      committer: {
        name: '',
        email: '',
        timestamp: Date.now() / 1000,
      },
      parentOids: [parentOid],
    },
    column,
    color: WIP_COLOR,
    connections: [
      {
        fromColumn: column,
        toColumn: column,
        color: WIP_COLOR,
        dashed: true,
      },
    ],
    refs: [],
  }
}

/**
 * Synthetic row for a paused rebase, rendered in the graph the same way as the WIP row
 * (see `buildWipNode`) — same `commit`-shaped object, special-cased in `GraphRow.tsx` by
 * `oid === 'CONFLICT'`. Mutually exclusive with the WIP row (see `useGitGraphNodes` below):
 * showing both at once would break the WIP→first-commit connector math, and a paused rebase
 * already IS the repo's "in-progress work" state.
 */
export function buildConflictNode(parentOid: string, column: number): GitGraphNode {
  return {
    commit: {
      oid: 'CONFLICT',
      shortOid: 'CONFLICT',
      message: '',
      subject: '',
      body: '',
      author: {
        name: '',
        email: '',
        timestamp: Date.now() / 1000,
      },
      committer: {
        name: '',
        email: '',
        timestamp: Date.now() / 1000,
      },
      parentOids: [parentOid],
    },
    column,
    color: '#f97316',
    connections: [
      {
        fromColumn: column,
        toColumn: column,
        color: '#f97316',
        dashed: true,
      },
    ],
    refs: [],
  }
}

/**
 * Every lane that flows straight up through a synthetic row spliced in *above* `anchor`, as
 * plain vertical pass-throughs. Generic over any number of lanes: a lane crosses the anchor
 * row's TOP edge — and so must continue up through the inserted row — for every edge EXCEPT the
 * anchor node's own downward departures to its parents. Those departures are the only edges that
 * start at the commit dot and head down: the straight first-parent line (`startsAtNode`) and any
 * diagonal split whose `fromColumn` is the anchor's own column. Everything else enters from the
 * top: plain pass-throughs (`fromColumn === toColumn`, a different lane), the anchor's own
 * incoming vertical (`endsAtNode`), AND merge lines arriving diagonally from a side lane
 * (`toColumn === anchor.column`) — the last of which the old `fromColumn === toColumn`-only copy
 * dropped, cutting a merge commit's incoming lanes at the inserted row. Each carried lane is
 * emitted at its `fromColumn` (where it touches the top) as a flag-free flow-through, since this
 * synthetic row holds no real commit to arrive at or depart from. `excludeColumn` is the
 * inserted row's own lane, skipped so its own connector isn't duplicated. */
export function laneContinuations(anchor: GitGraphNode, excludeColumn: number): GitGraphEdge[] {
  const laneColors = new Map<number, string>()
  for (const c of anchor.connections) {
    const isDownwardDeparture =
      c.fromColumn === anchor.column && (c.startsAtNode === true || c.toColumn !== anchor.column)
    if (isDownwardDeparture || c.fromColumn === excludeColumn) continue
    if (!laneColors.has(c.fromColumn)) laneColors.set(c.fromColumn, c.color)
  }
  return Array.from(laneColors, ([col, color]) => ({ fromColumn: col, toColumn: col, color }))
}

/**
 * Synthetic WIP row for a linked worktree other than the active repo (see
 * `useWorktreeWipStatuses`). Inserted directly above `anchor` — the node whose commit is the
 * tip of that worktree's checked-out branch — but deliberately offset to the first free lane to
 * the side of the anchor (see the column search below) rather than sitting exactly on the
 * branch's own lane or on top of any other active lane crossing this row. The connector is
 * drawn the other way round from a normal merge line: it starts at `anchor`'s own row (from the
 * right of that commit) and rises straight up into this row — see the matching `toColumn:
 * anchor.column` patch added to `anchor`'s own connections in `useGitGraphNodes`'s
 * `renderNodes` — while this node itself only carries a plain dashed vertical for its own
 * column (`isWip`-aware in `GraphSvg`, so it visibly starts at the bottom of its own circle).
 * Also carries a plain vertical continuation of every lane that crosses `anchor`'s top edge (see
 * `laneContinuations`) — INCLUDING `anchor.column` itself, and including lanes that merge *into*
 * `anchor` diagonally — since splicing this row in between `anchor` and whatever real commit sits
 * above it would otherwise cut those lanes in two: this row needs to draw both its own dashed WIP
 * connector AND a plain solid continuation of every through-lane. The oid is namespaced
 * (`WIP:<path>`) so multiple of these can coexist and `GraphRow.tsx`
 * can tell them apart from the primary `'WIP'` row (which stays editable/committable) and from
 * each other.
 */
export function buildWorktreeWipNode(
  anchor: GitGraphNode,
  wip: WorktreeWipStatus,
  column: number
): GitGraphNode {
  const passThroughs = laneContinuations(anchor, column)
  return {
    commit: {
      oid: `WIP:${wip.path}`,
      shortOid: 'WIP',
      message: '',
      subject: '',
      body: '',
      author: {
        name: '',
        email: '',
        timestamp: Date.now() / 1000,
      },
      committer: {
        name: '',
        email: '',
        timestamp: Date.now() / 1000,
      },
      parentOids: [anchor.commit.oid],
    },
    column,
    color: WIP_COLOR,
    connections: [
      ...passThroughs,
      {
        fromColumn: column,
        toColumn: column,
        color: WIP_COLOR,
        dashed: true,
      },
    ],
    refs: [],
  }
}

export function assignColumnsToSyntheticNodes(
  anchor: GitGraphNode,
  synthSpecs: Array<{ type: 'primary' | 'conflict' | 'worktree'; wip?: WorktreeWipStatus }>,
  anchorIsTopmost: boolean
): Map<unknown, number> {
  const columnMap = new Map<unknown, number>()
  // Lanes crossing the anchor row's TOP edge — the same set `laneContinuations` carries up through
  // every WIP row spliced above the anchor. A WIP must not land on one of these or it sits right on
  // an active branch line's path (the reported bug where a WIP is drawn *on* a merged feature-tip's
  // incoming line instead of beside it). The anchor's OWN column only counts as free when the
  // branch truly ends at the tip — i.e. no line continues down into it from above; the merge that
  // reintegrates a feature branch leaves an `endsAtNode` vertical on the tip's own column, which is
  // exactly what makes that lane occupied here.
  const crossing = new Set<number>()
  for (const c of anchor.connections) {
    const isDownwardDeparture =
      c.fromColumn === anchor.column && (c.startsAtNode === true || c.toColumn !== anchor.column)
    if (isDownwardDeparture) {
      // A diagonal departure (a merge's leg down to its second parent) owns the lane it lands on
      // from this row's mid-height down. A WIP connector arriving there rises straight out of that
      // diagonal's corner and reads as a dotted "start" of it, so that lane is off limits too.
      if (c.toColumn !== anchor.column) crossing.add(c.toColumn)
      continue
    }
    crossing.add(c.fromColumn)
  }
  // …except on the graph's topmost row, where NOTHING is displayed above: the incoming edge the
  // backend leaves on that row's own lane is a reservation, not a line coming from somewhere. The
  // backend seeds exactly one lane, and only when a WIP / paused-rebase row is about to be spliced
  // in above the graph (`head_has_wip`, see `build_graph_nodes`) — so this row's own lane is that
  // reservation. Treating it as occupied pushed the WIP row one lane to the right — straight onto
  // the lane a "Merge pull request" tip departs into for its second parent — so its dashed
  // connector rose out of that diagonal's corner and read as a dotted "start" grafted onto the
  // merge → next-commit link. The lane above the top row is free by construction, so the WIP
  // belongs on it.
  if (anchorIsTopmost) crossing.delete(anchor.column)

  const used = new Set<number>()
  for (const spec of synthSpecs) {
    let col: number
    if (spec.type === 'primary' || spec.type === 'conflict') {
      // The own-repo WIP / paused-rebase row sits on the anchor's own lane — column 0 for main's
      // tip, and when local main is behind origin/main the reserved column-0 lane running down to
      // it IS this row's own connector, so a crossing there must not push it aside.
      col = anchor.column
    } else {
      // A worktree WIP takes the leftmost lane at/after the anchor's column that no crossing line
      // (a merged feature tip's incoming branch line) and no earlier WIP row on this anchor already
      // occupies — so it never draws on top of an active branch line, and stacked siblings each get
      // their own lane. It falls on the anchor's own lane only when that lane is free above.
      col = anchor.column
      while (crossing.has(col) || used.has(col)) col++
    }
    used.add(col)
    const key = spec.type === 'worktree' ? spec.wip : spec.type
    columnMap.set(key, col)
  }

  return columnMap
}
