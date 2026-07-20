import React from 'react'
import { Skeleton } from '@git-manager/ui'

interface InnerTabProps {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  count?: number
  loading?: boolean
}

export function InnerTab({ active, onClick, children, count, loading }: InnerTabProps) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
        active
          ? 'border-primary text-foreground'
          : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
      }`}
    >
      {children}
      {count !== undefined &&
        (loading ? (
          <Skeleton className="inline-block h-3.5 w-5 rounded-full bg-muted/65" />
        ) : (
          <span
            className={`rounded-full px-1.5 py-px text-[9px] font-semibold leading-none ${
              active ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
            }`}
          >
            {count}
          </span>
        ))}
    </button>
  )
}
