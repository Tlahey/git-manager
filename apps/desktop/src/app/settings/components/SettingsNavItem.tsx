import type { ComponentType, ReactNode } from 'react'

interface SettingsNavItemProps {
  testId: string
  icon?: ComponentType<{ className?: string }>
  label: ReactNode
  active: boolean
  onClick: () => void
  iconClassName?: string
}

/**
 * One side-panel nav entry (icon + label), shared by the Global, Repository, and pinned Support
 * groups so they stay visually identical — three groups each drawing their own entry is exactly how
 * they would drift apart.
 */
export function SettingsNavItem({
  testId,
  icon: Icon,
  label,
  active,
  onClick,
  iconClassName,
}: SettingsNavItemProps) {
  return (
    <button
      data-testid={testId}
      onClick={onClick}
      className={`flex w-full cursor-pointer items-center gap-2 rounded py-2 pr-3 pl-5 text-left text-xs transition-colors ${
        active
          ? 'bg-accent font-medium text-foreground'
          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
      }`}
    >
      {Icon && <Icon className={`h-3.5 w-3.5 shrink-0 ${iconClassName ?? ''}`} />}
      {label}
    </button>
  )
}
