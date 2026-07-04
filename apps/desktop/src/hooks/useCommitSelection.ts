import { useState, useCallback } from 'react'
import type { GitGraphNode } from '@git-manager/git-types'

export function useCommitSelection(
  filteredNodes: GitGraphNode[],
  onSelectCommit?: (oid: string) => void
) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [primaryOid, setPrimaryOid] = useState<string | null>(null)
  const [anchorOid, setAnchorOid] = useState<string | null>(null)

  const selectSingle = useCallback((oid: string) => {
    setSelected(new Set([oid]))
    setPrimaryOid(oid)
    setAnchorOid(oid)
    onSelectCommit?.(oid)
  }, [onSelectCommit])

  const clearSelection = useCallback(() => {
    setSelected(new Set())
    setPrimaryOid(null)
    setAnchorOid(null)
    onSelectCommit?.('')
  }, [onSelectCommit])

  const handleRowSelect = useCallback((e: React.MouseEvent, index: number) => {
    const oid = filteredNodes[index].commit.oid
    if (oid === 'WIP' || oid === 'CONFLICT') {
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
      for (let i = start; i <= end; i++) next.add(filteredNodes[i].commit.oid)
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
  }, [filteredNodes, anchorOid, selectSingle, onSelectCommit, primaryOid, clearSelection])

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

