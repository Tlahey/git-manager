import React from 'react'
import { Skeleton, Card } from '@git-manager/ui'

export interface KpiCardProps {
  icon: React.ReactNode
  label: string
  value: string | number
  sub?: string
  accent?: string
  loading?: boolean
}

export function KpiCard({ icon, label, value, sub, accent, loading }: KpiCardProps) {
  return (
    <Card
      className={`bg-card/60 hover:border-border/80 flex min-w-0 flex-1 flex-col gap-1.5 rounded-xl px-4 py-3 shadow-xs backdrop-blur-xs transition-all hover:shadow-md ${
        accent ?? ''
      }`}
    >
      <div className="text-muted-foreground flex items-center gap-2">
        {icon}
        <span className="text-[10px] font-medium tracking-wider uppercase">{label}</span>
      </div>
      {loading ? (
        <Skeleton className="bg-muted/60 my-1 h-6 w-12 rounded" />
      ) : (
        <span className="text-foreground text-2xl leading-none font-bold">{value}</span>
      )}
      {sub && <span className="text-muted-foreground text-[10px]">{sub}</span>}
    </Card>
  )
}
