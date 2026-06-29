

export function PRRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border/30 last:border-0 animate-pulse">
      <div className="w-3 h-3 rounded-full bg-muted/60 shrink-0" />
      <div className="w-4 h-4 rounded bg-muted/60 shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="h-3 w-2/3 bg-muted/80 rounded" />
        <div className="flex gap-2">
          <div className="h-2 w-16 bg-muted/40 rounded" />
          <div className="h-2.5 w-12 bg-muted/40 rounded" />
        </div>
      </div>
      <div className="w-[52px] h-2.5 bg-muted/40 rounded shrink-0" />
      <div className="w-[80px] flex justify-center shrink-0">
        <div className="w-14 h-4 bg-muted/60 rounded" />
      </div>
      <div className="w-[90px] flex items-center gap-1.5 shrink-0">
        <div className="w-[18px] h-[18px] rounded-full bg-muted/60" />
        <div className="h-2 w-12 bg-muted/40 rounded" />
      </div>
      <div className="w-[60px] flex justify-center shrink-0">
        <div className="w-[18px] h-[18px] rounded-full bg-muted/40" />
      </div>
      <div className="w-[110px] shrink-0">
        <div className="h-2 w-16 bg-muted/40 rounded" />
      </div>
      <div className="w-[60px] flex justify-center shrink-0">
        <div className="w-8 h-2.5 bg-muted/40 rounded" />
      </div>
      <div className="w-6 h-6 rounded bg-muted/30 shrink-0" />
    </div>
  )
}

export function IssueRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border/30 last:border-0 animate-pulse">
      <div className="w-4 h-4 rounded bg-muted/60 shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="h-3 w-1/2 bg-muted/80 rounded" />
        <div className="flex gap-2">
          <div className="h-2.5 w-12 bg-muted/40 rounded" />
          <div className="h-2 w-6 bg-muted/40 rounded" />
        </div>
      </div>
      <div className="w-[52px] h-2.5 bg-muted/40 rounded shrink-0" />
      <div className="w-[70px] flex justify-center shrink-0">
        <div className="w-12 h-4 bg-muted/60 rounded" />
      </div>
      <div className="w-[90px] flex items-center gap-1.5 shrink-0">
        <div className="w-[18px] h-[18px] rounded-full bg-muted/60" />
        <div className="h-2 w-12 bg-muted/40 rounded" />
      </div>
      <div className="w-[60px] flex justify-center shrink-0">
        <div className="w-[18px] h-[18px] rounded-full bg-muted/40" />
      </div>
      <div className="w-[110px] shrink-0">
        <div className="h-2 w-16 bg-muted/40 rounded" />
      </div>
      <div className="w-6 h-6 rounded bg-muted/30 shrink-0" />
    </div>
  )
}
