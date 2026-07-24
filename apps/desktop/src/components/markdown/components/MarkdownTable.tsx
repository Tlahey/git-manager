import React from 'react'

export function MarkdownTable({ children }: { children?: React.ReactNode }) {
  return (
    <div
      className="my-4 max-w-full overflow-x-auto rounded-lg border border-border bg-card/50"
      data-testid="markdown-table-wrapper"
    >
      <table className="w-full border-collapse text-left text-xs" data-testid="markdown-table">
        {children}
      </table>
    </div>
  )
}

export function MarkdownTableHead({ children }: { children?: React.ReactNode }) {
  return (
    <thead className="border-b border-border bg-muted/40 font-semibold text-foreground">
      {children}
    </thead>
  )
}

export function MarkdownTableCell({
  isHeader,
  children,
  align,
  ...props
}: {
  isHeader?: boolean
  children?: React.ReactNode
  align?: 'left' | 'center' | 'right' | null
}) {
  const Component = isHeader ? 'th' : 'td'
  const alignClass = align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left'

  return (
    <Component
      className={`border-b border-border/50 px-3 py-2 text-xs leading-normal ${alignClass} ${
        isHeader ? 'font-semibold text-foreground' : 'text-muted-foreground'
      }`}
      {...props}
    >
      {children}
    </Component>
  )
}
