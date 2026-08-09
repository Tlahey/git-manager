import * as React from 'react'
import { cn } from '../lib/utils'
import { Tooltip } from './tooltip'

let toggleGroupCount = 0

export interface ToggleGroupOption<T extends string = string> {
  /** Icon-only segment under the default variant, and the icon above the label under `stacked`.
   * Omit it (default variant only) and `label` is rendered as visible text instead. */
  icon?: React.ReactNode
  value: T
  /** Visible text of a labelled or stacked segment. For an icon-only one it is the accessible name
   * instead — shown as a Tooltip (pointer) and read by assistive tech (sr-only label text);
   * never a raw `title=` attribute. */
  label: string
  /** `data-testid` for this segment's `<label>`; the native radio stays inside it. */
  testId?: string
}

/**
 * Which shape the segments take.
 *
 * - `default` — decided per option by whether it carries an `icon`: icon-only (label becomes a
 *   tooltip and an sr-only name) or text-only. That is the only switch between those two, so a
 *   group never mixes silent and labelled segments by accident.
 * - `stacked` — icon above a visible label, matching the app toolbar's own buttons, for a group
 *   that sits among them and has to read as one of them. Needs an `icon` on every option.
 */
export type ToggleGroupVariant = 'default' | 'stacked'

export interface ToggleGroupProps<T extends string = string> {
  value: T
  onValueChange: (value: T) => void
  options: ToggleGroupOption<T>[]
  /** See {@link ToggleGroupVariant}. Defaults to `'default'`. */
  variant?: ToggleGroupVariant
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
 * What a segment *renders* is decided by `variant`, and by an option's `icon` within the default
 * one — never how it looks selected:
 * - **icon** (e.g. the file-list tree/list toggle): rendered alone, its `label` becoming a
 *   Tooltip for pointer users and an sr-only accessible name.
 * - **no icon** (e.g. the Settings row-height picker): `label` is rendered as visible text.
 * - **`variant="stacked"`** (the app toolbar's Graph/Files/Board switcher): icon above a visible
 *   label, so a group standing among `ToolbarButton`s reads as one of them rather than as a
 *   control borrowed from Settings. No Tooltip — the label is on screen, and a tooltip repeating
 *   visible text is noise.
 *
 * Selection is one filled segment, identical in every shape and on every surface — the toolbar's
 * switcher wears exactly what the Settings picker wears. It takes a fill *and* a matching
 * foreground, so a selected segment repaints its label and its icon rather than relying on a tint
 * behind them; the token that guarantees both, and why it isn't simply `--button-bg`, is recorded
 * beside the classes below. That is the whole point of this living here: a caller that wants a
 * different look gets a variant added to this file, not a group restyled locally.
 */
export function ToggleGroup<T extends string = string>({
  value,
  onValueChange,
  options,
  variant = 'default',
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
        'border-border/55 bg-muted inline-flex items-center gap-0.5 rounded-md border p-0.5',
        disabled && 'opacity-60',
        className
      )}
    >
      {options.map((option) => {
        const checked = option.value === value
        const stacked = variant === 'stacked'
        const segment = (
          <label
            data-testid={option.testId}
            className={cn(
              'flex items-center justify-center rounded-[5px] transition-colors',
              disabled ? 'cursor-not-allowed' : 'cursor-pointer',
              // The only thing a shape changes: how much room the segment needs. `stacked`
              // borrows `ToolbarButton`'s metrics — 16px icon over a 10px label — so a group of
              // them lines up with the plain buttons beside it instead of sitting a few pixels off.
              stacked
                ? 'min-w-[44px] flex-col gap-0.5 px-2 py-1'
                : option.icon
                  ? 'p-1.5'
                  : 'px-3 py-1.5 text-xs',
              // The selected segment takes a fill and lifts off the track. One fill for every
              // shape, on every surface — and the token it rides is load-bearing, not a
              // stylistic detail.
              //
              // NOT `bg-primary` / `text-primary-foreground`: the raw semantic pair measures
              // ~37Lc under 12px text against an APCA bronze bar of 75 (shadcn's `accent` fill
              // scores 46.9Lc, a 15% `primary` tint misses it on two themes), because
              // `--primary-foreground` is graded for larger text. `--control-active-*` aliases
              // the Tier-3 button pair, which 13 of the 15 shipped themes re-point precisely to
              // fix filled-control contrast — so this control inherits every correction Button
              // already earned, and any future one.
              //
              // NOT `bg-button` directly either, and that distinction is the whole reason the
              // alias exists: `.chrome-surface` re-points `--button-*` at `--sidebar-accent`, a
              // row-highlight tint sitting 1.09:1 off the chrome on github-light. That is enough
              // to mark the active row of a list, where position carries the rest of the message,
              // and not enough to mark one of three identical segments — where the fill IS the
              // message, and where on 8 of the 15 themes it comes with no change of text colour
              // at all, since their `--sidebar-accent-foreground` is a copy of
              // `--sidebar-foreground`. Reading the alias instead keeps the content fill *and*
              // its own foreground, so selecting a segment repaints its label and its icon.
              //
              // Re-check either change with `pnpm --filter @git-manager/ui test:apca`.
              checked
                ? 'bg-control-active text-control-active-foreground font-medium shadow-xs'
                : stacked
                  ? // Not muted, unlike the other two shapes — and that is the APCA policy talking,
                    // not taste. `muted-foreground` is exempt from the Bronze gate only where it is
                    // decorative (an inactive Chip, a neutral Tag); an unselected segment is a
                    // *control you click*, and the policy's own words are "actions are never
                    // muted". At 10px on the track it measures 48Lc against a bar of 75, which the
                    // matrix catches — see `packages/ui/stories/a11yMatrix.test.tsx`.
                    'text-foreground'
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
            {stacked ? (
              <>
                <span aria-hidden="true" className="flex items-center justify-center">
                  {option.icon}
                </span>
                <span className="text-[10px] leading-none">{option.label}</span>
              </>
            ) : option.icon ? (
              <>
                <span aria-hidden="true">{option.icon}</span>
                <span className="sr-only">{option.label}</span>
              </>
            ) : (
              option.label
            )}
          </label>
        )

        // A tooltip only where the label isn't already on screen.
        return option.icon && !stacked ? (
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
