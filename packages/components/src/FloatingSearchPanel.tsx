import { useEffect, useRef, type ReactNode } from 'react'
import { Search, X } from 'lucide-react'

export interface FloatingSearchPanelProps {
  /** Renders nothing when false, so a caller can mount it unconditionally beside its content. */
  open: boolean
  value: string
  onValueChange: (value: string) => void
  /** Escape, and the close button. A caller that also clears the query does so here. */
  onClose: () => void
  placeholder: string
  /** Accessible name of the close button — this package has no i18n of its own. */
  closeLabel: string
  /** Enter / Shift+Enter, for a search that steps through matches rather than filtering in place. */
  onNext?: () => void
  onPrevious?: () => void
  /** Anything between the field and the close button: a match counter, step arrows. */
  children?: ReactNode
  /** `data-testid` for the panel; the field gets `${testId}-input`. */
  testId?: string
  /** Extra classes on the panel, e.g. a different anchor than the default top-right. */
  className?: string
}

/**
 * The floating search field a view opens over its own content, anchored top-right of the nearest
 * positioned ancestor.
 *
 * **A panel rather than a field on the toolbar**, which is what the files and board views used to
 * carry. A permanent field spends toolbar width on a control most of the time nobody is using, and
 * it made "search" look like a different feature on each view — a box here, a button there. The
 * three views now ask for it the same way (a toolbar button, ⌘F) and get the same thing.
 *
 * Deliberately unopinionated about what searching *means*: the graph steps through matches
 * (`onNext`/`onPrevious`, plus a counter in `children`), while the files and board views filter in
 * place and pass neither. That difference belongs to the caller — this owns the shape, the
 * focus-on-open, and Escape.
 */
export function FloatingSearchPanel({
  open,
  value,
  onValueChange,
  onClose,
  placeholder,
  closeLabel,
  onNext,
  onPrevious,
  children,
  testId,
  className,
}: FloatingSearchPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  // Opening a search that isn't focused means asking the user to click the thing they just opened.
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  if (!open) return null

  return (
    <div
      className={`z-panel border-border bg-popover absolute top-3 right-3 flex h-9 items-center gap-1.5 rounded-md border px-2.5 shadow-lg ${className ?? ''}`}
      data-testid={testId}
    >
      <Search className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            onClose()
          } else if (e.key === 'Enter' && (onNext || onPrevious)) {
            e.preventDefault()
            if (e.shiftKey) onPrevious?.()
            else onNext?.()
          }
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className="placeholder:text-muted-foreground w-48 min-w-0 bg-transparent text-sm outline-hidden"
        data-testid={testId ? `${testId}-input` : undefined}
      />
      {children}
      <button
        type="button"
        onClick={onClose}
        aria-label={closeLabel}
        className="text-muted-foreground hover:bg-accent hover:text-foreground shrink-0 cursor-pointer rounded p-0.5 transition-colors"
        data-testid={testId ? `${testId}-close` : undefined}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
