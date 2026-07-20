import { Bell, BellOff, Volume2, VolumeX } from 'lucide-react'
import { useSettingsStore } from '../../../stores/settings.store'
import { Separator, Switch, Checkbox, NativeSelect } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import { useNotificationStore } from '../../../stores/notification.store'
import { showNativeNotification } from '../../../hooks/useNotificationWatcher'

export function NotificationSection() {
  const { t } = useTranslation('common')
  const { settings, updateSettings } = useSettingsStore()

  const notifications = settings.notifications || {
    enabled: true,
    notifyOnFetch: true,
    notifyOnPull: true,
    notifyOnPush: true,
    enableSound: false,
    notifyOnPrMerged: true,
    notifyOnReviewRequested: true,
    notifyOnReviewStatusChanged: true,
    notifyOnNewPr: true,
  }

  function updateNotifications(partial: Partial<typeof notifications>) {
    updateSettings({ notifications: { ...notifications, ...partial } })
  }

  return (
    <div className="space-y-6">
      {/* Global toggle */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {notifications.enabled ? (
              <Bell className="h-5 w-5 text-primary" />
            ) : (
              <BellOff className="h-5 w-5 text-muted-foreground" />
            )}
            <div>
              <h4 className="text-xs font-semibold text-foreground">
                {t('notifications.settings.enableTitle')}
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
      </div>

      {notifications.enabled && (
        <>
          <Separator />

          {/* Events settings */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-foreground">
              {t('notifications.settings.eventsTitle')}
            </h4>

            <div className="space-y-3 pl-1">
              <label className="flex cursor-pointer items-center justify-between">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-foreground">
                    {t('notifications.settings.fetchTitle')}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {t('notifications.settings.fetchDesc')}
                  </span>
                </div>
                <Checkbox
                  checked={notifications.notifyOnFetch}
                  onChange={(e) => updateNotifications({ notifyOnFetch: e.target.checked })}
                />
              </label>

              <label className="flex cursor-pointer items-center justify-between">
                <div className="flex flex-col gap-0.5">
                  <span className="font-sans text-xs text-foreground">
                    {t('notifications.settings.pullTitle')}
                  </span>
                  <span className="font-sans text-[10px] text-muted-foreground">
                    {t('notifications.settings.pullDesc')}
                  </span>
                </div>
                <Checkbox
                  checked={notifications.notifyOnPull}
                  onChange={(e) => updateNotifications({ notifyOnPull: e.target.checked })}
                />
              </label>

              <label className="flex cursor-pointer items-center justify-between">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-foreground">
                    {t('notifications.settings.pushTitle')}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {t('notifications.settings.pushDesc')}
                  </span>
                </div>
                <Checkbox
                  checked={notifications.notifyOnPush}
                  onChange={(e) => updateNotifications({ notifyOnPush: e.target.checked })}
                />
              </label>

              <label className="flex cursor-pointer items-center justify-between">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-foreground">
                    {t('notifications.settings.newPrTitle')}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {t('notifications.settings.newPrDesc')}
                  </span>
                </div>
                <Checkbox
                  checked={notifications.notifyOnNewPr ?? true}
                  onChange={(e) => updateNotifications({ notifyOnNewPr: e.target.checked })}
                />
              </label>

              <label className="flex cursor-pointer items-center justify-between">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-foreground">
                    {t('notifications.settings.prMergedTitle')}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {t('notifications.settings.prMergedDesc')}
                  </span>
                </div>
                <Checkbox
                  checked={notifications.notifyOnPrMerged ?? true}
                  onChange={(e) => updateNotifications({ notifyOnPrMerged: e.target.checked })}
                />
              </label>

              <label className="flex cursor-pointer items-center justify-between">
                <div className="flex flex-col gap-0.5">
                  <span className="font-sans text-xs text-foreground">
                    {t('notifications.settings.reviewRequestedTitle')}
                  </span>
                  <span className="font-sans text-[10px] text-muted-foreground">
                    {t('notifications.settings.reviewRequestedDesc')}
                  </span>
                </div>
                <Checkbox
                  checked={notifications.notifyOnReviewRequested ?? true}
                  onChange={(e) =>
                    updateNotifications({ notifyOnReviewRequested: e.target.checked })
                  }
                />
              </label>

              <label className="flex cursor-pointer items-center justify-between">
                <div className="flex flex-col gap-0.5">
                  <span className="font-sans text-xs text-foreground">
                    {t('notifications.settings.reviewStatusTitle')}
                  </span>
                  <span className="font-sans text-[10px] text-muted-foreground">
                    {t('notifications.settings.reviewStatusDesc')}
                  </span>
                </div>
                <Checkbox
                  checked={notifications.notifyOnReviewStatusChanged ?? true}
                  onChange={(e) =>
                    updateNotifications({ notifyOnReviewStatusChanged: e.target.checked })
                  }
                />
              </label>
            </div>
          </div>

          <Separator />

          {/* Sounds */}
          <div className="space-y-4">
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
                      {t('notifications.settings.soundTitle')}
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
          </div>

          <Separator />

          {/* Test notifications */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-foreground">
              {t('notifications.settings.testTitle')}
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
                  prTitle: 'Test de notification macOS',
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
          </div>
        </>
      )}
    </div>
  )
}
