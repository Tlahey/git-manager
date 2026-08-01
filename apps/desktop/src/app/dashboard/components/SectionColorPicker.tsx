import { useTranslation } from '@git-manager/i18n'
import { Check, Ban } from 'lucide-react'
import { SECTION_COLORS, type SectionColor } from '../../../stores/dashboard.store'

interface SectionColorPickerProps {
  sectionId: string
  value: SectionColor | null
  onChange: (color: SectionColor | null) => void
}

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

export function SectionColorPicker({ sectionId, value, onChange }: SectionColorPickerProps) {
  const { t } = useTranslation('dashboard')

  return (
    <div
      data-testid={`dashboard-color-picker-${sectionId}`}
      className="flex flex-wrap items-center gap-1.5 p-1"
    >
      <button
        type="button"
        data-testid={`dashboard-color-${sectionId}-none`}
        aria-label={t('dashboard.color.none')}
        aria-pressed={value === null}
        onClick={() => onChange(null)}
        className={`flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          value === null ? 'border-foreground' : 'border-border hover:border-foreground/40'
        }`}
      >
        <Ban className="h-3 w-3 text-muted-foreground" />
      </button>

      {SECTION_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          data-testid={`dashboard-color-${sectionId}-${color}`}
          aria-label={t(`dashboard.color.${color}`)}
          aria-pressed={value === color}
          onClick={() => onChange(color)}
          className={`flex h-6 w-6 cursor-pointer items-center justify-center rounded-full ${SECTION_COLOR_SWATCH[color]} ring-offset-1 ring-offset-popover transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            value === color ? 'ring-2 ring-foreground' : ''
          }`}
        >
          {value === color && <Check className="h-3 w-3 text-white" />}
        </button>
      ))}
    </div>
  )
}
