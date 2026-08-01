import { Spinner, NumberBadge } from '@git-manager/ui'

export interface ToolbarButtonProps {
  icon: React.ReactNode
  label: string
  loading?: boolean
  disabled?: boolean
  title?: string
  /** Hides the label below the `lg` breakpoint to save room. */
  hideLabelOnNarrow?: boolean
  /** Numbered pill overlaid on the icon (e.g. commits to push/pull). Hidden when ≤ 0. */
  badge?: number
  onClick?: () => void
  /**
   * A second segment attached to the right — a dropdown trigger, in practice.
   *
   * When present the button's right corners are squared and the two are wrapped together, so they
   * read as one control rather than two buttons that happen to touch. Added rather than letting a
   * caller hand-roll the pair: doing that means re-deriving the badge, the label fold and the
   * disabled styling, and the one place that tried diverged from `NumberBadge` immediately.
   */
  trailing?: React.ReactNode
  'data-testid'?: string
}

/**
 * Action button for the main toolbar: icon on top, label underneath, the label folding away on
 * narrow screens.
 *
 * The fold is keyed on the viewport here, unlike the diff toolbar's (see `diffToolbar.css`): this
 * bar spans the whole window, so the window's width *is* the space it has.
 */
export function ToolbarButton({
  icon,
  label,
  loading,
  disabled,
  title,
  hideLabelOnNarrow = true,
  badge,
  onClick,
  trailing,
  'data-testid': dataTestId,
}: ToolbarButtonProps) {
  const showBadge = !loading && typeof badge === 'number' && badge > 0
  const button = (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      title={title ?? label}
      data-testid={dataTestId}
      className={`group relative flex min-w-[40px] shrink-0 flex-col items-center justify-center gap-0.5 px-2 py-1 transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40 ${
        trailing ? 'rounded-l' : 'rounded'
      }`}
    >
      <span className="relative flex h-4 w-4 items-center justify-center">
        {loading ? <Spinner className="h-4 w-4 text-muted-foreground" /> : icon}
        {showBadge && (
          <NumberBadge
            count={badge}
            data-testid="toolbar-button-badge"
            // Screen readers get the descriptive title (e.g. "2 commits to pull") instead of a
            // bare "2"; the `--badge` tokens keep the pill AA-legible on every theme, and the
            // sidebar-matched ring lifts it clear of the icon it overlaps.
            aria-label={title ?? label}
            className="absolute -right-2 -top-1 min-h-0 min-w-3.5 px-1 text-[9px] ring-2 ring-sidebar"
          />
        )}
      </span>
      <span
        className={`text-[10px] leading-none text-muted-foreground transition-colors group-hover:text-foreground group-disabled:group-hover:text-muted-foreground ${
          hideLabelOnNarrow ? 'hidden lg:inline' : ''
        }`}
      >
        {label}
      </span>
    </button>
  )

  if (!trailing) return button

  return (
    <div className="flex shrink-0 items-stretch">
      {button}
      {trailing}
    </div>
  )
}
