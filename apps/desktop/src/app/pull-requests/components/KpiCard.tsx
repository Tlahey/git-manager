import React from 'react'
import { Skeleton } from '@git-manager/ui'

interface KpiCardProps {
  icon: React.ReactNode
  label: string
  value: string | number
  sub?: string
  accent?: string
  loading?: boolean
}

export function KpiCard({ icon, label, value, sub, accent, loading }: KpiCardProps) {
  return (
    <div
      className={`flex min-w-0 flex-1 flex-col gap-1.5 rounded-xl border border-border bg-card/60 px-4 py-3 shadow-sm backdrop-blur-sm transition-all hover:border-border/80 hover:shadow-md ${
        accent ?? ''
      }`}
    >
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-[10px] font-medium uppercase tracking-wider">{label}</span>
      </div>
      {loading ? (
        <Skeleton className="my-1 h-6 w-12 rounded bg-muted/60" />
      ) : (
        <span className="text-2xl font-bold leading-none text-foreground">{value}</span>
      )}
      {sub && <span className="text-[10px] text-muted-foreground">{sub}</span>}
    </div>
  )
}
