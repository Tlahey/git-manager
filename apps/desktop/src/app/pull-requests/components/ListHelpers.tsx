import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react'

export function TableHeader() {
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-border bg-muted/10 px-4 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60">
      <div className="w-3 shrink-0" />
      <div className="w-4 shrink-0" />
      <div className="min-w-0 flex-1">Item</div>
      <div className="w-[52px] shrink-0 text-right">Updated</div>
      <div className="w-[80px] shrink-0 text-center">Status</div>
      <div className="w-[90px] shrink-0">Author</div>
      <div className="w-[60px] shrink-0 text-center">With</div>
      <div className="w-[110px] shrink-0">Repo</div>
      <div className="w-[60px] shrink-0 text-center">CI</div>
      <div className="w-6 shrink-0" />
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
      className="flex w-full shrink-0 items-center gap-2 border-b border-border/50 bg-muted/20 px-4 py-2 transition-colors hover:bg-muted/30"
    >
      {open ? (
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      ) : (
        <ChevronRight className="h-3 w-3 text-muted-foreground" />
      )}
      <span
        className={`text-[10px] font-semibold uppercase tracking-wider ${accent ?? 'text-muted-foreground'}`}
      >
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
    <div className="flex shrink-0 items-center justify-center border-t border-border/30 py-3">
      <button
        onClick={onLoadMore}
        className="flex items-center gap-2 rounded-lg border border-border px-4 py-1.5 text-[11px] text-muted-foreground transition-colors hover:border-border/80 hover:bg-accent/40 hover:text-foreground"
      >
        <RefreshCw className="h-3 w-3" /> Load more ({total - shown} remaining)
      </button>
    </div>
  )
}

import { useMemo, useState, useCallback } from 'react'
import type { MockPR, SortKey, SortDir } from '../types'

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

export function useSetFilter(): [Set<string>, (v: string) => void, () => void] {
  const [set, setSet] = useState<Set<string>>(new Set())
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
