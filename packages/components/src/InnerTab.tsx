import React from 'react'
import { Skeleton } from '@git-manager/ui'

export interface InnerTabProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'onClick'
> {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  count?: number
  loading?: boolean
}

export function InnerTab({
  active,
  onClick,
  children,
  count,
  loading,
  className,
  ...props
}: InnerTabProps) {
  return (
    <button
      onClick={onClick}
      className={`relative flex cursor-pointer items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
        active
          ? 'border-primary text-foreground'
          : 'text-muted-foreground hover:border-border hover:text-foreground border-transparent'
      } ${className ?? ''}`}
      {...props}
    >
      {children}
      {count !== undefined &&
        (loading ? (
          <Skeleton className="bg-muted/65 inline-block h-3.5 w-5 rounded-full" />
        ) : (
          <span
            className={`rounded-full px-1.5 py-px text-[9px] leading-none font-semibold ${
              active ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
            }`}
          >
            {count}
          </span>
        ))}
    </button>
  )
}
