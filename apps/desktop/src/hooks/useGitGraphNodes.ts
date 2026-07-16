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

/** Fixed color for every "// WIP" synthetic row (own repo and other worktrees alike) — always
 * this violet, never the target branch's own color, so a WIP row reads as "not a real commit"
 * at a glance regardless of which branch it's attached to. */
const WIP_COLOR = '#7c3aed'

function buildWipNode(nodes: GitGraphNode[]): GitGraphNode {
  const firstNode = nodes[0]
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
      parentOids: [firstNode.commit.oid],
    },
    column: 0,
    color: WIP_COLOR,
    connections: [
      {
        fromColumn: 0,
        toColumn: 0,
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
function buildConflictNode(nodes: GitGraphNode[]): GitGraphNode {
  const firstNode = nodes[0]
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
      parentOids: firstNode ? [firstNode.commit.oid] : [],
    },
    column: 0,
    color: '#f97316',
    connections: firstNode
      ? [
          {
            fromColumn: 0,
            toColumn: 0,
            color: '#f97316',
            dashed: true,
          },
        ]
      : [],
    refs: [],
  }
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
 * Also carries every other active lane's pass-through connection from `anchor` (any column
 * besides this node's own offset one) — INCLUDING `anchor.column` itself, since splicing this
 * row in between `anchor` and whatever real commit sits above it would otherwise cut that lane's
 * own line in two: this row needs to draw both its own dashed WIP connector AND a plain solid
 * continuation of the real branch's line straight through it. `anchor.connections` already knows
 * exactly which lanes are active there since it's a real, backend-computed row — we just strip
 * any `dashed`/`startsAtNode`/`endsAtNode` flags when copying, because those describe an
 * arrival/departure at `anchor`'s specific commit, not a plain flow-through of this synthetic
 * row. The oid is namespaced (`WIP:<path>`) so multiple of these can coexist and `GraphRow.tsx`
 * can tell them apart from the primary `'WIP'` row (which stays editable/committable) and from
 * each other.
 */
function buildWorktreeWipNode(anchor: GitGraphNode, wip: WorktreeWipStatus): GitGraphNode {
  // Pick a lane that no line already occupies at the anchor row. Placing the synthetic node
  // blindly on `anchor.column + 1` breaks whenever another branch's lane already runs there:
  // that lane's pass-through gets dropped by the `!== column` filter below, so its line shows a
  // gap through this row, and the WIP node/connector lands right on top of it — the visible
  // "décalage" where a WIP sits in the middle of an unrelated branch's path. Every column
  // touched by any of the anchor's edges (verticals AND the diagonal legs of a merge/split) is
  // occupied, so walk outward from just right of the anchor to the first genuinely free lane.
  const occupied = new Set<number>([anchor.column])
  for (const c of anchor.connections) {
    occupied.add(c.fromColumn)
    occupied.add(c.toColumn)
  }
  let column = anchor.column + 1
  while (occupied.has(column)) column++

  const passThroughs = anchor.connections
    .filter((c) => c.fromColumn === c.toColumn && c.fromColumn !== column)
    .map((c) => ({ fromColumn: c.fromColumn, toColumn: c.toColumn, color: c.color }))
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
  worktreeWipStatuses: WorktreeWipStatus[] = []
) {
  const conflictNode = useMemo(() => {
    if (!conflictInfo || nodes.length === 0) return null
    return buildConflictNode(nodes)
  }, [conflictInfo, nodes])

  const wipNode = useMemo(() => {
    if (conflictNode || totalChanges === 0 || nodes.length === 0) return null
    return buildWipNode(nodes)
  }, [totalChanges, nodes, conflictNode])

  // One extra WIP row per dirty linked worktree, anchored to that worktree's checked-out
  // branch tip (when that tip is present in the currently loaded `nodes` page) — lets several
  // "// WIP" rows coexist across different branches/lanes at once.
  const worktreeWipNodes = useMemo(() => {
    if (worktreeWipStatuses.length === 0 || nodes.length === 0) return []
    return worktreeWipStatuses
      .map((wip) => {
        const anchor = nodes.find((n) =>
          n.refs.some((r) => r.type === 'branch' && r.shortName === wip.branch)
        )
        return anchor ? { anchor, node: buildWorktreeWipNode(anchor, wip) } : null
      })
      .filter((entry): entry is { anchor: GitGraphNode; node: GitGraphNode } => entry !== null)
  }, [nodes, worktreeWipStatuses])

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
    // Every synthetic WIP row needs the row immediately below it (its anchor commit) to carry a
    // matching connection, or GraphSvg has nothing to draw the dashed line into. The primary WIP
    // row always anchors at index 1/column 0 with a plain vertical (same column both ends).
    // Per-worktree WIP rows anchor wherever they were inserted, but the connector is a diagonal
    // "arrival" patched onto the anchor (fromColumn = the WIP row's offset column, toColumn =
    // the anchor's own column) — see `buildWorktreeWipNode`'s comment for why it's this way
    // round (starts at the commit, rises into the WIP row) rather than the other.
    const continuityPatches: { index: number; fromColumn: number; toColumn: number; color: string }[] =
      []

    if (totalChanges > 0 || conflictNode) {
      continuityPatches.push({ index: 1, fromColumn: 0, toColumn: 0, color: '#7c3aed' })
    }

    for (const { anchor, node: syntheticNode } of worktreeWipNodes) {
      const syntheticIndex = filteredNodes.indexOf(syntheticNode)
      if (syntheticIndex !== -1) {
        continuityPatches.push({
          index: syntheticIndex + 1,
          fromColumn: syntheticNode.column,
          toColumn: anchor.column,
          color: WIP_COLOR,
        })
      }
    }

    return filteredNodes.map((node, index) => {
      let patched = node

      const patch = continuityPatches.find((p) => p.index === index && node.column === p.toColumn)
      if (patch) {
        // Only an edge that reaches UP into this node (arriving from the top of the row) already
        // wires it to the WIP row above. A `startsAtNode`-only edge is a *departure* going down to
        // a parent — e.g. a merge commit's straight line to its first parent — and does NOT reach
        // the WIP; treating it as "already connected" is what left the top merge unlinked. So we
        // still add the connector unless a non-`startsAtNode` edge on that lane is present.
        const hasUpwardEdge = node.connections.some(
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

      if (originMainIndex !== -1 && index <= originMainIndex) {
        // A merge commit's own straight-down departure to its real first parent — the mainline
        // continuing solid *below* the merge dot — is already-established history, not something
        // "not yet pushed". Keep that one structural segment solid even though the merge itself is
        // ahead of origin/main (its other, diagonal, parent leg is already left solid because it
        // isn't a column-0→column-0 edge). Everything else on column 0 — the line arriving from
        // above, and every plain non-merge commit's full vertical — still gets the dashed
        // "ahead of origin" treatment, so a straight run of unpushed commits stays continuously
        // dashed down to the origin/main boundary.
        const isMerge = node.commit.parentOids.length >= 2
        patched = {
          ...patched,
          connections: patched.connections.map((conn) => {
            if (conn.fromColumn !== 0 || conn.toColumn !== 0) return conn
            if (isMerge && conn.startsAtNode) return conn
            return { ...conn, dashed: true }
          }),
        }
      }

      return patched
    })
  }, [filteredNodes, totalChanges, originMainIndex, conflictNode, worktreeWipNodes])

  return { wipNode, conflictNode, filteredNodes, renderNodes, waterlines, originMainIndex, matchingOids }
}
