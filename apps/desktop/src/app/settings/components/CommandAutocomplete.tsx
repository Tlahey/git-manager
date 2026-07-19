import { useEffect, useRef, useState } from 'react'
import { Input, cn } from '@git-manager/ui'
import { Play } from 'lucide-react'

/** A selectable command suggestion — structurally compatible with `ProjectCommand`. */
export interface CommandSuggestion {
  name: string
  command: string
  detail?: string
}

interface CommandAutocompleteProps {
  value: string
  onChange: (value: string) => void
  /** Fired on Enter while the suggestion list is closed (e.g. to commit the row). */
  onEnter?: () => void
  suggestions: CommandSuggestion[]
  placeholder?: string
  autoFocus?: boolean
  className?: string
  testId?: string
}

/**
 * A free-text command input with a suggestion dropdown: type any command, or pick one of the
 * project's declared scripts. Presentational — the caller provides `suggestions` (no IPC/store).
 * Filters suggestions by the typed text against their name/command; selecting one replaces the value.
 */
export function CommandAutocomplete({
  value,
  onChange,
  onEnter,
  suggestions,
  placeholder,
  autoFocus,
  className,
  testId,
}: CommandAutocompleteProps) {
  const [open, setOpen] = useState(false)
  const blurTimeout = useRef<ReturnType<typeof setTimeout>>()

  // Clear any pending blur-close timer on unmount so it can't call setOpen after teardown.
  useEffect(() => () => clearTimeout(blurTimeout.current), [])

  const query = value.trim().toLowerCase()
  const filtered = suggestions.filter(
    (s) =>
      !query ||
      s.name.toLowerCase().includes(query) ||
      s.command.toLowerCase().includes(query)
  )
  const showList = open && filtered.length > 0

  return (
    <div className="relative flex-1">
      <Input
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        // Delay so a suggestion's mousedown lands before the blur closes the list.
        onBlur={() => {
          clearTimeout(blurTimeout.current)
          blurTimeout.current = setTimeout(() => setOpen(false), 120)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false)
          else if (e.key === 'Enter' && !showList) onEnter?.()
        }}
        placeholder={placeholder}
        className={cn('w-full', className)}
        data-testid={testId}
      />
      {showList && (
        <ul
          className="absolute left-0 right-0 z-50 mt-1 max-h-48 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-md"
          data-testid={testId ? `${testId}-list` : 'command-autocomplete-list'}
        >
          {filtered.map((s) => (
            <li key={s.name}>
              <button
                type="button"
                // mousedown (not click) so it fires before the input's blur.
                onMouseDown={(e) => {
                  e.preventDefault()
                  onChange(s.command)
                  setOpen(false)
                }}
                className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs transition-colors hover:bg-accent"
                data-testid={testId ? `${testId}-option-${s.name}` : undefined}
              >
                <Play className="h-3 w-3 shrink-0 text-orange-400/70" />
                <span className="shrink-0 font-mono text-foreground">{s.command}</span>
                {s.detail && (
                  <span className="ml-auto truncate font-mono text-[10px] text-muted-foreground">
                    {s.detail}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
