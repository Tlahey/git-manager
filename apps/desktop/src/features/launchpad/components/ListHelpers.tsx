import { useEffect, useRef, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react'
import { Tag, type TagTone } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'

/**
 * The column strip above a Launchpad list.
 *
 * Its widths are hand-matched to `PRRow` / `IssueRow`, which carry their own — a header and its
 * rows are two files that have to agree, and nothing but a test makes them. `ListHelpers.test.tsx`
 * compares the two slot by slot, because the failure mode here is silent: a header that lists the
 * right columns in the wrong order still renders perfectly, just over the wrong data.
 *
 * The PR and issue variants differ in exactly two things — where the status sits and what the
 * assignee column is called — so they share this body rather than being two copies. They were two
 * copies, and the issue one had drifted into a different column order entirely.
 */
function ListTableHeader({
  statusAlign,
  peopleLabel,
}: {
  statusAlign: 'text-left' | 'text-center'
  peopleLabel: string
}) {
  const { t } = useTranslation('launchpad')
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-border bg-muted/10 px-4 py-1.5 text-[9px] font-semibold tracking-wider text-muted-foreground/60 uppercase">
      <div className="w-7 shrink-0" />
      <div className="w-[52px] shrink-0 text-right">{t('table.updated')}</div>
      <div className={`w-[70px] shrink-0 ${statusAlign}`}>{t('table.status')}</div>
      <div className="min-w-0 flex-1">{t('table.item')}</div>
      <div className="w-[90px] shrink-0">{t('table.author')}</div>
      <div className="w-[60px] shrink-0 text-center">{peopleLabel}</div>
      <div className="w-[130px] shrink-0">{t('table.repo')}</div>
      <div className="w-[150px] shrink-0" />
    </div>
  )
}

/** The pull-request lists' column strip. `PRRow` left-aligns its status badge. */
export function TableHeader() {
  const { t } = useTranslation('launchpad')
  return <ListTableHeader statusAlign="text-left" peopleLabel={t('table.with')} />
}

/** The issue lists' column strip — the Issues tab and a custom view's issue results, which render
 * the same `IssueRow`. It centres its status badge where `PRRow` left-aligns one. */
export function IssueTableHeader() {
  const { t } = useTranslation('launchpad')
  return <ListTableHeader statusAlign="text-center" peopleLabel={t('table.assigned')} />
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
      className="flex w-full shrink-0 cursor-pointer items-center gap-2 border-b border-border/50 bg-muted/20 px-4 py-2 transition-colors hover:bg-muted/30"
    >
      {open ? (
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      ) : (
        <ChevronRight className="h-3 w-3 text-muted-foreground" />
      )}
      {icon && <span className={`flex items-center ${iconClassName ?? ''}`}>{icon}</span>}
      <Tag tone={tone}>{count}</Tag>
      <span className="text-[10px] font-semibold tracking-wider text-foreground uppercase">
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
        className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-4 py-1.5 text-[11px] text-muted-foreground transition-colors hover:border-border/80 hover:bg-accent/40 hover:text-foreground"
      >
        <RefreshCw className="h-3 w-3" /> {t('loadMore', { count: total - shown })}
      </button>
    </div>
  )
}

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
