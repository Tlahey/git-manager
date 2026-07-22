import { Eye, EyeOff } from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'

interface SoloToggleProps {
  /** Whether this branch is currently soloed (visible in the graph). */
  isSoloed: boolean
  /** Toggle the branch's solo status. */
  onToggle: () => void
}

/**
 * Left-edge eye / eye-off toggle shown on branch rows while solo mode is active. Eye (primary) =
 * soloed/visible, EyeOff (muted) = hidden. Follows the stash-visibility toggle pattern in
 * `SidebarRowView.tsx`: an absolutely-positioned control that stops propagation so it never
 * triggers the row's own select/checkout.
 */
export function SoloToggle({ isSoloed, onToggle }: SoloToggleProps) {
  const { t } = useTranslation('git')
  const label = isSoloed ? t('sidebar.solo.hide') : t('sidebar.solo.show')
  return (
    <button
      type="button"
      data-toggle="solo"
      data-testid="branch-solo-toggle"
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
        onToggle()
      }}
      onMouseDown={(e) => {
        e.stopPropagation()
        e.preventDefault()
      }}
      className="absolute left-1 z-content flex h-4 w-4 shrink-0 items-center justify-center rounded p-0.5 transition-colors hover:bg-sidebar-accent/80"
      title={label}
      aria-label={label}
      aria-pressed={isSoloed}
    >
      {isSoloed ? (
        <Eye className="h-3.5 w-3.5 text-primary" />
      ) : (
        <EyeOff className="h-3.5 w-3.5 text-sidebar-muted-foreground/60" />
      )}
    </button>
  )
}
