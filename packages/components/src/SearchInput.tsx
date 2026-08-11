import type { KeyboardEventHandler, Ref } from 'react'
import { Search, X } from 'lucide-react'
import { Input, type InputVariant } from '@git-manager/ui'

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
  /**
   * Which surface the field sits on. `chrome` — the default, and what every search in the app uses —
   * is the filled field graded against `sidebar-accent`; `default` is the transparent content-surface
   * field, for a search that lives inside a dialog or a form rather than in the app's chrome.
   */
  variant?: InputVariant
  /** Accessible name for the field itself. Defaults to the placeholder. */
  ariaLabel?: string
  /** Wrapper classes — in practice the width the surrounding toolbar wants (`max-w-xs`, `flex-1`). */
  className?: string
  /** Classes for the field itself — for state the caller signals on it, not for resizing it. */
  inputClassName?: string
  /** Forwarded to the field, so a keyboard shortcut can focus it. */
  inputRef?: Ref<HTMLInputElement>
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>
  'data-testid'?: string
}

/**
 * **The search field of the app.** A leading magnifier, and a ✕ that appears once something is typed.
 *
 * It exists because a search box is three things that go subtly wrong one at a time: the ✕ has to sit
 * over the field, appear conditionally, and be *labelled*. The app had six different answers to that
 * — three sidebars each re-deriving the same field from `<Input>`, three toolbars pairing an
 * `<Input>` with a magnifier of their own, and two raw `<input>`s that dropped the primitive's graded
 * colour pairs, its focus ring and its `autoCorrect`/`spellCheck` defaults entirely. Reach for this
 * before an `<Input>` with a magnifier next to it.
 *
 * Both icons go through `Input`'s own `startIcon`/`endIcon` slots rather than being positioned here,
 * so they inherit the field's graded colour pair (see `Input`'s `ICON_CLASSES`) instead of a hardcoded
 * `muted-foreground` that only happens to read on a content surface.
 *
 * The size is fixed (`inputSize="sm"`): a search box is one control at one size, and the callers that
 * wanted a different one wanted a different *width*, which `className` gives them.
 */
export function SearchInput({
  value,
  onChange,
  placeholder,
  clearLabel,
  variant = 'chrome',
  ariaLabel,
  className = '',
  inputClassName = '',
  inputRef,
  onKeyDown,
  'data-testid': testId,
}: SearchInputProps) {
  return (
    <Input
      ref={inputRef}
      type="text"
      variant={variant}
      inputSize="sm"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      aria-label={ariaLabel ?? placeholder}
      containerClassName={className}
      className={inputClassName}
      data-testid={testId}
      startIcon={<Search className="h-3.5 w-3.5" />}
      endIcon={
        value ? (
          <button
            type="button"
            onClick={() => onChange('')}
            title={clearLabel}
            aria-label={clearLabel}
            // No colour class: the button inherits the field's graded pair from the icon slot, and
            // signals hover with a tint behind it rather than with a colour that pair doesn't cover.
            className="flex h-4 w-4 cursor-pointer items-center justify-center rounded transition-colors hover:bg-foreground/10"
          >
            <X className="h-3 w-3" />
          </button>
        ) : undefined
      }
    />
  )
}
