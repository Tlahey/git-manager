import { Bell, BellOff, Volume2, VolumeX } from 'lucide-react'
import type { NotificationSettings } from '@git-manager/git-types'
import { useSettingsStore } from '../../../stores/settings.store'
import { Separator, Switch, Checkbox, NativeSelect } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import { useNotificationStore } from '../../../stores/notification.store'
import { showNativeNotification } from '../../../hooks/useNotificationWatcher'
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
}

export function NotificationSection() {
  const { t } = useTranslation('common')
  const { settings, updateSettings } = useSettingsStore()

  const notifications = settings.notifications || DEFAULT_NOTIFICATION_SETTINGS

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

          {/* Test notifications */}
          <FilterableSetting
            className="space-y-3"
            testId="setting-notif-test"
            match={`${t('notifications.settings.testTitle')} test tester notification`}
          >
            <Separator className="mb-3" />
            <h4 className="text-xs font-semibold text-foreground">
              <Highlight text={t('notifications.settings.testTitle')} />
            </h4>
            <p className="text-[10px] text-muted-foreground">
              {t('notifications.settings.testDesc')}
            </p>
            <button
              type="button"
              onClick={() => {
                const newNotif = useNotificationStore.getState().addNotification({
                  type: 'review_requested',
                  repo: 'git-manager',
                  prNumber: 247,
                  prTitle: t('notifications.settings.testPrTitle'),
                  prId: 'test-pr-settings',
                  author: 'antoine',
                  url: 'https://github.com/Tlahey/git-manager/pull/247',
                  targetTab: 'waiting',
                })
                showNativeNotification(newNotif, t)
              }}
              className="mt-1 flex items-center gap-2 rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/95"
            >
              <Bell className="h-3.5 w-3.5" />
              <span>{t('notifications.settings.testButton')}</span>
            </button>
          </FilterableSetting>
        </>
      )}
    </div>
  )
}
