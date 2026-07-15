import { ChevronDown, ChevronRight } from 'lucide-react'

interface SectionHeaderProps {
  title: string
  icon: React.ReactNode
  count?: number
  isOpen: boolean
  onToggle: () => void
  action?: React.ReactNode
  testId?: string
}

export function SectionHeader({
  title,
  icon,
  count,
  isOpen,
  onToggle,
  action,
  testId,
}: SectionHeaderProps) {
  return (
    <div className="group/header relative flex items-center">
      <button
        data-testid={testId}
        onClick={onToggle}
        className="flex flex-1 items-center gap-1.5 px-2 py-1.5 text-left transition-colors hover:bg-sidebar-accent/40"
      >
        <span className="shrink-0 text-sidebar-muted-foreground/60">
          {isOpen ? (
            <ChevronDown className="h-3 w-3 transition-transform" />
          ) : (
            <ChevronRight className="h-3 w-3 transition-transform" />
          )}
        </span>
        <span className="shrink-0 text-sidebar-muted-foreground/70">{icon}</span>
        <span className="flex-1 text-[10px] font-bold uppercase tracking-widest text-sidebar-muted-foreground">
          {title}
        </span>
        {count !== undefined && (
          <span
            className={`shrink-0 text-[10px] tabular-nums text-sidebar-muted-foreground/40 transition-opacity ${
              action ? 'group-hover/header:opacity-0' : ''
            }`}
          >
            {count}
          </span>
        )}
      </button>
      {/* The action overlays the count's right-most slot: the count stays flush right, and on hover
          it fades out while the action fades in over the same spot. */}
      {action && (
        <div className="absolute right-1 top-1/2 flex shrink-0 -translate-y-1/2 items-center opacity-0 transition-opacity group-hover/header:opacity-100">
          {action}
        </div>
      )}
    </div>
  )
}
