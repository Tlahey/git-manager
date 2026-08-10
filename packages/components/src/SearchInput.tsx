import { Search, X } from 'lucide-react'
import { Input } from '@git-manager/ui'

export interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder: string
  /**
   * Accessible name for the ✕ that empties the field. Required rather than optional because the
   * button is an icon with no text: every hand-rolled copy this replaced shipped it unlabelled,
   * which is a button a screen reader announces as nothing at all.
   */
  clearLabel: string
  /** Wrapper classes — in practice the width the surrounding toolbar wants (`max-w-xs`, `max-w-sm`). */
  className?: string
  'data-testid'?: string
}

/**
 * A search field with a leading magnifier and a ✕ that appears once something is typed.
 *
 * The ✕ is the reason this is a component rather than an `<Input>` with a class: it has to be
 * absolutely placed over the field, shown conditionally, and labelled — three chances to get it
 * subtly different, taken three times over in the Launchpad alone.
 *
 * The field's own size is fixed here (`h-7`, `text-xs`): a toolbar filter is one control at one
 * size, and the callers that wanted a different one wanted a different width, which `className`
 * gives them.
 */
export function SearchInput({
  value,
  onChange,
  placeholder,
  clearLabel,
  className = '',
  'data-testid': testId,
}: SearchInputProps) {
  return (
    <div className={`relative ${className}`}>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-7 w-full border-border bg-card pr-6 pl-7 text-xs shadow-none focus:ring-1 focus:ring-primary/40"
        data-testid={testId}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          title={clearLabel}
          aria-label={clearLabel}
          className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}
