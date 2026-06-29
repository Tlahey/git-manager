import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react'

export function TableHeader() {
  return (
    <div className="flex items-center gap-3 px-4 py-1.5 bg-muted/10 border-b border-border text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60 shrink-0">
      <div className="w-3 shrink-0" />
      <div className="w-4 shrink-0" />
      <div className="flex-1 min-w-0">Item</div>
      <div className="shrink-0 w-[52px] text-right">Updated</div>
      <div className="shrink-0 w-[80px] text-center">Status</div>
      <div className="shrink-0 w-[90px]">Author</div>
      <div className="shrink-0 w-[60px] text-center">With</div>
      <div className="shrink-0 w-[110px]">Repo</div>
      <div className="shrink-0 w-[60px] text-center">CI</div>
      <div className="shrink-0 w-6" />
    </div>
  )
}

interface GroupHeaderProps {
  label: string
  count: number
  open: boolean
  onToggle: () => void
  accent?: string
}

export function GroupHeader({ label, count, open, onToggle, accent }: GroupHeaderProps) {
  return (
    <button
      onClick={onToggle}
      className="flex w-full items-center gap-2 px-4 py-2 bg-muted/20 hover:bg-muted/30 transition-colors border-b border-border/50 shrink-0"
    >
      {open ? (
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      ) : (
        <ChevronRight className="h-3 w-3 text-muted-foreground" />
      )}
      <span className={`text-[10px] font-semibold uppercase tracking-wider ${accent ?? 'text-muted-foreground'}`}>
        {label}
      </span>
      <span
        className={`rounded-full px-1.5 py-px text-[9px] font-bold leading-none ${
          accent ? 'bg-amber-500/20 text-amber-400' : 'bg-muted text-muted-foreground'
        }`}
      >
        {count}
      </span>
    </button>
  )
}

interface LoadMoreProps {
  total: number
  shown: number
  onLoadMore: () => void
}

export function LoadMore({ total, shown, onLoadMore }: LoadMoreProps) {
  if (shown >= total) return null
  return (
    <div className="flex items-center justify-center py-3 border-t border-border/30 shrink-0">
      <button
        onClick={onLoadMore}
        className="flex items-center gap-2 text-[11px] text-muted-foreground hover:text-foreground border border-border hover:border-border/80 hover:bg-accent/40 rounded-lg px-4 py-1.5 transition-colors"
      >
        <RefreshCw className="h-3 w-3" /> Load more ({total - shown} remaining)
      </button>
    </div>
  )
}

import { useMemo, useState, useCallback } from 'react'
import type { MockPR, SortKey, SortDir } from '../types'

export function usePRSort(prs: MockPR[], sortKey: SortKey, sortDir: SortDir): MockPR[] {
  return useMemo(() => [...prs].sort((a, b) => {
    let cmp = 0
    if (sortKey === 'date') cmp = a.updatedAt.getTime() - b.updatedAt.getTime()
    else if (sortKey === 'status') cmp = a.status.localeCompare(b.status)
    else if (sortKey === 'author') cmp = a.author.localeCompare(b.author)
    else if (sortKey === 'repo') cmp = a.repo.localeCompare(b.repo)
    else if (sortKey === 'files') cmp = a.filesChanged - b.filesChanged
    return sortDir === 'desc' ? -cmp : cmp
  }), [prs, sortKey, sortDir])
}

export function useSetFilter(): [Set<string>, (v: string) => void, () => void] {
  const [set, setSet] = useState<Set<string>>(new Set())
  const toggle = useCallback((v: string) => setSet(prev => { const n = new Set(prev); if (n.has(v)) n.delete(v); else n.add(v); return n }), [])
  const clear = useCallback(() => setSet(new Set()), [])
  return [set, toggle, clear]
}

