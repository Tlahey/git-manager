import { Bell, BellOff, MonitorSmartphone, Volume2, VolumeX } from 'lucide-react'
import type { NotificationDisplayStyle, NotificationSettings } from '@git-manager/git-types'
import { useSettingsStore } from '../../../stores/settings.store'
import { Separator, Switch, Checkbox, NativeSelect } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import {
  DEFAULT_DISPLAY_DURATION_MS,
  DEFAULT_DISPLAY_STYLE,
  DISPLAY_DURATION_OPTIONS_MS,
  DISPLAY_STYLE_OPTIONS,
  resolveDisplayStyle,
} from '../../../lib/notifications/notificationDisplay'
import { FilterableSetting, Highlight } from './settingsSearch'

/**
 * The per-event toggles, in the order a pull request goes through them (local git ops first, then
 * the PR lifecycle: opened → review → CI → queued → merged/closed). Module-level, so these hold
 * i18n *keys* rather than copy — resolved through `t()` at render.
 */
const EVENT_TOGGLES: Array<{
  key: keyof NotificationSettings
  titleKey: string
  descKey: string
}> = [
  {
    key: 'notifyOnFetch',
    titleKey: 'notifications.settings.fetchTitle',
    descKey: 'notifications.settings.fetchDesc',
  },
  {
    key: 'notifyOnPull',
    titleKey: 'notifications.settings.pullTitle',
    descKey: 'notifications.settings.pullDesc',
  },
  {
    key: 'notifyOnPush',
    titleKey: 'notifications.settings.pushTitle',
    descKey: 'notifications.settings.pushDesc',
  },
  {
    key: 'notifyOnNewPr',
    titleKey: 'notifications.settings.newPrTitle',
    descKey: 'notifications.settings.newPrDesc',
  },
  {
    key: 'notifyOnReviewRequested',
    titleKey: 'notifications.settings.reviewRequestedTitle',
    descKey: 'notifications.settings.reviewRequestedDesc',
  },
  {
    key: 'notifyOnReviewStatusChanged',
    titleKey: 'notifications.settings.reviewStatusTitle',
    descKey: 'notifications.settings.reviewStatusDesc',
  },
  {
    key: 'notifyOnCi',
    titleKey: 'notifications.settings.ciTitle',
    descKey: 'notifications.settings.ciDesc',
  },
  {
    key: 'notifyOnPrQueued',
    titleKey: 'notifications.settings.prQueuedTitle',
    descKey: 'notifications.settings.prQueuedDesc',
  },
  {
    key: 'notifyOnPrMerged',
    titleKey: 'notifications.settings.prMergedTitle',
    descKey: 'notifications.settings.prMergedDesc',
  },
]

const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: true,
  notifyOnFetch: true,
  notifyOnPull: true,
  notifyOnPush: true,
  enableSound: false,
  notifyOnPrMerged: true,
  notifyOnPrQueued: true,
  notifyOnReviewRequested: true,
  notifyOnReviewStatusChanged: true,
  notifyOnNewPr: true,
  notifyOnCi: true,
  displayStyle: DEFAULT_DISPLAY_STYLE,
  displayDurationMs: DEFAULT_DISPLAY_DURATION_MS,
}

