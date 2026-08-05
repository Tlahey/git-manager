import { useCallback, useRef, useState, type ReactNode } from 'react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@git-manager/ui'

export interface ConfirmOptions {
  title: string
  /** Optional second line: what exactly happens, or what cannot be undone. */
  description?: string
  /** Label on the confirming button. */
  confirmLabel: string
  cancelLabel: string
  /** Paints the confirming button as destructive. Use for anything that loses work. */
  destructive?: boolean
  /** Attached to the dialog so a suite can address this specific confirmation. */
  testId?: string
}

/**
 * An awaitable confirmation dialog, shaped to replace `window.confirm` one call site at a time.
 *
 * `window.confirm` is not usable here for three reasons that all show up in this app: inside a Tauri
 * webview it blocks the whole window (including the render loop, so any spinner freezes mid-action),
 * it paints as a browser dialog rather than a macOS one, and its text can't be styled, so a
 * destructive action reads exactly like a benign one. This keeps the *shape* of the call it
 * replaces — `if (!(await confirm({…}))) return` — so the branching logic around it doesn't move.
 *
 * All copy arrives as props: this package is domain- and locale-agnostic (no `useTranslation`
 * here), so callers pass strings they've already resolved through `t()`.
 *
 * Dismissing the dialog — Escape, the overlay, the cancel button — resolves `false`, never leaves
 * the promise pending.
 */
export function useConfirm(): {
  confirm: (options: ConfirmOptions) => Promise<boolean>
  /** Render this once inside the component that owns the hook. */
  confirmDialog: ReactNode
} {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolveRef = useRef<((value: boolean) => void) | null>(null)

  const settle = useCallback((value: boolean) => {
    resolveRef.current?.(value)
    resolveRef.current = null
    setOptions(null)
  }, [])

  const confirm = useCallback((next: ConfirmOptions) => {
    // A second request while one is open would strand the first promise; answer it `false` — the
    // safe reading, since nothing was confirmed — before taking over the dialog.
    resolveRef.current?.(false)
    setOptions(next)
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve
    })
  }, [])

  const confirmDialog = options ? (
    <Dialog open onOpenChange={(open) => !open && settle(false)}>
      <DialogContent data-testid={options.testId ?? 'confirm-dialog'}>
        <DialogHeader>
          <DialogTitle>{options.title}</DialogTitle>
          {options.description && <DialogDescription>{options.description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => settle(false)}
            data-testid="confirm-dialog-cancel"
          >
            {options.cancelLabel}
          </Button>
          <Button
            variant={options.destructive ? 'destructive' : 'default'}
            size="sm"
            onClick={() => settle(true)}
            data-testid="confirm-dialog-confirm"
          >
            {options.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ) : null

  return { confirm, confirmDialog }
}
