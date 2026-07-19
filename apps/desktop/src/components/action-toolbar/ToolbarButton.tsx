import { Spinner } from '@git-manager/ui'

export interface ToolbarButtonProps {
  icon: React.ReactNode
  label: string
  loading?: boolean
  disabled?: boolean
  title?: string
  /** Masque le label sous le seuil `lg` pour gagner de la place. */
  hideLabelOnNarrow?: boolean
  /** Pastille numérotée en surimpression sur l'icône (ex. commits à pousser/récupérer). Masquée si ≤ 0. */
  badge?: number
  onClick?: () => void
}

/**
 * Bouton d'action de la toolbar : icône au-dessus, label en dessous.
 * Le label se replie automatiquement sur les écrans étroits.
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
}: ToolbarButtonProps) {
  const showBadge = !loading && typeof badge === 'number' && badge > 0
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      title={title ?? label}
      className="group relative flex min-w-[40px] shrink-0 flex-col items-center justify-center gap-0.5 rounded px-2 py-1 transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
    >
      <span className="relative flex h-4 w-4 items-center justify-center">
        {loading ? <Spinner className="h-4 w-4 text-muted-foreground" /> : icon}
        {showBadge && (
          <span
            data-testid="toolbar-button-badge"
            className="absolute -right-2 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold leading-none text-primary-foreground"
          >
            {badge > 99 ? '99+' : badge}
          </span>
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
}
