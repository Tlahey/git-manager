import { useState } from 'react'
import { createPortal } from 'react-dom'
import { GitBranch } from 'lucide-react'
import { Spinner } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import { useAnchoredMenu } from '../../hooks/useAnchoredMenu'

interface BranchButtonProps {
  /** Référence de départ (branche courante ou HEAD si detached). */
  fromRef: string
  onCreate: (name: string) => Promise<void>
}

/** Bouton `Branch` : ouvre un popover pour créer une branche depuis HEAD. */
export function BranchButton({ fromRef, onCreate }: BranchButtonProps) {
  const { t } = useTranslation('git')
  const { open, setOpen, pos, containerRef, triggerRef, menuRef } = useAnchoredMenu()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || busy) return
    setBusy(true)
    try {
      await onCreate(trimmed)
      setName('')
      setOpen(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div ref={containerRef} className="relative flex shrink-0 items-stretch">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={t('toolbar.createBranch')}
        className="group flex min-w-[40px] flex-col items-center justify-center gap-0.5 rounded px-2 py-1 transition-colors hover:bg-accent"
      >
        <span className="flex h-4 w-4 items-center justify-center">
          <GitBranch className="h-4 w-4 text-amber-400" />
        </span>
        <span className="hidden text-[10px] leading-none text-muted-foreground transition-colors group-hover:text-foreground lg:inline">
          {t('toolbar.branch')}
        </span>
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: 'fixed', top: pos.top, left: pos.left }}
            className="z-50 w-64 rounded-md border border-border bg-popover p-2.5 shadow-lg"
          >
            <form onSubmit={handleSubmit}>
              <label className="mb-1 block text-[11px] font-semibold text-foreground">
                {t('toolbar.createBranch')}
              </label>
              <p className="mb-2 truncate text-[10px] text-muted-foreground">
                {t('toolbar.fromHead', { ref: fromRef })}
              </p>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('toolbar.branchNamePlaceholder')}
                className="mb-2 w-full rounded border border-input bg-background px-2 py-1 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <div className="flex justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {t('toolbar.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={!name.trim() || busy}
                  className="flex items-center gap-1.5 rounded bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busy && <Spinner className="h-3 w-3" />}
                  {t('toolbar.create')}
                </button>
              </div>
            </form>
          </div>,
          document.body,
        )}
    </div>
  )
}
