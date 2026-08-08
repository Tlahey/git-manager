interface WaterlineProps {
  label: string
}

/**
 * Full-width time separator ("2 hours ago"…). Rendered as an OVERLAY on the boundary between
 * two commits: it takes up no height in the flow, so the graph stays continuous behind it.
 */
export function Waterline({ label }: WaterlineProps) {
  return (
    <div className="pointer-events-none flex h-full select-none items-center gap-2 px-3">
      <div className="h-px flex-1 bg-border/50" />
      <span className="shrink-0 rounded bg-muted px-1.5 py-0 text-[9px] font-medium uppercase tracking-wide text-muted-foreground shadow-xs">
        {label}
      </span>
    </div>
  )
}