export function NotificationSection() {
  const { t } = useTranslation('common')
  const { settings, updateSettings } = useSettingsStore()

  const notifications = settings.notifications || DEFAULT_NOTIFICATION_SETTINGS
  const displayStyle = resolveDisplayStyle(notifications)
  const selectedStyleOption =
    DISPLAY_STYLE_OPTIONS.find((option) => option.value === displayStyle) ??
    DISPLAY_STYLE_OPTIONS[0]

  function updateNotifications(partial: Partial<typeof notifications>) {
    updateSettings({ notifications: { ...notifications, ...partial } })
  }

  return (
    <div className="space-y-6">
      {/* Global toggle */}
      <FilterableSetting
        className="space-y-4"
        match={`${t('notifications.settings.enableTitle')} notifications enable activer notification`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {notifications.enabled ? (
              <Bell className="h-5 w-5 text-primary" />
            ) : (
              <BellOff className="h-5 w-5 text-muted-foreground" />
            )}
            <div>
              <h4 className="text-xs font-semibold text-foreground">
                <Highlight text={t('notifications.settings.enableTitle')} />
              </h4>
              <p className="text-[10px] text-muted-foreground">
                {t('notifications.settings.enableDesc')}
              </p>
            </div>
          </div>
          <Switch
            checked={notifications.enabled}
            onChange={(e) => updateNotifications({ enabled: e.target.checked })}
            aria-label={t('notifications.settings.enableTitle')}
          />
        </div>
      </FilterableSetting>

      {notifications.enabled && (
        <>
          {/* Presentation: which surface, and for how long */}
          <FilterableSetting
            className="space-y-4"
            testId="setting-notif-display"
            match={`${t('notifications.settings.displayTitle')} ${t('notifications.settings.displayDuration')} display affichage popover banner bannière durée duration temps`}
          >
            <Separator className="mb-4" />
            <div className="flex items-start gap-3">
              <MonitorSmartphone className="mt-0.5 h-4 w-4 text-primary" />
              <div className="flex flex-1 flex-col gap-3">
                <div>
                  <h4 className="text-xs font-semibold text-foreground">
                    <Highlight text={t('notifications.settings.displayTitle')} />
                  </h4>
                  <p className="font-sans text-[10px] text-muted-foreground">
                    {t('notifications.settings.displayDesc')}
                  </p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">
                      {t('notifications.settings.displayStyle')}
                    </span>
                    <NativeSelect
                      data-testid="setting-notif-display-style"
                      // Resolved rather than read raw, so a snapshot still holding the old
                      // `popover` value selects the notch instead of leaving the select blank.
                      value={displayStyle}
                      onChange={(e) =>
                        updateNotifications({
                          displayStyle: e.target.value as NotificationDisplayStyle,
                        })
                      }
                      aria-label={t('notifications.settings.displayStyle')}
                      className="h-7 min-w-[150px] rounded border border-border bg-background px-2 text-[10px] font-medium text-foreground outline-none transition-colors hover:border-accent-foreground/30 focus:border-primary"
                    >
                      {DISPLAY_STYLE_OPTIONS.map(({ value, labelKey }) => (
                        <option key={value} value={value}>
                          {t(labelKey)}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                  {/* The choice is not cosmetic — it decides how many notifications the app
                      raises at all (see lib/notifications/notchDelivery.ts). Someone picking the
                      macOS banner is also turning progress and background-task cards off, and
                      that has to be readable from here rather than discovered later. */}
                  <p
                    data-testid="setting-notif-display-style-desc"
                    className="font-sans text-[10px] leading-4 text-muted-foreground"
                  >
                    {t(selectedStyleOption.descKey)}
                  </p>
                </div>

                {/* The banner's lifetime belongs to Notification Centre, not to us — offering a
                    duration next to it would be a control that silently does nothing. */}
                {resolveDisplayStyle(notifications) === 'notch' && (
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">
                      {t('notifications.settings.displayDuration')}
                    </span>
                    <NativeSelect
                      data-testid="setting-notif-display-duration"
                      value={String(notifications.displayDurationMs ?? DEFAULT_DISPLAY_DURATION_MS)}
                      onChange={(e) =>
                        updateNotifications({ displayDurationMs: Number(e.target.value) })
                      }
                      aria-label={t('notifications.settings.displayDuration')}
                      className="h-7 min-w-[150px] rounded border border-border bg-background px-2 text-[10px] font-medium text-foreground outline-none transition-colors hover:border-accent-foreground/30 focus:border-primary"
                    >
                      {DISPLAY_DURATION_OPTIONS_MS.map((ms) => (
                        <option key={ms} value={ms}>
                          {ms === 0
                            ? t('notifications.settings.displayDurationNever')
                            : t('notifications.settings.displayDurationSeconds', {
                                count: ms / 1000,
                              })}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                )}
              </div>
            </div>
          </FilterableSetting>

          {/* Events settings */}
          <FilterableSetting
            className="space-y-3"
            testId="setting-notif-events"
            match={`${t('notifications.settings.eventsTitle')} ${EVENT_TOGGLES.map((e) => t(e.titleKey)).join(' ')} events événements push pull fetch pr review revue ci merge queue`}
          >
            <Separator className="mb-3" />
            <h4 className="text-xs font-semibold text-foreground">
              <Highlight text={t('notifications.settings.eventsTitle')} />
            </h4>

            <div className="space-y-3 pl-1">
              {EVENT_TOGGLES.map(({ key, titleKey, descKey }) => (
                <label
                  key={key}
                  className="flex cursor-pointer items-center justify-between"
                  data-testid={`setting-${key}`}
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="font-sans text-xs text-foreground">{t(titleKey)}</span>
                    <span className="font-sans text-[10px] text-muted-foreground">
                      {t(descKey)}
                    </span>
                  </div>
                  <Checkbox
                    checked={(notifications[key] as boolean | undefined) ?? true}
                    onChange={(e) => updateNotifications({ [key]: e.target.checked })}
                    aria-label={t(titleKey)}
                  />
                </label>
              ))}
            </div>
          </FilterableSetting>

          {/* Sounds */}
          <FilterableSetting
            className="space-y-4"
            testId="setting-notif-sound"
            match={`${t('notifications.settings.soundTitle')} sound son volume audio`}
          >
            <Separator className="mb-4" />
            <div className="flex flex-col gap-2 py-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {notifications.enableSound ? (
                    <Volume2 className="h-4 w-4 text-primary" />
                  ) : (
                    <VolumeX className="h-4 w-4 text-muted-foreground" />
                  )}
                  <div className="flex flex-col">
                    <h4 className="text-xs font-semibold text-foreground">
                      <Highlight text={t('notifications.settings.soundTitle')} />
                    </h4>
                    <p className="font-sans text-[10px] text-muted-foreground">
                      {t('notifications.settings.soundDesc')}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={notifications.enableSound}
                  onChange={(e) => updateNotifications({ enableSound: e.target.checked })}
                  aria-label={t('notifications.settings.soundTitle')}
                />
              </div>

              {notifications.enableSound && (
                <div className="mt-1.5 flex items-center justify-between pl-7">
                  <span className="text-[10px] text-muted-foreground">
                    {t('notifications.settings.soundType')}
                  </span>
                  <NativeSelect
                    data-testid="setting-notif-sound-name"
                    aria-label={t('notifications.settings.soundType')}
                    value={notifications.soundName || 'default'}
                    onChange={(e) => updateNotifications({ soundName: e.target.value })}
                    className="h-7 min-w-[120px] rounded border border-border bg-background px-2 text-[10px] font-medium text-foreground outline-none transition-colors hover:border-accent-foreground/30 focus:border-primary"
                  >
                    <option value="default">Default</option>
                    <option value="Glass">Glass</option>
                    <option value="Hero">Hero</option>
                    <option value="Basso">Basso</option>
                    <option value="Blow">Blow</option>
                    <option value="Bottle">Bottle</option>
                    <option value="Frog">Frog</option>
                    <option value="Funk">Funk</option>
                    <option value="Morse">Morse</option>
                    <option value="Ping">Ping</option>
                    <option value="Pop">Pop</option>
                    <option value="Purr">Purr</option>
                    <option value="Submarine">Submarine</option>
                    <option value="Tink">Tink</option>
                  </NativeSelect>
                </div>
              )}
            </div>
          </FilterableSetting>
        </>
      )}
    </div>
  )
}
