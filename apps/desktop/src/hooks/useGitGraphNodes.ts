import { useMemo } from 'react'
import type { GitGraphNode } from '@git-manager/git-types'
import { getWaterlineBucket, bucketLabel } from '../components/git-graph/waterlineBuckets'

interface WaterlineMark {
  id: string
  label: string
  /** Index du commit (frontière) sur lequel l'overlay est positionné. */
  index: number
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
 * Dérive les données d'affichage du graphe (nœud WIP, filtrage recherche,
 * paliers temporels, position de origin/main) à partir des commits bruts.
 */
export function useGitGraphNodes(
  nodes: GitGraphNode[],
  searchQuery: string | undefined,
  totalChanges: number,
  t: TranslateFn,
) {
  const wipNode = useMemo(() => {
    if (totalChanges === 0 || nodes.length === 0) return null
    return buildWipNode(nodes)
  }, [totalChanges, nodes])

  const filteredNodes = useMemo(() => {
    const search = searchQuery?.trim().toLowerCase() ?? ''
    const baseNodes = wipNode ? [wipNode, ...nodes] : nodes
    if (!search) return baseNodes
    return baseNodes.filter((node) => {
      if (node.commit.oid === 'WIP') {
        return 'wip'.includes(search)
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
  }, [nodes, searchQuery, wipNode])

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

  return { wipNode, filteredNodes, waterlines, originMainIndex }
}
