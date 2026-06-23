import { Spinner } from '@git-manager/ui'

export interface ToolbarButtonProps {
  icon: React.ReactNode
  label: string
  loading?: boolean
  disabled?: boolean
  title?: string
  /** Masque le label sous le seuil `lg` pour gagner de la place. */
  hideLabelOnNarrow?: boolean
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
  onClick,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      title={title ?? label}
      className="group flex min-w-[40px] shrink-0 flex-col items-center justify-center gap-0.5 rounded px-2 py-1 transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
    >
      <span className="flex h-4 w-4 items-center justify-center">
        {loading ? <Spinner className="h-4 w-4 text-muted-foreground" /> : icon}
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
