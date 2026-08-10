export function PRRowSkeleton() {
  return (
    <div className="flex animate-pulse items-center gap-3 border-b border-border/30 px-4 py-2.5 last:border-0">
      <div className="h-3 w-3 shrink-0 rounded-full bg-muted/60" />
      <div className="h-2.5 w-[52px] shrink-0 rounded bg-muted/40" />
      <div className="flex w-[70px] shrink-0 justify-center">
        <div className="h-4 w-14 rounded bg-muted/60" />
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-3 w-2/3 rounded bg-muted/80" />
        <div className="flex gap-2">
          <div className="h-2 w-16 rounded bg-muted/40" />
          <div className="h-2.5 w-12 rounded bg-muted/40" />
        </div>
      </div>
      <div className="flex w-[90px] shrink-0 items-center gap-1.5">
        <div className="h-[18px] w-[18px] rounded-full bg-muted/60" />
        <div className="h-2 w-12 rounded bg-muted/40" />
      </div>
      <div className="flex w-[60px] shrink-0 justify-center">
        <div className="h-[18px] w-[18px] rounded-full bg-muted/40" />
      </div>
      <div className="w-[130px] shrink-0">
        <div className="h-2 w-16 rounded bg-muted/40" />
      </div>
      <div className="h-6 w-6 shrink-0 rounded bg-muted/30" />
    </div>
  )
}

export function IssueRowSkeleton() {
  return (
    <div className="flex animate-pulse items-center gap-3 border-b border-border/30 px-4 py-2.5 last:border-0">
      <div className="h-4 w-4 shrink-0 rounded bg-muted/60" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-3 w-1/2 rounded bg-muted/80" />
        <div className="flex gap-2">
          <div className="h-2.5 w-12 rounded bg-muted/40" />
          <div className="h-2 w-6 rounded bg-muted/40" />
        </div>
      </div>
      <div className="h-2.5 w-[52px] shrink-0 rounded bg-muted/40" />
      <div className="flex w-[70px] shrink-0 justify-center">
        <div className="h-4 w-12 rounded bg-muted/60" />
      </div>
      <div className="flex w-[90px] shrink-0 items-center gap-1.5">
        <div className="h-[18px] w-[18px] rounded-full bg-muted/60" />
        <div className="h-2 w-12 rounded bg-muted/40" />
      </div>
      <div className="flex w-[60px] shrink-0 justify-center">
        <div className="h-[18px] w-[18px] rounded-full bg-muted/40" />
      </div>
      <div className="w-[110px] shrink-0">
        <div className="h-2 w-16 rounded bg-muted/40" />
      </div>
      <div className="h-6 w-6 shrink-0 rounded bg-muted/30" />
    </div>
  )
}
