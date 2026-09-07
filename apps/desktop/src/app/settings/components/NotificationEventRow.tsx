import { Checkbox, NativeSelect } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import type { NotificationScope, NotificationSettings } from '@git-manager/git-types'
import {
  NOTIFICATION_SCOPE_OPTIONS,
  resolveNotificationScope,
} from '../../../lib/notifications/notificationScope'
import type { NotificationEventToggle } from './notificationEvents.config'

interface NotificationEventRowProps {
  toggle: NotificationEventToggle
  notifications: NotificationSettings
  onChange: (partial: Partial<NotificationSettings>) => void
}

/**
 * One event's row: the on/off checkbox, and — for the events that watch pull requests — the
 * audience filter under it.
 *
 * Its own component rather than a block inside `NotificationSection`, because the row stopped
 * being a single control: the scope select must sit *outside* the `<label>` that wraps the
 * checkbox (a form control inside a label activates that label's control, so clicking the select
 * would toggle the event off), which makes the row a small layout of its own.
 *
 * The `setting-<key>` test id stays on the `<label>` and nowhere else, so the click surface the
 * e2e suite drives to toggle an event is still exactly the checkbox's own — and the select's id is
 * `setting-scope-<key>` rather than `setting-<key>-scope` so that the suite's
 * `[data-testid^="setting-notifyOn"]` row query keeps counting rows, not controls.
 */
export function NotificationEventRow({
  toggle,
  notifications,
  onChange,
}: NotificationEventRowProps) {
  const { t } = useTranslation('common')
  const { key, titleKey, descKey, scopeKey } = toggle

  const checked = (notifications[key] as boolean | undefined) ?? true
  const scope = scopeKey ? resolveNotificationScope(scopeKey, notifications) : null

  return (
    <div className="flex flex-col gap-1.5">
      <label
        className="flex cursor-pointer items-center justify-between"
        data-testid={`setting-${key}`}
      >
        <div className="flex flex-col gap-0.5">
          <span className="font-sans text-xs text-foreground">{t(titleKey)}</span>
          <span className="font-sans text-[10px] text-muted-foreground">{t(descKey)}</span>
        </div>
        <Checkbox
          checked={checked}
          onChange={(e) => onChange({ [key]: e.target.checked })}
          aria-label={t(titleKey)}
        />
      </label>

      {/* Hidden while the event is off: a filter on a notification that is never raised is a
          control that silently does nothing, the same reasoning as the notch-only duration. */}
      {scopeKey && checked && (
        <div className="flex items-center justify-between pl-1">
          <span className="text-[10px] text-muted-foreground">
            {t('notifications.settings.scopeLabel')}
          </span>
          <NativeSelect
            data-testid={`setting-scope-${key}`}
            value={scope ?? 'all'}
            onChange={(e) =>
              onChange({
                scopes: {
                  ...notifications.scopes,
                  [scopeKey]: e.target.value as NotificationScope,
                },
              })
            }
            aria-label={t('notifications.settings.scopeAriaLabel', { event: t(titleKey) })}
            className="h-7 min-w-[150px] rounded border border-border bg-background px-2 text-[10px] font-medium text-foreground outline-hidden transition-colors hover:border-accent-foreground/30 focus:border-primary"
          >
            {NOTIFICATION_SCOPE_OPTIONS.map(({ value, labelKey }) => (
              <option key={value} value={value}>
                {t(labelKey)}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}
    </div>
  )
}
