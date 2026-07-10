import { createPortal } from 'react-dom'
import { ArrowDownToLine, ChevronDown } from 'lucide-react'
import { Spinner } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import { useAnchoredMenu } from '@git-manager/components'

interface FetchButtonProps {
  loading?: boolean
  onFetch: () => void
  onFetchAll: () => void
  onFetchPrune: () => void
}

/** Bouton `Fetch` avec menu déroulant (Fetch all, Fetch & prune). */
export function FetchButton({ loading, onFetch, onFetchAll, onFetchPrune }: FetchButtonProps) {
  const { t } = useTranslation('git')
  const { open, setOpen, pos, containerRef, triggerRef, menuRef } = useAnchoredMenu()

  function run(action: () => void) {
    setOpen(false)
    action()
  }

  return (
    <div ref={containerRef} className="relative flex shrink-0 items-stretch">
      <button
        type="button"
        onClick={onFetch}
        disabled={loading}
        title={t('remote.fetch')}
        className="group flex min-w-[40px] flex-col items-center justify-center gap-0.5 rounded-l px-2 py-1 transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
      >
        <span className="flex h-4 w-4 items-center justify-center">
          {loading ? (
            <Spinner className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ArrowDownToLine className="h-4 w-4 text-cyan-400" />
          )}
        </span>
        <span className="hidden text-[10px] leading-none text-muted-foreground transition-colors group-hover:text-foreground lg:inline">
          {t('remote.fetch')}
        </span>
      </button>

      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={loading}
        aria-label={t('toolbar.fetchAll')}
        className="flex items-center rounded-r px-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: 'fixed', top: pos.top, bottom: pos.bottom, left: pos.left }}
            className="z-50 w-52 rounded-md border border-border bg-popover p-1 shadow-lg"
          >
            <button
              type="button"
              onClick={() => run(onFetchAll)}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent"
            >
              <ArrowDownToLine className="h-3.5 w-3.5 text-muted-foreground" />
              {t('toolbar.fetchAll')}
            </button>
            <button
              type="button"
              onClick={() => run(onFetchPrune)}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent"
            >
              <ArrowDownToLine className="h-3.5 w-3.5 text-muted-foreground" />
              {t('toolbar.fetchPrune')}
            </button>
          </div>,
          document.body,
        )}
    </div>
  )
}
