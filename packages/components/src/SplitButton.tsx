import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  type ButtonProps,
} from '@git-manager/ui'

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
  /** Underlying `Button` visual variant for both segments. Defaults to `default` (primary fill). */
  variant?: ButtonProps['variant']
  /** Underlying `Button` size for both segments. `sm` fits dense contexts like table rows. */
  size?: ButtonProps['size']
  /** Base id for `data-testid`s: `${testIdPrefix}-btn` / `${testIdPrefix}-menu-btn`. Omitted
   * entirely (no attribute) when not provided. */
  testIdPrefix?: string
}

/**
 * A primary action button with a caret dropdown for chained/alternate variants
 * (e.g. "Commit" + "Commit & Push" / "Commit & Rebase"). Purely presentational —
 * callers own what each action means.
 */
export function SplitButton({
  label,
  icon,
  onClick,
  actions,
  disabled,
  busy,
  align = 'right',
  variant,
  size,
  testIdPrefix,
}: SplitButtonProps) {
  // A compact size keeps the caret segment from ballooning; `icon` sizing is squashed to a caret.
  const caretPadding = size === 'sm' ? 'px-1' : 'px-1.5'
  return (
    <div className="flex items-stretch">
      <Button
        variant={variant}
        size={size}
        data-testid={testIdPrefix ? `${testIdPrefix}-btn` : undefined}
        disabled={disabled || busy}
        className="gap-1.5 rounded-r-none"
        onClick={onClick}
      >
        {icon}
        {label}
      </Button>
      {actions.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant={variant}
              size={size}
              data-testid={testIdPrefix ? `${testIdPrefix}-menu-btn` : undefined}
              disabled={disabled || busy}
              className={`border-primary-foreground/20 rounded-l-none border-l ${caretPadding}`}
              aria-label="More options"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align={align === 'right' ? 'end' : 'start'}
            className="min-w-[200px]"
          >
            {actions.map((action) => (
              <DropdownMenuItem
                key={action.key}
                onSelect={action.onSelect}
                className="gap-2 text-xs"
              >
                {action.icon}
                <span>{action.label}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}
