import * as React from 'react'
import { useState } from 'react'
import { ClipboardCopy, ClipboardCheck } from 'lucide-react'
import { Tag, cn } from '@git-manager/ui'

export interface CopyToClipboardProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  textToCopy: string
  copiedLabel?: string
  durationMs?: number
  onCopy?: () => void
}

export const CopyToClipboard = React.forwardRef<HTMLButtonElement, CopyToClipboardProps>(
  (
    { textToCopy, copiedLabel, durationMs = 2000, onCopy, className, children, onClick, ...props },
    ref
  ) => {
    const [copied, setCopied] = useState(false)

    const handleCopy = async (e: React.MouseEvent<HTMLButtonElement>) => {
      onClick?.(e)
      if (!textToCopy) return
      try {
        await navigator.clipboard.writeText(textToCopy)
        setCopied(true)
        onCopy?.()
        setTimeout(() => setCopied(false), durationMs)
      } catch (err) {
        console.error('Failed to copy to clipboard:', err)
      }
    }

    return (
      <button
        ref={ref}
        onClick={handleCopy}
        className={cn(
          'group flex shrink-0 cursor-pointer items-center gap-1.5 transition-colors hover:text-primary',
          className
        )}
        {...props}
      >
        {children}
        {copied ? (
          <Tag tone="success" className="animate-fade-in shrink-0 font-sans font-normal">
            <ClipboardCheck className="h-2.5 w-2.5" />
            {copiedLabel}
          </Tag>
        ) : (
          <ClipboardCopy className="h-2.5 w-2.5 shrink-0 text-muted-foreground/60 opacity-0 transition-opacity group-hover:opacity-100" />
        )}
      </button>
    )
  }
)
CopyToClipboard.displayName = 'CopyToClipboard'
