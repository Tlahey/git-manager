import type { SectionColor } from '../../../stores/dashboard.store'

// The colour lookup tables for a dashboard section, colocated as a `*.config.ts` per the repo
// convention for keyed style maps — and kept out of `SectionColorPicker.tsx` so that file
// exports components only (`react/only-export-components`, which guards Fast Refresh).

/**
 * The swatch grid behind "Change color". Colours are theme tokens rather than free-form hex, so a
 * section header can never be tinted into something unreadable in one of the two colour schemes —
 * see `SECTION_COLORS`.
 */
export const SECTION_COLOR_SWATCH: Record<SectionColor, string> = {
  primary: 'bg-primary',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
  violet: 'bg-violet-500',
  sky: 'bg-sky-500',
  slate: 'bg-slate-500',
}

/** Header tint per colour: a left accent bar plus a matching wash. */
export const SECTION_COLOR_HEADER: Record<SectionColor, string> = {
  primary: 'border-l-2 border-l-primary bg-primary/10',
  emerald: 'border-l-2 border-l-emerald-500 bg-emerald-500/10',
  amber: 'border-l-2 border-l-amber-500 bg-amber-500/10',
  rose: 'border-l-2 border-l-rose-500 bg-rose-500/10',
  violet: 'border-l-2 border-l-violet-500 bg-violet-500/10',
  sky: 'border-l-2 border-l-sky-500 bg-sky-500/10',
  slate: 'border-l-2 border-l-slate-500 bg-slate-500/10',
}
