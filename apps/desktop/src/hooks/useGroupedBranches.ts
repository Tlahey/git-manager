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
 * Groups branches by their first path segment (`feat/`, `fix/`, `chore/`…). A group is only formed
 * when at least 2 branches share a prefix — a lone `feat/x` reads better as a plain row than as a
 * folder holding exactly one thing.
 *
 * `nameOf` gives the name to split on, which is not always `shortName`: a remote branch groups on
 * its name *relative to its remote*, so `origin/feat/a` folders under `feat/`, not under `origin/`.
 */
export function groupBranchesByPrefix(
  branches: GitBranch[],
  nameOf: (branch: GitBranch) => string
): GroupedBranches {
  const prefixOf = (branch: GitBranch): string | null => {
    const name = nameOf(branch)
    const slashIdx = name.indexOf('/')
    return slashIdx > 0 ? name.slice(0, slashIdx + 1) : null
  }

  const perPrefix = new Map<string, GitBranch[]>()
  for (const branch of branches) {
    const prefix = prefixOf(branch)
    if (!prefix) continue
    perPrefix.set(prefix, [...(perPrefix.get(prefix) ?? []), branch])
  }

  const groupMap = new Map<string, GitBranch[]>()
  const ungrouped: GitBranch[] = []
  for (const branch of branches) {
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
}

/** Local-branch grouping: remotes are dropped outright, and the prefix comes from `shortName`. */
export function useGroupedBranches(branches: GitBranch[]): GroupedBranches {
  return useMemo(
    () =>
      groupBranchesByPrefix(
        branches.filter((b) => !b.isRemote),
        (b) => b.shortName
      ),
    [branches]
  )
}
