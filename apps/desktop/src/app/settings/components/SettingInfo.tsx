import { Info } from 'lucide-react'
import { Tooltip } from '@git-manager/ui'

interface SettingInfoProps {
  /** What the setting changes, already translated. */
  summary: string
  /** What the change reaches — and, as usefully, what it does not. Already translated. */
  scope: string
  /** Accessible name of the trigger, already translated. */
  label: string
  testId?: string
}

/**
 * The "what does this actually do?" affordance next to a setting's label: an info icon whose
 * tooltip states the effect and, on a second line, its scope.
 *
 * The trigger is a real `<button>` rather than the icon alone because the Tooltip opens on focus
 * as well as hover — an icon that only speaks to a mouse would leave the explanation unreachable
 * by keyboard. It takes translated strings rather than i18n keys so the copy stays visible in the
 * section that owns the setting, next to the control it describes.
 */
export function SettingInfo({ summary, scope, label, testId }: SettingInfoProps) {
  return (
    <Tooltip
      // The bubble is `whitespace-nowrap` by default, which is right for a short label and wrong
      // for two sentences — a scope line would otherwise run off the window.
      className="max-w-[280px] whitespace-normal"
      content={
        <span className="block space-y-1 text-left">
          <span className="block">{summary}</span>
          <span className="block text-muted-foreground">{scope}</span>
        </span>
      }
    >
      <button
        type="button"
        aria-label={label}
        data-testid={testId}
        className="inline-flex cursor-help items-center text-primary/70 transition-colors hover:text-primary"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
    </Tooltip>
  )
}
