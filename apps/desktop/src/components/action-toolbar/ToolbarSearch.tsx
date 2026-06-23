import { Search, X } from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'

interface ToolbarSearchProps {
  value: string
  onChange: (value: string) => void
}

/** Barre de recherche globale (commits, messages, auteurs, fichiers). */
export function ToolbarSearch({ value, onChange }: ToolbarSearchProps) {
  const { t } = useTranslation('git')

  return (
    <div className="flex h-8 min-w-0 items-center gap-1.5 rounded border border-border bg-background px-2 transition-colors focus-within:ring-1 focus-within:ring-ring">
      <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('toolbar.search')}
        className="w-40 min-w-0 bg-transparent text-xs outline-none placeholder:text-muted-foreground xl:w-64"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label={t('toolbar.cancel')}
          className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}
