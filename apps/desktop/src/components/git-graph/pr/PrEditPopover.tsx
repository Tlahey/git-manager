import { useMemo, useRef, useState, useEffect } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Input, Spinner } from '@git-manager/ui'
import { X, Check } from 'lucide-react'

/** A selectable entity in the popover — a user (avatarUrl) or a label (color). `key` is the value
 * sent to the API (a login, or a label name). */
export interface PrEditOption {
  key: string
  label: string
  avatarUrl?: string
  /** Label color, 6-hex without a leading '#'. */
  color?: string
}

interface PrEditPopoverProps {
  title: string
  options: PrEditOption[]
  selectedKeys: string[]
  loading?: boolean
  busy?: boolean
  onAdd: (key: string) => void
  onRemove: (key: string) => void
  onClose: () => void
}

function OptionGlyph({ option }: { option: PrEditOption }) {
  if (option.avatarUrl) {
    return <img src={option.avatarUrl} alt="" className="h-4 w-4 shrink-0 rounded-full" />
  }
  if (option.color) {
    return (
      <span
        className="h-3 w-3 shrink-0 rounded-full"
        style={{ backgroundColor: `#${option.color}` }}
      />
    )
  }
  return null
}

/**
 * Reusable search-and-select popover for a PR's reviewers / assignees / labels. Shows the current
 * selection as removable chips, a search field, and the matching candidates to add. Purely
 * presentational over the given `options` + handlers — the parent owns the data and the mutations.
 */
export function PrEditPopover({
  title,
  options,
  selectedKeys,
  loading,
  busy,
  onAdd,
  onRemove,
  onClose,
}: PrEditPopoverProps) {
  const { t } = useTranslation('git')
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const selectedSet = useMemo(() => new Set(selectedKeys), [selectedKeys])
  const selectedOptions = useMemo(
    () => selectedKeys.map((k) => options.find((o) => o.key === k) ?? { key: k, label: k }),
    [selectedKeys, options]
  )

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase()
    return options
      .filter((o) => !selectedSet.has(o.key))
      .filter((o) => !q || o.label.toLowerCase().includes(q) || o.key.toLowerCase().includes(q))
      .slice(0, 50)
  }, [options, selectedSet, query])

  return (
    <div
      data-testid="pr-edit-popover"
      className="mt-1.5 rounded-md border border-border bg-popover p-2 shadow-md"
    >
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[11px] font-medium text-foreground">{title}</span>
        <button
          onClick={onClose}
          data-testid="pr-edit-close"
          className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label={t('pr.edit.close')}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {selectedOptions.length > 0 && (
        <ul className="mb-1.5 flex flex-wrap gap-1">
          {selectedOptions.map((o) => (
            <li
              key={o.key}
              data-testid={`pr-edit-selected-${o.key}`}
              className="flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[11px] text-foreground"
            >
              <OptionGlyph option={o} />
              {o.label}
              <button
                onClick={() => onRemove(o.key)}
                disabled={busy}
                data-testid={`pr-edit-remove-${o.key}`}
                className="rounded-full hover:text-destructive disabled:opacity-50"
                aria-label={t('pr.edit.remove')}
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('pr.edit.searchPlaceholder')}
        className="h-8 text-xs"
        data-testid="pr-edit-search"
      />

      <div className="mt-1.5 max-h-44 overflow-y-auto">
        {loading ? (
          <div className="flex items-center gap-2 px-1 py-2 text-[11px] text-muted-foreground">
            <Spinner className="h-3 w-3" /> {t('pr.edit.loading')}
          </div>
        ) : candidates.length === 0 ? (
          <p className="px-1 py-2 text-[11px] italic text-muted-foreground">{t('pr.edit.noResults')}</p>
        ) : (
          <ul>
            {candidates.map((o) => (
              <li key={o.key}>
                <button
                  onClick={() => onAdd(o.key)}
                  disabled={busy}
                  data-testid={`pr-edit-add-${o.key}`}
                  className="flex w-full items-center gap-2 rounded px-1.5 py-1.5 text-left text-xs hover:bg-accent disabled:opacity-50"
                >
                  <OptionGlyph option={o} />
                  <span className="truncate text-foreground">{o.label}</span>
                  <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-transparent" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
