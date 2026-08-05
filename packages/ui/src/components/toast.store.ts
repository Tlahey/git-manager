export type ToastVariant = 'success' | 'error' | 'info' | 'warning'

export interface ToastOptions {
  description?: string
  /** Auto-dismiss delay in ms. Pass 0 to keep the toast until manually dismissed. Default 4000. */
  duration?: number
}

export interface ToastItem extends ToastOptions {
  id: string
  variant: ToastVariant
  message: string
  leaving?: boolean
}

// Minimal framework-free pub/sub (no state library dependency in packages/ui),
// subscribed to via useSyncExternalStore. Toasts stack — pushing one never
// replaces another, unlike the ad-hoc single-slot toasts it replaces.
//
// Lives beside `toast.tsx` rather than inside it because a module that exports both a
// component and a non-component loses Vite's Fast Refresh (`react/only-export-components`),
// and the queue is exactly the state that must survive a hot reload of the view.

let toasts: ToastItem[] = []
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

export function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getSnapshot() {
  return toasts
}

const EXIT_DURATION = 200

export function dismiss(id: string) {
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
