import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'
import { Button, cn } from '@git-manager/ui'
import { useAnchoredMenu } from './useAnchoredMenu'

export interface SplitButtonAction {
  key: string
  label: string
  icon?: ReactNode
  onSelect: () => void
}

interface SplitButtonProps {
  label: string
  icon?: ReactNode
  onClick: () => void
  actions: SplitButtonAction[]
  disabled?: boolean
  busy?: boolean
  /** Menu anchor alignment relative to the caret trigger. */
  align?: 'left' | 'right'
  /** Base id for `data-testid`s: `${testIdPrefix}-btn` / `${testIdPrefix}-menu-btn`. Omitted
   * entirely (no attribute) when not provided. */
  testIdPrefix?: string
}

/**
 * A primary action button with a caret dropdown for chained/alternate variants
 * (e.g. "Commit" + "Commit & Push" / "Commit & Rebase"). Menu is rendered via
 * portal and anchored to the caret button (`useAnchoredMenu`). Purely
 * presentational — callers own what each action means.
 */
export function SplitButton({ label, icon, onClick, actions, disabled, busy, align = 'right', testIdPrefix }: SplitButtonProps) {
  const { open, setOpen, pos, containerRef, triggerRef, menuRef } = useAnchoredMenu({ align })

  function choose(action: SplitButtonAction) {
    setOpen(false)
    action.onSelect()
  }

  return (
    <div ref={containerRef} className="flex items-stretch">
      <Button
        data-testid={testIdPrefix ? `${testIdPrefix}-btn` : undefined}
        disabled={disabled || busy}
        className="rounded-r-none gap-1.5"
        onClick={onClick}
      >
        {icon}
        {label}
      </Button>
      {actions.length > 0 && (
        <Button
          ref={triggerRef}
          data-testid={testIdPrefix ? `${testIdPrefix}-menu-btn` : undefined}
          disabled={disabled || busy}
          className="rounded-l-none border-l border-primary-foreground/20 px-1.5"
          onClick={() => setOpen((v) => !v)}
          aria-label="More options"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
      )}

      {open &&
        actions.length > 0 &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: 'fixed',
              top: pos.top,
              bottom: pos.bottom,
              left: pos.left,
              transform: align === 'right' ? 'translateX(-100%)' : undefined,
            }}
            className="z-50 min-w-[200px] rounded-md border border-border bg-popover py-1 text-popover-foreground shadow-lg"
          >
            {actions.map((action) => (
              <button
                key={action.key}
                type="button"
                onClick={() => choose(action)}
                className={cn('flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-accent')}
              >
                {action.icon}
                <span>{action.label}</span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  )
}
