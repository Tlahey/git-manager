import type { ReactNode } from 'react'
import { NOTCH_ROW, withRule } from '../notchGeometry'
import { toneColor } from '../notchTones'
import type { NotchTone } from '../types'

export interface NotchHeaderRowProps {
  tone: NotchTone
  /** The small uppercase line: what kind of thing this is. */
  eyebrow: string
  /** Where it happened — repository, worktree, package. */
  context?: string
  /** Right-aligned: a relative time, an elapsed duration. */
  meta?: string
  /**
   * The per-kind glyph. A node rather than a model field because the model has to survive
   * `JSON.stringify` on its way into the popover window's URL, and a React element does not.
   */
  icon?: ReactNode
}

/**
 * Row 1 of every card: what happened, and where.
 *
 * Identical across all three kinds — a progress card and a merged-PR card answer "what/where" the
 * same way, and only their bodies differ.
 */
export function NotchHeaderRow({ tone, eyebrow, context, meta, icon }: NotchHeaderRowProps) {
  return (
    <div
      data-testid="notch-header-row"
      style={{ height: withRule(NOTCH_ROW.header) }}
      className="flex shrink-0 items-center gap-2.5 border-b border-white/5 px-3"
    >
      {icon !== undefined && <div className="shrink-0">{icon}</div>}
      <div className="min-w-0 flex-1">
        <p
          data-testid="notch-eyebrow"
          className="truncate text-[9px] font-bold tracking-[0.16em] uppercase"
          style={{ color: toneColor(tone) }}
        >
          {eyebrow}
        </p>
        {context !== undefined && (
          <p data-testid="notch-context" className="truncate text-xs font-bold text-white">
            {context}
          </p>
        )}
      </div>
      {meta !== undefined && (
        <span data-testid="notch-meta" className="shrink-0 text-[10px] text-white/35 tabular-nums">
          {meta}
        </span>
      )}
    </div>
  )
}
