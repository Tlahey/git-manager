import * as React from 'react'
import { cn } from '../lib/utils'
import { Tooltip } from './tooltip'

let toggleGroupCount = 0

export interface ToggleGroupOption<T extends string = string> {
  value: T
  /** Icon-only segment. Omit it and `label` is rendered as visible text instead — that is the
   * only switch between the two shapes, so a group never mixes silent and labelled segments
   * by accident. */
  icon?: React.ReactNode
  /** Visible text of a labelled segment. For an icon-only one it is the accessible name
   * instead — shown as a Tooltip (pointer) and read by assistive tech (sr-only label text);
   * never a raw `title=` attribute. */
  label: string
  /** `data-testid` for this segment's `<label>`; the native radio stays inside it. */
  testId?: string
}

export interface ToggleGroupProps<T extends string = string> {
  value: T
  onValueChange: (value: T) => void
  options: ToggleGroupOption<T>[]
  /** Native radio `name` shared by every option; auto-generated when omitted. */
  name?: string
  /** Disables every segment — the group still shows which one is selected, it just can't be
   * changed (e.g. a per-repo setting that currently inherits the global one). */
  disabled?: boolean
  className?: string
}

/**
 * Segmented control — a group of joined buttons, exactly one of them selected.
 *
 * Built on sr-only native radios rather than buttons: the shared `name` is what gives free
 * keyboard roving focus and form semantics, which a row of `<button>`s (shadcn's own
 * `ButtonGroup` is a pure layout container) would have to re-implement by hand and usually
 * doesn't.
 *
 * An option's `icon` decides what a segment *renders*, never how it looks selected:
 * - **icon** (e.g. the file-list tree/list toggle): rendered alone, its `label` becoming a
 *   Tooltip for pointer users and an sr-only accessible name.
 * - **no icon** (e.g. the Settings row-height picker): `label` is rendered as visible text.
 *
 * Both wear the one selected treatment defined below, so the control reads the same in the
 * sidebar and in Settings. That is the whole point of it living here: a caller that wants a
 * different look should get a `variant` prop added to this file, not restyle a group locally.
 */
export function ToggleGroup<T extends string = string>({
  value,
  onValueChange,
  options,
  name,
  disabled,
  className,
}: ToggleGroupProps<T>) {
  const generatedName = React.useMemo(() => `toggle-group-${++toggleGroupCount}`, [])
  const groupName = name ?? generatedName

  return (
    <div
      className={cn(
        // A recessed track (`muted`) holding raised segments, so the selected one reads as a
        // filled button rather than a marked-up label. The inner padding is what leaves its
        // fill room to sit inside the group instead of butting against the border.
        'inline-flex items-center gap-0.5 rounded-md border border-border/55 bg-muted p-0.5',
        disabled && 'opacity-60',
        className
      )}
    >
      {options.map((option) => {
        const checked = option.value === value
        const segment = (
          <label
            data-testid={option.testId}
            className={cn(
              'flex items-center justify-center rounded-[5px] transition-colors',
              disabled ? 'cursor-not-allowed' : 'cursor-pointer',
              // The only thing an `icon` changes: how much room the segment needs.
              option.icon ? 'p-1.5' : 'px-3 py-1.5 text-xs',
              // One selected treatment for both shapes: the whole segment takes the accent fill,
              // lifting off the track.
              //
              // The fill rides the Tier-3 `--button-*` tokens, NOT `bg-primary` /
              // `text-primary-foreground` — and that is load-bearing, not a stylistic detail.
              // The raw semantic pair measures ~37Lc under 12px text against an APCA bronze bar
              // of 75 (shadcn's `accent` fill scores 46.9Lc, a 15% `primary` tint misses it on
              // two themes), because `--primary-foreground` is graded for larger text. The
              // button tokens default to that same pair but 13 of the 15 shipped themes
              // re-point them precisely to fix filled-control contrast, so consuming them makes
              // this control inherit every correction Button already earned — and any future
              // one. Swapping in a raw colour re-breaks it; re-check with
              // `pnpm --filter @git-manager/ui test:apca`.
              checked
                ? 'bg-button font-medium text-button-foreground shadow-xs'
                : cn(
                    'text-muted-foreground',
                    // No hover affordance on a group that cannot be changed.
                    !disabled && 'hover:text-foreground'
                  )
            )}
          >
            <input
              type="radio"
              name={groupName}
              value={option.value}
              checked={checked}
              disabled={disabled}
              onChange={() => onValueChange(option.value)}
              className="sr-only"
            />
            {option.icon ? (
              <>
                <span aria-hidden="true">{option.icon}</span>
                <span className="sr-only">{option.label}</span>
              </>
            ) : (
              option.label
            )}
          </label>
        )

        return option.icon ? (
          <Tooltip key={option.value} content={option.label}>
            {segment}
          </Tooltip>
        ) : (
          <React.Fragment key={option.value}>{segment}</React.Fragment>
        )
      })}
    </div>
  )
}
