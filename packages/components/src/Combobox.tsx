import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn, Input, type InputSize } from '@git-manager/ui'

export interface ComboboxProps {
  /** The field's value. What is typed *is* the value — see the note on free text below. */
  value: string
  onChange: (value: string) => void
  /** What the field suggests when it is opened. Suggestions, not the permitted set. */
  options: string[]
  /**
   * Normalizes what was typed before it becomes the value — e.g. upper-casing an identifier prefix.
   * Applied per keystroke rather than on blur, so the field never shows something other than the
   * value it is about to report.
   */
  normalize?: (raw: string) => string
  /** Note shown under the list when the value matches no option, saying what accepting it means. */
  freeValueLabel?: (value: string) => string
  /** Shown in place of the list when there is nothing to suggest. */
  emptyLabel?: string
  placeholder?: string
  disabled?: boolean
  inputSize?: InputSize
  maxLength?: number
  id?: string
  'aria-label'?: string
  /** Applied to the positioning wrapper; the field itself takes `inputClassName`. */
  className?: string
  inputClassName?: string
  /** The wrapper gets it, the field `${testId}-input`, each row `${testId}-option-<value>`. */
  testId?: string
}

/**
 * A text field that suggests, rather than a select that also accepts text.
 *
 * **What is typed wins.** The value is the input's own text at every keystroke; the list below is a
 * set of suggestions and never a constraint. That is the whole reason this exists next to `Select`:
 * for a field whose known values are a convenience and whose new values are ordinary — an identifier
 * prefix, a label, an assignee on a repository with no user directory — a select forces "create"
 * into a second, separate gesture (the `+` button this replaced) for something that is not a
 * different act.
 *
 * **Opening shows everything; typing filters.** A click is a question about what exists, so it
 * answers with the whole list; filtering only starts once a character is typed. Re-focusing a filled
 * field therefore shows the other options rather than the one already chosen, which is what makes
 * the field re-choosable and not merely re-typeable.
 *
 * Keyboard: ↓/↑ move through the suggestions, Enter takes the highlighted one, Escape closes the
 * list and leaves the typed value alone — closing is not cancelling, because there is nothing to
 * cancel back to.
 */
export function Combobox({
  value,
  onChange,
  options,
  normalize,
  freeValueLabel,
  emptyLabel,
  placeholder,
  disabled,
  inputSize = 'sm',
  maxLength,
  id,
  'aria-label': ariaLabel,
  className,
  inputClassName,
  testId,
}: ComboboxProps) {
  const [open, setOpen] = useState(false)
  // Whether the list should narrow to the value. False until a key is pressed, so opening the field
  // offers every option even when one is already selected.
  const [filtering, setFiltering] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const generatedId = useId()
  const listId = `${id ?? generatedId}-list`

  const matches = useMemo(() => {
    const query = value.trim().toLowerCase()
    if (!filtering || !query) return options
    return options.filter((option) => option.toLowerCase().includes(query))
  }, [options, value, filtering])

  const exactMatch = matches.some((option) => option.toLowerCase() === value.trim().toLowerCase())
  const freeValueNote = value.trim() && !exactMatch ? freeValueLabel?.(value.trim()) : undefined

  useEffect(() => {
    if (!open) return
    function handlePointerDown(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [open])

  function show() {
    if (disabled) return
    setOpen(true)
    setFiltering(false)
    setActiveIndex(-1)
  }

  function pick(option: string) {
    onChange(option)
    setOpen(false)
    setFiltering(false)
    setActiveIndex(-1)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      if (open) {
        event.stopPropagation()
        setOpen(false)
      }
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) {
        show()
        return
      }
      if (matches.length === 0) return
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActiveIndex((current) => (current + step + matches.length) % matches.length)
      return
    }
    if (event.key === 'Enter' && open && activeIndex >= 0 && matches[activeIndex]) {
      // Only when a suggestion is highlighted: with none, Enter belongs to the form the field is in.
      event.preventDefault()
      pick(matches[activeIndex])
    }
  }

  return (
    <div ref={wrapperRef} className={cn('relative', className)} data-testid={testId}>
      <Input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        aria-label={ariaLabel}
        autoComplete="off"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        maxLength={maxLength}
        inputSize={inputSize}
        className={inputClassName}
        containerClassName="w-full"
        endIcon={<ChevronDown className="h-3.5 w-3.5" />}
        onChange={(e) => {
          setFiltering(true)
          setOpen(true)
          setActiveIndex(-1)
          onChange(normalize ? normalize(e.target.value) : e.target.value)
        }}
        onFocus={show}
        onClick={show}
        onKeyDown={handleKeyDown}
        data-testid={testId && `${testId}-input`}
      />

      {open && (matches.length > 0 || freeValueNote || emptyLabel) && (
        <div className="z-popover border-border bg-popover absolute top-full left-0 mt-1 w-full min-w-40 rounded-md border p-1 shadow-md">
          <ul
            id={listId}
            role="listbox"
            aria-label={ariaLabel}
            className="max-h-52 overflow-y-auto"
          >
            {matches.map((option, index) => (
              <li
                key={option}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={option === value}
                // Kept off the blur path: mousedown would take focus from the field before the click
                // lands, closing the list under the pointer.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(option)}
                onMouseEnter={() => setActiveIndex(index)}
                data-testid={testId && `${testId}-option-${option}`}
                className={cn(
                  'text-foreground cursor-pointer truncate rounded px-2 py-1.5 text-xs',
                  index === activeIndex && 'bg-accent'
                )}
              >
                {option}
              </li>
            ))}
          </ul>

          {matches.length === 0 && !freeValueNote && emptyLabel && (
            <p className="text-muted-foreground px-2 py-2 text-center text-[11px]">{emptyLabel}</p>
          )}

          {freeValueNote && (
            <p
              className={cn(
                'text-muted-foreground px-2 py-1.5 text-[11px]',
                matches.length > 0 && 'border-border mt-1 border-t pt-1.5'
              )}
              data-testid={testId && `${testId}-free-value`}
            >
              {freeValueNote}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
