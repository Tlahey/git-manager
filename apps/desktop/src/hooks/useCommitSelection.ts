import { useState, useCallback } from 'react'
import type { GitGraphNode } from '@git-manager/git-types'

/**
 * Synthetic graph rows (the working tree "WIP", per-worktree "WIP:<path>", and the rebase-conflict
 * "CONFLICT" row) aren't real commits, so they can never be part of a multi-commit selection group —
 * only picked on their own.
 */
function isSyntheticOid(oid: string): boolean {
  return oid === 'WIP' || oid === 'CONFLICT' || oid.startsWith('WIP:')
}

export function useCommitSelection(
  filteredNodes: GitGraphNode[],
  onSelectCommit?: (oid: string) => void
) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [primaryOid, setPrimaryOid] = useState<string | null>(null)
  const [anchorOid, setAnchorOid] = useState<string | null>(null)

  const selectSingle = useCallback(
    (oid: string) => {
      setSelected(new Set([oid]))
      setPrimaryOid(oid)
      setAnchorOid(oid)
      onSelectCommit?.(oid)
    },
    [onSelectCommit]
  )

  const clearSelection = useCallback(() => {
    setSelected(new Set())
    setPrimaryOid(null)
    setAnchorOid(null)
    onSelectCommit?.('')
  }, [onSelectCommit])

  const handleRowSelect = useCallback(
    (e: React.MouseEvent, index: number) => {
      const oid = filteredNodes[index].commit.oid
      // A synthetic row (WIP/CONFLICT) is only ever selectable on its own — a modifier click on it
      // toggles just that row rather than adding it to a group.
      if (isSyntheticOid(oid)) {
        if (primaryOid === oid) {
          clearSelection()
        } else {
          selectSingle(oid)
        }
        return
      }
      if (e.shiftKey && anchorOid) {
        const fromIndex = filteredNodes.findIndex((n) => n.commit.oid === anchorOid)
        const start = fromIndex === -1 ? index : Math.min(fromIndex, index)
        const end = fromIndex === -1 ? index : Math.max(fromIndex, index)
        const next = new Set<string>()
        // Skip synthetic rows caught inside the range (e.g. the WIP row at the top) so a group is
        // never contaminated by the working tree / conflict rows.
        for (let i = start; i <= end; i++) {
          const rowOid = filteredNodes[i].commit.oid
          if (!isSyntheticOid(rowOid)) next.add(rowOid)
        }
        setSelected(next)
        setPrimaryOid(oid)
        onSelectCommit?.(oid)
      } else if (e.metaKey || e.ctrlKey) {
        setSelected((prev) => {
          const next = new Set(prev)
          if (next.has(oid)) next.delete(oid)
          else next.add(oid)
          return next
        })
        setPrimaryOid(oid)
        setAnchorOid(oid)
        onSelectCommit?.(oid)
      } else {
        if (primaryOid === oid) {
          clearSelection()
        } else {
          selectSingle(oid)
        }
      }
    },
    [filteredNodes, anchorOid, selectSingle, onSelectCommit, primaryOid, clearSelection]
  )

  return {
    selected,
    setSelected,
    primaryOid,
    setPrimaryOid,
    selectSingle,
    handleRowSelect,
    clearSelection,
  }
}
