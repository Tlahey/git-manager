import React from 'react'

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
      className={`flex flex-col gap-1.5 rounded-xl border border-border bg-card/60 px-4 py-3 backdrop-blur-sm shadow-sm flex-1 min-w-0 transition-all hover:border-border/80 hover:shadow-md ${
        accent ?? ''
      }`}
    >
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-[10px] font-medium uppercase tracking-wider">{label}</span>
      </div>
      {loading ? (
        <div className="h-6 w-12 bg-muted/60 animate-pulse rounded my-1" />
      ) : (
        <span className="text-2xl font-bold text-foreground leading-none">{value}</span>
      )}
      {sub && <span className="text-[10px] text-muted-foreground">{sub}</span>}
    </div>
  )
}
