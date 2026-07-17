import { useEffect, useState } from 'react'
import { apiCountDefaultFileMatches } from '../api/worktree.api'

/**
 * Live, debounced count of how many repo files each default-file glob pattern matches, keyed by the
 * pattern string. Powers the "N files" hint shown next to each pattern input in the worktree
 * default-files editor. Counting is scoped to `repoPath` (the copy source), matching the backend's
 * actual copy rules.
 *
 * Returns a `Record<pattern, count>`; a pattern absent from the map has no known count yet (still
 * debouncing, empty, or errored). Debounced so it doesn't fire a command on every keystroke.
 */
export function useDefaultFileMatchCounts(
  repoPath: string | null,
  patterns: string[]
): Record<string, number> {
  const [counts, setCounts] = useState<Record<string, number>>({})
  // A stable dependency for the effect: the effect closes over `patterns`, but re-running it on a
  // fresh-array identity every render would defeat the debounce — key off the content instead.
  const key = patterns.join('\n')

  useEffect(() => {
    if (!repoPath) {
      setCounts({})
      return
    }
    const nonEmpty = patterns.map((p) => p.trim()).filter(Boolean)
    if (nonEmpty.length === 0) {
      setCounts({})
      return
    }
    let cancelled = false
    const handle = setTimeout(() => {
      apiCountDefaultFileMatches(repoPath, nonEmpty)
        .then((res) => {
          if (cancelled) return
          const map: Record<string, number> = {}
          nonEmpty.forEach((pattern, i) => {
            map[pattern] = res[i] ?? 0
          })
          setCounts(map)
        })
        .catch(() => {
          if (!cancelled) setCounts({})
        })
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
    // `key` stands in for `patterns` (see above); `patterns` itself changes identity every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoPath, key])

  return counts
}
