import { useMemo } from 'react'
import type { GitGraphNode } from '@git-manager/git-types'
import { getWaterlineBucket, bucketLabel } from '../components/git-graph/waterlineBuckets'

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

function buildWipNode(nodes: GitGraphNode[]) {
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
    color: '#7c3aed',
    connections: [
      {
        fromColumn: 0,
        toColumn: 0,
        color: '#7c3aed',
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
function buildConflictNode(nodes: GitGraphNode[]) {
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
 * Dérive les données d'affichage du graphe (nœud WIP, nœud conflit, filtrage recherche,
 * paliers temporels, position de origin/main) à partir des commits bruts.
 */
export function useGitGraphNodes(
  nodes: GitGraphNode[],
  searchQuery: string | undefined,
  totalChanges: number,
  t: TranslateFn,
  conflictInfo: ConflictRowInfo | null,
) {
  const conflictNode = useMemo(() => {
    if (!conflictInfo || nodes.length === 0) return null
    return buildConflictNode(nodes)
  }, [conflictInfo, nodes])

  const wipNode = useMemo(() => {
    if (conflictNode || totalChanges === 0 || nodes.length === 0) return null
    return buildWipNode(nodes)
  }, [totalChanges, nodes, conflictNode])

  const filteredNodes = useMemo(() => {
    const search = searchQuery?.trim().toLowerCase() ?? ''
    const specialNode = conflictNode ?? wipNode
    const baseNodes = specialNode ? [specialNode, ...nodes] : nodes
    if (!search) return baseNodes
    return baseNodes.filter((node) => {
      if (node.commit.oid === 'WIP') {
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
  }, [nodes, searchQuery, wipNode, conflictNode])

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
        n.refs.some((r) => r.shortName === 'origin/main' || r.shortName === 'origin/master'),
      ),
    [filteredNodes],
  )

  // Nodes ready for rendering: same as filteredNodes, but with the WIP→first-commit
  // connector and the dashed origin/main boundary already patched in. Derived once here
  // rather than per visible row on every render (that used to re-run this reasoning inside
  // the virtualization loop's .map() callback).
  const renderNodes = useMemo(() => {
    return filteredNodes.map((node, index) => {
      let patched = node

      if ((totalChanges > 0 || conflictNode) && index === 1 && node.column === 0) {
        const hasCol0 = node.connections.some((c) => c.fromColumn === 0 && c.toColumn === 0)
        if (!hasCol0) {
          patched = {
            ...patched,
            connections: [
              ...patched.connections,
              { fromColumn: 0, toColumn: 0, color: '#7c3aed', dashed: true },
            ],
          }
        }
      }

      if (originMainIndex !== -1 && index <= originMainIndex) {
        patched = {
          ...patched,
          connections: patched.connections.map((conn) =>
            conn.fromColumn === 0 && conn.toColumn === 0 ? { ...conn, dashed: true } : conn,
          ),
        }
      }

      return patched
    })
  }, [filteredNodes, totalChanges, originMainIndex, conflictNode])

  return { wipNode, conflictNode, filteredNodes, renderNodes, waterlines, originMainIndex }
}
