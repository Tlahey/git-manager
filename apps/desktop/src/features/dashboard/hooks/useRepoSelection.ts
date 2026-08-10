import { useCallback, useMemo, useState } from 'react'

export interface RepoSelection {
  /** The selected paths, in the section's display order and pruned of anything no longer listed. */
  selectedPaths: string[]
  isSelected: (path: string) => boolean
  toggle: (path: string) => void
  /** Selects everything when nothing (or only some) is selected, clears when all already are. */
  toggleAll: () => void
  /** Selects every path unconditionally — the options menu's "Select All". */
  selectAll: () => void
  clear: () => void
  allSelected: boolean
  someSelected: boolean
}

/**
 * Checkbox selection scoped to one dashboard section.
 *
 * Selection is intentionally per-section rather than page-wide: the same repo appears in several
 * sections, and a bulk action ("remove from recent", "close tabs") only makes sense against the
 * section it was triggered from. Paths that leave `paths` — because a bulk action just removed them
 * — are filtered out on read rather than cleaned up in an effect, so the hook never renders twice
 * for the same change.
 */
export function useRepoSelection(paths: string[]): RepoSelection {
  const [rawSelected, setRawSelected] = useState<ReadonlySet<string>>(() => new Set())

  const selectedPaths = useMemo(() => paths.filter((p) => rawSelected.has(p)), [paths, rawSelected])

  const isSelected = useCallback((path: string) => rawSelected.has(path), [rawSelected])

  const toggle = useCallback((path: string) => {
    setRawSelected((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  const clear = useCallback(() => setRawSelected(new Set()), [])

  const selectAll = useCallback(() => setRawSelected(new Set(paths)), [paths])

  const allSelected = paths.length > 0 && selectedPaths.length === paths.length

  const toggleAll = useCallback(() => {
    setRawSelected((current) => {
      const everySelected = paths.length > 0 && paths.every((p) => current.has(p))
      return everySelected ? new Set() : new Set(paths)
    })
  }, [paths])

  return {
    selectedPaths,
    isSelected,
    toggle,
    toggleAll,
    selectAll,
    clear,
    allSelected,
    someSelected: selectedPaths.length > 0 && !allSelected,
  }
}
