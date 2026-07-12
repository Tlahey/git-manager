import { Bell, BellOff, Volume2, VolumeX } from 'lucide-react'
import { useSettingsStore } from '../../../stores/settings.store'
import { Separator } from '@git-manager/ui'
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
              <h4 className="text-xs font-semibold text-foreground">Autoriser les notifications</h4>
              <p className="text-[10px] text-muted-foreground">
                Activer ou désactiver toutes les notifications de l&apos;application.
              </p>
            </div>
          </div>
          <label className="relative inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              checked={notifications.enabled}
              onChange={(e) => updateNotifications({ enabled: e.target.checked })}
              className="peer sr-only"
            />
            <div className="peer h-5 w-9 rounded-full bg-muted after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:border after:border-border after:bg-background after:transition-all after:content-[''] peer-checked:bg-primary peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none"></div>
          </label>
        </div>
      </div>

      {notifications.enabled && (
        <>
          <Separator />

          {/* Events settings */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-foreground">Événements de notification</h4>

            <div className="space-y-3 pl-1">
              <label className="flex cursor-pointer items-center justify-between">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-foreground">Fetch automatique</span>
                  <span className="text-[10px] text-muted-foreground">
                    Notifier quand de nouvelles modifications sont récupérées du remote
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={notifications.notifyOnFetch}
                  onChange={(e) => updateNotifications({ notifyOnFetch: e.target.checked })}
                  className="h-4 w-4 rounded border-border"
                />
              </label>

              <label className="flex cursor-pointer items-center justify-between">
                <div className="flex flex-col gap-0.5">
                  <span className="font-sans text-xs text-foreground">
                    Résultat de Pull (Mise à jour)
                  </span>
                  <span className="font-sans text-[10px] text-muted-foreground">
                    Notifier lors de la réussite ou de l&apos;échec de la récupération des commits
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={notifications.notifyOnPull}
                  onChange={(e) => updateNotifications({ notifyOnPull: e.target.checked })}
                  className="h-4 w-4 rounded border-border font-sans"
                />
              </label>

              <label className="flex cursor-pointer items-center justify-between">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-foreground">Résultat de Push (Envoi)</span>
                  <span className="text-[10px] text-muted-foreground">
                    Notifier lors de l&apos;envoi de vos commits locaux vers le serveur distant
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={notifications.notifyOnPush}
                  onChange={(e) => updateNotifications({ notifyOnPush: e.target.checked })}
                  className="h-4 w-4 rounded border-border"
                />
              </label>

              <label className="flex cursor-pointer items-center justify-between">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-foreground">Nouvelles Pull Requests</span>
                  <span className="text-[10px] text-muted-foreground">
                    Notifier quand une nouvelle Pull Request apparaît
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={notifications.notifyOnNewPr ?? true}
                  onChange={(e) => updateNotifications({ notifyOnNewPr: e.target.checked })}
                  className="h-4 w-4 rounded border-border"
                />
              </label>

              <label className="flex cursor-pointer items-center justify-between">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-foreground">PRs fusionnées ou fermées</span>
                  <span className="text-[10px] text-muted-foreground">
                    Notifier quand une PR est fusionnée ou fermée
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={notifications.notifyOnPrMerged ?? true}
                  onChange={(e) => updateNotifications({ notifyOnPrMerged: e.target.checked })}
                  className="h-4 w-4 rounded border-border"
                />
              </label>

              <label className="flex cursor-pointer items-center justify-between">
                <div className="flex flex-col gap-0.5">
                  <span className="font-sans text-xs text-foreground">Demandes de revue</span>
                  <span className="font-sans text-[10px] text-muted-foreground">
                    Notifier quand on vous demande de revoir une PR
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={notifications.notifyOnReviewRequested ?? true}
                  onChange={(e) =>
                    updateNotifications({ notifyOnReviewRequested: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-border font-sans"
                />
              </label>

              <label className="flex cursor-pointer items-center justify-between">
                <div className="flex flex-col gap-0.5">
                  <span className="font-sans text-xs text-foreground">Mises à jour des revues</span>
                  <span className="font-sans text-[10px] text-muted-foreground">
                    Notifier quand l&apos;état d&apos;approbation d&apos;une PR est mis à jour
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={notifications.notifyOnReviewStatusChanged ?? true}
                  onChange={(e) =>
                    updateNotifications({ notifyOnReviewStatusChanged: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-border font-sans"
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
                    <h4 className="text-xs font-semibold text-foreground">Effets sonores</h4>
                    <p className="font-sans text-[10px] text-muted-foreground">
                      Jouer un son lors d&apos;une notification.
                    </p>
                  </div>
                </div>
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    checked={notifications.enableSound}
                    onChange={(e) => updateNotifications({ enableSound: e.target.checked })}
                    className="peer sr-only"
                  />
                  <div className="peer h-5 w-9 rounded-full bg-muted after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:border after:border-border after:bg-background after:transition-all after:content-[''] peer-checked:bg-primary peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none"></div>
                </label>
              </div>

              {notifications.enableSound && (
                <div className="mt-1.5 flex items-center justify-between pl-7">
                  <span className="text-[10px] text-muted-foreground">Type de son macOS</span>
                  <select
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
                  </select>
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Test notifications */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-foreground">Test de notifications</h4>
            <p className="text-[10px] text-muted-foreground">
              Envoyer une notification native macOS de test.
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
              <span>Tester la notification macOS</span>
            </button>
          </div>
        </>
      )}
    </div>
  )
}
