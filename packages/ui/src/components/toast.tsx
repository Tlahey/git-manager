import * as React from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from 'lucide-react'
import { cn } from '../lib/utils'

export type ToastVariant = 'success' | 'error' | 'info' | 'warning'

export interface ToastOptions {
  description?: string
  /** Auto-dismiss delay in ms. Pass 0 to keep the toast until manually dismissed. Default 4000. */
  duration?: number
}

interface ToastItem extends ToastOptions {
  id: string
  variant: ToastVariant
  message: string
  leaving?: boolean
}

// ── Store ────────────────────────────────────────────────────────────────────
// Minimal framework-free pub/sub (no state library dependency in packages/ui),
// subscribed to via useSyncExternalStore. Toasts stack — pushing one never
// replaces another, unlike the ad-hoc single-slot toasts it replaces.

let toasts: ToastItem[] = []
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot() {
  return toasts
}

const EXIT_DURATION = 200

function dismiss(id: string) {
  const item = toasts.find((t) => t.id === id)
  if (!item || item.leaving) return
  toasts = toasts.map((t) => (t.id === id ? { ...t, leaving: true } : t))
  emit()
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id)
    emit()
  }, EXIT_DURATION)
}

function push(variant: ToastVariant, message: string, options?: ToastOptions) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const duration = options?.duration ?? 4000
  toasts = [...toasts, { id, variant, message, description: options?.description, duration }]
  emit()
  if (duration > 0) setTimeout(() => dismiss(id), duration)
  return id
}

export const toast = Object.assign(
  (message: string, options?: ToastOptions) => push('info', message, options),
  {
    success: (message: string, options?: ToastOptions) => push('success', message, options),
    error: (message: string, options?: ToastOptions) => push('error', message, options),
    info: (message: string, options?: ToastOptions) => push('info', message, options),
    warning: (message: string, options?: ToastOptions) => push('warning', message, options),
    dismiss,
  }
)

// ── UI ───────────────────────────────────────────────────────────────────────

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
      className={cn(
        'border-border bg-popover/95 pointer-events-auto flex w-80 max-w-[calc(100vw-2rem)] items-start gap-2.5 rounded-lg border border-l-4 p-3 shadow-xl backdrop-blur-md transition-all duration-200 ease-out',
        border,
        shown ? 'translate-x-0 opacity-100' : 'translate-x-3 opacity-0'
      )}
    >
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', icon_)} />
      <div className="min-w-0 flex-1">
        <p className="text-popover-foreground text-xs font-medium leading-snug">{item.message}</p>
        {item.description && (
          <p className="text-muted-foreground mt-0.5 text-[11px] leading-snug">
            {item.description}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => dismiss(item.id)}
        className="text-muted-foreground/70 hover:bg-accent hover:text-foreground shrink-0 rounded p-0.5 transition-colors"
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
