import { useEffect, useState } from 'react'

/**
 * Up/down navigation through the active search's matches (the floating CommitSearchPanel), kept
 * in bounds as the match count changes and reset to the first match whenever the query itself
 * changes (find-as-you-type).
 *
 * Extracted from GitGraph.tsx (2026-08 retrofit, see architecture-guardian skill's R3).
 */
export function useSearchNavigation(searchQuery: string | undefined, totalMatches: number) {
  const [activeMatchIndex, setActiveMatchIndex] = useState(0)
  // Jump back to the first match whenever the query itself changes (find-as-you-type).
  useEffect(() => {
    setActiveMatchIndex(0)
  }, [searchQuery])
  const clampedMatchIndex = totalMatches === 0 ? 0 : Math.min(activeMatchIndex, totalMatches - 1)

  function goToNextMatch() {
    if (totalMatches === 0) return
    setActiveMatchIndex((i) => (i + 1) % totalMatches)
  }
  function goToPreviousMatch() {
    if (totalMatches === 0) return
    setActiveMatchIndex((i) => (i - 1 + totalMatches) % totalMatches)
  }

  return { clampedMatchIndex, goToNextMatch, goToPreviousMatch }
}
