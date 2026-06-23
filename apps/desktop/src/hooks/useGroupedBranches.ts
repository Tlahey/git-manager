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
 * Regroupe un tableau de branches locales par préfixe (feat/, fix/, chore/…).
 * Un groupe n'est créé que si ≥ 2 branches partagent le même préfixe.
 */
export function useGroupedBranches(branches: GitBranch[]): GroupedBranches {
  return useMemo(() => {
    // Comptage des préfixes
    const prefixCount = new Map<string, GitBranch[]>()

    for (const branch of branches) {
      if (branch.isRemote) continue
      const slashIdx = branch.shortName.indexOf('/')
      if (slashIdx > 0) {
        const prefix = branch.shortName.slice(0, slashIdx + 1) // ex: "feat/"
        const existing = prefixCount.get(prefix) ?? []
        prefixCount.set(prefix, [...existing, branch])
      }
    }

    // Groupes valides (≥ 2 branches)
    const validPrefixes = new Set<string>()
    for (const [prefix, bs] of prefixCount.entries()) {
      if (bs.length >= 2) validPrefixes.add(prefix)
    }

    const groupMap = new Map<string, GitBranch[]>()
    const ungrouped: GitBranch[] = []

    for (const branch of branches) {
      if (branch.isRemote) continue
      const slashIdx = branch.shortName.indexOf('/')
      const prefix = slashIdx > 0 ? branch.shortName.slice(0, slashIdx + 1) : null

      if (prefix && validPrefixes.has(prefix)) {
        const existing = groupMap.get(prefix) ?? []
        groupMap.set(prefix, [...existing, branch])
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
