import * as React from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from 'lucide-react'
import { cn } from '../lib/utils'
import { subscribe, getSnapshot, dismiss, type ToastItem, type ToastVariant } from './toast.store'

const VARIANT_STYLES: Record<
  ToastVariant,
  { icon: React.ElementType; border: string; icon_: string }
> = {
  success: { icon: CheckCircle2, border: 'border-l-success', icon_: 'text-success' },
  error: { icon: XCircle, border: 'border-l-destructive', icon_: 'text-destructive' },
  warning: { icon: AlertTriangle, border: 'border-l-amber-500', icon_: 'text-amber-500' },
  info: { icon: Info, border: 'border-l-primary', icon_: 'text-primary' },
}

function ToastCard({ item }: { item: ToastItem }) {
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  const shown = mounted && !item.leaving
  const { icon: Icon, border, icon_ } = VARIANT_STYLES[item.variant]

  return (
    <div
      role="status"
      data-testid="toast"
      data-variant={item.variant}
      className={cn(
        'pointer-events-auto flex w-80 max-w-[calc(100vw-2rem)] items-start gap-2.5 rounded-lg border border-l-4 border-border bg-popover/95 p-3 shadow-xl backdrop-blur-md transition-all duration-200 ease-out',
        border,
        shown ? 'translate-x-0 opacity-100' : 'translate-x-3 opacity-0'
      )}
    >
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', icon_)} />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium leading-snug text-popover-foreground">{item.message}</p>
        {item.description && (
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            {item.description}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => dismiss(item.id)}
        className="shrink-0 cursor-pointer rounded p-0.5 text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
      >
        <X className="h-3 w-3" />
        <span className="sr-only">Dismiss</span>
      </button>
    </div>
  )
}

/**
 * Renders the stacked toast queue. Mount once at the app root — every
 * `toast.success(...)` / `toast.error(...)` call anywhere in the app appears here.
 */
export function Toaster() {
  const items = React.useSyncExternalStore(subscribe, getSnapshot)

  if (items.length === 0) return null

  return createPortal(
    <div className="pointer-events-none fixed bottom-4 right-4 z-overlay flex flex-col gap-2">
      {items.map((item) => (
        <ToastCard key={item.id} item={item} />
      ))}
    </div>,
    document.body
  )
}
