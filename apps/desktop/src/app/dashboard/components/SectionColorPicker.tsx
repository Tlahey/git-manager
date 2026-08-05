import { useTranslation } from '@git-manager/i18n'
import { Check, Ban } from 'lucide-react'
import { SECTION_COLORS, type SectionColor } from '../../../stores/dashboard.store'
import { SECTION_COLOR_SWATCH } from './sectionColor.config'

interface SectionColorPickerProps {
  sectionId: string
  value: SectionColor | null
  onChange: (color: SectionColor | null) => void
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
