import { useMemo, useState, useCallback } from 'react'
import type { MockPR, SortKey, SortDir } from '../types'

// The PR list's own state hooks, kept out of `ListHelpers.tsx` so that file exports components
// only — a module mixing a component with a hook loses Vite's Fast Refresh
// (`react/only-export-components`).

export function usePRSort(prs: MockPR[], sortKey: SortKey, sortDir: SortDir): MockPR[] {
  return useMemo(
    () =>
      [...prs].sort((a, b) => {
        let cmp = 0
        if (sortKey === 'date') cmp = a.updatedAt.getTime() - b.updatedAt.getTime()
        else if (sortKey === 'status') cmp = a.status.localeCompare(b.status)
        else if (sortKey === 'author') cmp = a.author.localeCompare(b.author)
        else if (sortKey === 'repo') cmp = a.repo.localeCompare(b.repo)
        else if (sortKey === 'files') cmp = a.filesChanged - b.filesChanged
        return sortDir === 'desc' ? -cmp : cmp
      }),
    [prs, sortKey, sortDir]
  )
}

export function useSetFilter(
  initial?: Iterable<string>
): [Set<string>, (v: string) => void, () => void] {
  const [set, setSet] = useState<Set<string>>(() => new Set(initial))
  const toggle = useCallback(
    (v: string) =>
      setSet((prev) => {
        const n = new Set(prev)
        if (n.has(v)) n.delete(v)
        else n.add(v)
        return n
      }),
    []
  )
  const clear = useCallback(() => setSet(new Set()), [])
  return [set, toggle, clear]
}
