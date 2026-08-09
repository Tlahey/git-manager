import { ChevronDown, ChevronRight, Filter } from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'

interface SectionHeaderProps {
  title: string
  icon: React.ReactNode
  count?: number
  isOpen: boolean
  onToggle: () => void
  action?: React.ReactNode
  testId?: string
  /** When true, `count` reflects a search filter rather than the section's full contents — shown
   * with a small funnel icon so the (often smaller) number isn't mistaken for the total. */
  isFiltered?: boolean
}

export function SectionHeader({
  title,
  icon,
  count,
  isOpen,
  onToggle,
  action,
  testId,
  isFiltered = false,
}: SectionHeaderProps) {
  const { t } = useTranslation('git')
  return (
    <div className="group/header relative flex items-center">
      <button
        data-testid={testId}
        onClick={onToggle}
        className="flex flex-1 cursor-pointer items-center gap-1.5 px-2 py-1.5 text-left transition-colors hover:bg-sidebar-accent/40"
      >
        <span className="shrink-0 text-sidebar-muted-foreground/60">
          {isOpen ? (
            <ChevronDown className="h-3 w-3 transition-transform" />
          ) : (
            <ChevronRight className="h-3 w-3 transition-transform" />
          )}
        </span>
        <span className="shrink-0 text-sidebar-muted-foreground/70">{icon}</span>
        <span className="flex-1 text-[10px] font-bold tracking-widest text-sidebar-muted-foreground uppercase">
          {title}
        </span>
        {count !== undefined && (
          <span
            className={`flex shrink-0 items-center gap-1 text-[10px] text-sidebar-muted-foreground tabular-nums transition-opacity ${
              action ? 'group-hover/header:opacity-0' : ''
            }`}
          >
            {isFiltered && (
              <Filter
                className="h-2.5 w-2.5 text-primary"
                aria-label={t('sidebar.filteredResults')}
              />
            )}
            {count}
          </span>
        )}
      </button>
      {/* The action overlays the count's right-most slot: the count stays flush right, and on hover
          it fades out while the action fades in over the same spot. */}
      {action && (
        <div className="absolute top-1/2 right-1 flex shrink-0 -translate-y-1/2 items-center opacity-0 transition-opacity group-hover/header:opacity-100">
          {action}
        </div>
      )}
    </div>
  )
}
