import type { ReactNode } from 'react'
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react'
import { Tag, type TagTone } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'

export function TableHeader() {
  const { t } = useTranslation('launchpad')
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-border bg-muted/10 px-4 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60">
      <div className="w-7 shrink-0" />
      <div className="w-4 shrink-0" />
      <div className="min-w-0 flex-1">{t('table.item')}</div>
      <div className="w-[52px] shrink-0 text-right">{t('table.updated')}</div>
      <div className="w-[80px] shrink-0 text-center">{t('table.status')}</div>
      <div className="w-[90px] shrink-0">{t('table.author')}</div>
      <div className="w-[60px] shrink-0 text-center">{t('table.with')}</div>
      <div className="w-[110px] shrink-0">{t('table.repo')}</div>
      <div className="w-[60px] shrink-0 text-center">{t('table.ci')}</div>
      <div className="w-[150px] shrink-0" />
    </div>
  )
}

interface GroupHeaderProps {
  label: string
  count: number
  open: boolean
  onToggle: () => void
  /** Section icon, rendered before the count/label and coloured via {@link iconClassName}. */
  icon?: ReactNode
  /** Colour class for the icon (e.g. `text-green-400`) — the only coloured element; the label
   * itself stays foreground/black. */
  iconClassName?: string
  /** Tone of the count `Tag`. Defaults to `neutral`. */
  tone?: TagTone
}

export function GroupHeader({
  label,
  count,
  open,
  onToggle,
  icon,
  iconClassName,
  tone = 'neutral',
}: GroupHeaderProps) {
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
      {icon && <span className={`flex items-center ${iconClassName ?? ''}`}>{icon}</span>}
      <Tag tone={tone}>{count}</Tag>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground">
        {label}
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
  const { t } = useTranslation('launchpad')
  if (shown >= total) return null
  return (
    <div className="flex shrink-0 items-center justify-center border-t border-border/30 py-3">
      <button
        onClick={onLoadMore}
        className="flex items-center gap-2 rounded-lg border border-border px-4 py-1.5 text-[11px] text-muted-foreground transition-colors hover:border-border/80 hover:bg-accent/40 hover:text-foreground"
      >
        <RefreshCw className="h-3 w-3" /> {t('loadMore', { count: total - shown })}
      </button>
    </div>
  )
}

import { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import type { MockPR, SortKey, SortDir } from '../types'

interface InfiniteScrollSentinelProps {
  /** Whether more rows remain to reveal. When false, nothing renders and no observer is attached. */
  hasMore: boolean
  onLoadMore: () => void
  /**
   * The number of rows currently rendered. Passed as a dependency so the observer reconnects after
   * each load — if the sentinel is still in view (e.g. the viewport isn't filled yet), it fires
   * again to reveal the next page rather than stalling until the user scrolls.
   */
  loadedCount: number
}

/**
 * Bottom marker that reveals the next page when it scrolls into view — the lazy-loading counterpart
 * to {@link LoadMore}'s explicit button. A generous `rootMargin` starts the load slightly before the
 * marker is actually visible, so rows are ready by the time the user reaches them.
 */
export function InfiniteScrollSentinel({
  hasMore,
  onLoadMore,
  loadedCount,
}: InfiniteScrollSentinelProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const onLoadMoreRef = useRef(onLoadMore)
  onLoadMoreRef.current = onLoadMore

  useEffect(() => {
    const el = ref.current
    if (!el || !hasMore) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onLoadMoreRef.current()
      },
      { rootMargin: '300px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [hasMore, loadedCount])

  if (!hasMore) return null
  return <div ref={ref} data-testid="infinite-scroll-sentinel" className="h-4 w-full shrink-0" />
}

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
