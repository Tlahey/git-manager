import { useLayoutEffect, useRef, useState } from 'react'
import { Tooltip, cn } from '@git-manager/ui'

export interface TruncatedLabelProps {
  /** The (potentially overflowing) text. Also used verbatim as the tooltip content. */
  label: string
  /** Classes applied to the truncating text span. */
  className?: string
  /** Tooltip placement (forwarded to the shared Tooltip). */
  placement?: 'top' | 'bottom' | 'left' | 'right'
}

/**
 * A single-line, `truncate`d label that reveals its full text on hover **only when
 * it actually overflows** (measured via `scrollWidth > clientWidth`). The reveal uses
 * the shared accessible {@link Tooltip} — not a bare `title=` — so it flips away from
 * viewport edges, shows on keyboard focus, and is wired for assistive tech.
 *
 * Overflow is measured up front (and on resize) so the tooltip is enabled before the
 * first hover, avoiding a first-hover miss.
 */
export function TruncatedLabel({ label, className, placement = 'top' }: TruncatedLabelProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const [overflowing, setOverflowing] = useState(false)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => setOverflowing(el.scrollWidth > el.clientWidth + 1)
    check()
    const observer = new ResizeObserver(check)
    observer.observe(el)
    return () => observer.disconnect()
  }, [label])

  return (
    <Tooltip content={label} placement={placement} disabled={!overflowing} animate={false}>
      <span ref={ref} className={cn('block truncate', className)}>
        {label}
      </span>
    </Tooltip>
  )
}
