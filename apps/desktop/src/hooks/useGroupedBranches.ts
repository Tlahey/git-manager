import { useMemo } from 'react'
import type { GitBranch } from '@git-manager/git-types'

export interface BranchGroup {
  prefix: string
  branches: GitBranch[]
}

export interface GroupedBranches {
  groups: BranchGroup[]
  ungrouped: GitBranch[]
}

/**
 * Groups local branches by prefix (`feat/`, `fix/`, `chore/`…). A group is only formed when at
 * least 2 branches share a prefix — a lone `feat/x` reads better as a plain row than as a folder
 * holding exactly one thing.
 *
 * Remote branches are grouped by `buildRemoteBranchTree` instead, on different terms: they nest to
 * any depth under their remote node, and a folder is formed even for a single branch.
 */
export function useGroupedBranches(branches: GitBranch[]): GroupedBranches {
  return useMemo(() => {
    const prefixOf = (branch: GitBranch): string | null => {
      const slashIdx = branch.shortName.indexOf('/')
      return slashIdx > 0 ? branch.shortName.slice(0, slashIdx + 1) : null
    }

    const perPrefix = new Map<string, GitBranch[]>()
    for (const branch of branches) {
      if (branch.isRemote) continue
      const prefix = prefixOf(branch)
      if (!prefix) continue
      perPrefix.set(prefix, [...(perPrefix.get(prefix) ?? []), branch])
    }

    const groupMap = new Map<string, GitBranch[]>()
    const ungrouped: GitBranch[] = []
    for (const branch of branches) {
      if (branch.isRemote) continue
      const prefix = prefixOf(branch)
      if (prefix && (perPrefix.get(prefix)?.length ?? 0) >= 2) {
        groupMap.set(prefix, [...(groupMap.get(prefix) ?? []), branch])
      } else {
        ungrouped.push(branch)
      }
    }

    const groups: BranchGroup[] = Array.from(groupMap.entries())
      .map(([prefix, brs]) => ({ prefix, branches: brs }))
      .sort((a, b) => a.prefix.localeCompare(b.prefix))

    return { groups, ungrouped }
  }, [branches])
}
