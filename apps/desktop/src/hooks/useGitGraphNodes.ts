import { useMemo } from 'react'
import type { GitGraphNode, GitGraphEdge } from '@git-manager/git-types'
import { getWaterlineBucket, bucketLabel } from '../components/git-graph/waterlineBuckets'
import type { WorktreeWipStatus } from './useWorktreeWipStatuses'

interface WaterlineMark {
  id: string
  label: string
  /** Index du commit (frontière) sur lequel l'overlay est positionné. */
  index: number
}

export interface ConflictRowInfo {
  count: number
  branchName?: string
}

type TranslateFn = (key: string, opts?: Record<string, unknown>) => string

/** Stable empty default so an omitted author filter doesn't create a fresh Set every render. */
const EMPTY_AUTHOR_SET: Set<string> = new Set()

/** Fixed color for every "// WIP" synthetic row (own repo and other worktrees alike) — always
 * this violet, never the target branch's own color, so a WIP row reads as "not a real commit"
 * at a glance regardless of which branch it's attached to. */
const WIP_COLOR = '#7c3aed'

function buildWipNode(parentOid: string, column: number): GitGraphNode {
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
function buildConflictNode(parentOid: string, column: number): GitGraphNode {
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
function laneContinuations(anchor: GitGraphNode, excludeColumn: number): GitGraphEdge[] {
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
function buildWorktreeWipNode(anchor: GitGraphNode, wip: WorktreeWipStatus, column: number): GitGraphNode {
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

function assignColumnsToSyntheticNodes(
  anchor: GitGraphNode,
  synthSpecs: Array<{ type: 'primary' | 'conflict' | 'worktree'; wip?: WorktreeWipStatus }>
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
    if (isDownwardDeparture) continue
    crossing.add(c.fromColumn)
  }

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

/**
 * Dérive les données d'affichage du graphe (nœud WIP, nœud conflit, filtrage recherche,
 * paliers temporels, position de origin/main) à partir des commits bruts.
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
    const primarySpecs: Array<{ type: 'primary' | 'conflict' | 'worktree'; wip?: WorktreeWipStatus }> = []
    if (hasConflict) {
      primarySpecs.push({ type: 'conflict' })
    } else if (hasPrimaryWip) {
      primarySpecs.push({ type: 'primary' })
    }
    for (let i = primaryWips.length - 1; i >= 0; i--) {
      primarySpecs.push({ type: 'worktree', wip: primaryWips[i] })
    }

    if (primarySpecs.length > 0) {
      const primaryCols = assignColumnsToSyntheticNodes(primaryAnchor, primarySpecs)
      for (const [key, col] of primaryCols.entries()) {
        columnMap.set(key, col)
      }
    }

    // Process other anchors
    for (const [oid, entry] of worktreeWipsByAnchor.entries()) {
      if (oid === primaryAnchor.commit.oid) continue
      const specs: Array<{ type: 'primary' | 'conflict' | 'worktree'; wip?: WorktreeWipStatus }> = []
      for (let i = entry.wips.length - 1; i >= 0; i--) {
        specs.push({ type: 'worktree', wip: entry.wips[i] })
      }
      const cols = assignColumnsToSyntheticNodes(entry.anchor, specs)
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

  /**
   * Ordered OIDs (display order) of commits matching the active search — `null` when there's no
   * active search. Drives the search panel's result count / up-down navigation, and lets row
   * rendering dim the commits that *don't* match instead of hiding them.
   */
  const matchingOids = useMemo(() => {
    const search = searchQuery?.trim().toLowerCase() ?? ''
    if (!search) return null
    return filteredNodes
      .filter((node) => {
        if (node.commit.oid === 'WIP' || node.commit.oid.startsWith('WIP:')) {
          return 'wip'.includes(search)
        }
        if (node.commit.oid === 'CONFLICT') {
          return 'conflict'.includes(search)
        }
        const { commit } = node
        const haystack = [
          commit.subject,
          commit.body,
          commit.author.name,
          commit.author.email,
          commit.oid,
        ]
          .join(' ')
          .toLowerCase()
        return haystack.includes(search)
      })
      .map((node) => node.commit.oid)
  }, [filteredNodes, searchQuery])

  /**
   * OIDs of rows kept fully visible by the AUTHOR column filter — `null` when no author is
   * selected (filter inactive). A row matches when its (lowercased) author email is in the
   * selected set; every synthetic row (WIP/CONFLICT/`WIP:<path>`) is always included so a
   * commit-less in-progress row is never dimmed by an author filter. Consumed alongside
   * `matchingOids` for the row-dimming decision in `GitGraph`.
   */
  const authorMatchingOids = useMemo(() => {
    if (selectedAuthorEmails.size === 0) return null
    return filteredNodes
      .filter((node) => {
        const { oid } = node.commit
        if (oid === 'WIP' || oid === 'CONFLICT' || oid.startsWith('WIP:')) return true
        return selectedAuthorEmails.has((node.commit.author?.email ?? '').trim().toLowerCase())
      })
      .map((node) => node.commit.oid)
  }, [filteredNodes, selectedAuthorEmails])

  // Waterlines : émises de façon MONOTONE (rang croissant) : un palier n'apparaît
  // qu'en entrant dans une période plus ancienne, jamais en arrière (commits pas
  // toujours triés).
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

  // Index (dans filteredNodes) du commit origin/main ou origin/master, utilisé
  // pour pointiller les connexions verticales au-dessus de la frontière distante.
  const originMainIndex = useMemo(
    () =>
      filteredNodes.findIndex((n) =>
        n.refs.some((r) => r.shortName === 'origin/main' || r.shortName === 'origin/master')
      ),
    [filteredNodes]
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
    const continuityPatches: { index: number; fromColumn: number; toColumn: number; color: string }[] =
      []

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
      ? filteredNodes.findIndex(
          (n) =>
            n.commit.oid !== 'WIP' &&
            n.commit.oid !== 'CONFLICT' &&
            !n.commit.oid.startsWith('WIP:') &&
            n.column === wipColumn
        )
      : -1

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
      // column differs, silently drop the connector — the "décalage" bug where the top WIP never
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

      const matchingPatches = continuityPatches.filter((p) => p.index === index && patched.column === p.toColumn)
      for (const patch of matchingPatches) {
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
      if (hasPrimarySpecial && index >= 1 && (primaryAnchorIndex === -1 || index <= primaryAnchorIndex)) {
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
        // Everything on column 0 above origin/main is unpushed, so the *whole* mainline vertical
        // there must be dashed — including a merge commit's straight-down departure to its first
        // parent. A mainline built of "Merge pull request" commits is the common case: keeping each
        // merge's downward leg solid (as an earlier version did) shattered the dashed line into
        // mostly-solid segments that visibly stopped short of the origin/main node instead of
        // reaching it. The one column-0 departure that stays solid is the origin/main commit's OWN
        // (`index === originMainIndex`): it leads into already-pushed history below the boundary, so
        // the dashed→solid transition lands exactly on that node. (A merge's diagonal leg to its
        // second parent is left untouched here — it isn't a column-0→column-0 edge.)
        patched = {
          ...patched,
          connections: patched.connections.map((conn) => {
            if (conn.fromColumn !== 0 || conn.toColumn !== 0) return conn
            if (conn.startsAtNode && index === originMainIndex) return conn
            return { ...conn, dashed: true }
          }),
        }
      }

      return patched
    })
  }, [filteredNodes, originMainIndex, worktreeWipNodes])

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
