import { ArrowDownToLine, ChevronDown } from 'lucide-react'
import {
  Spinner,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'

interface FetchButtonProps {
  loading?: boolean
  onFetch: () => void
  onFetchAll: () => void
  onFetchPrune: () => void
}

/** Bouton `Fetch` avec menu déroulant (Fetch all, Fetch & prune). */
export function FetchButton({ loading, onFetch, onFetchAll, onFetchPrune }: FetchButtonProps) {
  const { t } = useTranslation('git')

  return (
    <div className="flex shrink-0 items-stretch">
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

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={loading}
            aria-label={t('toolbar.fetchAll')}
            className="flex items-center rounded-r px-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          <DropdownMenuItem onSelect={onFetchAll} className="gap-2 text-xs">
            <ArrowDownToLine className="h-3.5 w-3.5 text-muted-foreground" />
            {t('toolbar.fetchAll')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onFetchPrune} className="gap-2 text-xs">
            <ArrowDownToLine className="h-3.5 w-3.5 text-muted-foreground" />
            {t('toolbar.fetchPrune')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
