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
    <div className="group/header flex items-center">
      <button
        data-testid={testId}
        onClick={onToggle}
        className="flex flex-1 items-center gap-1.5 px-2 py-1.5 text-left transition-colors hover:bg-accent/40"
      >
        <span className="shrink-0 text-muted-foreground/60">
          {isOpen ? (
            <ChevronDown className="h-3 w-3 transition-transform" />
          ) : (
            <ChevronRight className="h-3 w-3 transition-transform" />
          )}
        </span>
        <span className="shrink-0 text-muted-foreground/70">{icon}</span>
        <span className="flex-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          {title}
        </span>
        {count !== undefined && (
          <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground/40">
            {count}
          </span>
        )}
      </button>
      {action && (
        <div className="shrink-0 opacity-0 transition-opacity group-hover/header:opacity-100">
          {action}
        </div>
      )}
    </div>
  )
}
