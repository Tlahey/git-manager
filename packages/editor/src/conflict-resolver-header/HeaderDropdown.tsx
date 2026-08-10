import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

interface HeaderDropdownProps<T extends string> {
  /** Ordered option values; the selected one shows its label on the trigger button. */
  options: readonly T[]
  value: T
  onChange: (value: T) => void
  /** Human label per option value, shown on the trigger and in the menu. */
  labels: Record<T, string>
  /** Tailwind width class for the popup menu (whitespace/highlight menus differ in width). */
  menuWidthClass: string
  /** `data-testid` for the trigger button — the menu items reuse the option label text. */
  testId: string
}

/** The whitespace and highlight-mode selectors in the merge header are the same widget: a
 * bordered trigger showing the current option, a click-outside-dismissed popup listing every
 * option, current one accented. Extracted so the two (previously copy-pasted) blocks share one
 * implementation. */
export function HeaderDropdown<T extends string>({
  options,
  value,
  onChange,
  labels,
  menuWidthClass,
  testId,
}: HeaderDropdownProps<T>) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex h-6 items-center justify-between gap-1 rounded border border-border bg-secondary px-2.5 text-[11px] text-secondary-foreground transition-colors hover:bg-accent hover:text-accent-foreground active:bg-accent/70"
        data-testid={testId}
      >
        <span>{labels[value]}</span>
        <ChevronDown className="h-3 w-3 text-muted-foreground/60" />
      </button>
      {open && (
        <div
          className={`absolute right-0 mt-1 ${menuWidthClass} animate-fadeIn z-50 rounded-md border border-border bg-popover py-1 text-[11px] text-popover-foreground shadow-lg`}
        >
          {options.map((option) => (
            <button
              key={option}
              onClick={() => {
                onChange(option)
                setOpen(false)
              }}
              className={`w-full px-3 py-1.5 text-left transition-colors hover:bg-accent hover:text-accent-foreground ${
                value === option ? 'font-semibold text-primary' : 'text-popover-foreground/80'
              }`}
            >
              {labels[option]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
