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
              <p className="text-[10px] text-muted-foreground">Activer ou désactiver toutes les notifications de l'application.</p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={notifications.enabled}
              onChange={(e) => updateNotifications({ enabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-background after:border-border after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
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
              <label className="flex items-center justify-between cursor-pointer">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-foreground">Fetch automatique</span>
                  <span className="text-[10px] text-muted-foreground">Notifier quand de nouvelles modifications sont récupérées du remote</span>
                </div>
                <input
                  type="checkbox"
                  checked={notifications.notifyOnFetch}
                  onChange={(e) => updateNotifications({ notifyOnFetch: e.target.checked })}
                  className="h-4 w-4 rounded border-border"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-foreground font-sans">Résultat de Pull (Mise à jour)</span>
                  <span className="text-[10px] text-muted-foreground font-sans">Notifier lors de la réussite ou de l'échec de la récupération des commits</span>
                </div>
                <input
                  type="checkbox"
                  checked={notifications.notifyOnPull}
                  onChange={(e) => updateNotifications({ notifyOnPull: e.target.checked })}
                  className="h-4 w-4 rounded border-border font-sans"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-foreground">Résultat de Push (Envoi)</span>
                  <span className="text-[10px] text-muted-foreground">Notifier lors de l'envoi de vos commits locaux vers le serveur distant</span>
                </div>
                <input
                  type="checkbox"
                  checked={notifications.notifyOnPush}
                  onChange={(e) => updateNotifications({ notifyOnPush: e.target.checked })}
                  className="h-4 w-4 rounded border-border"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-foreground">Nouvelles Pull Requests</span>
                  <span className="text-[10px] text-muted-foreground">Notifier quand une nouvelle Pull Request apparaît</span>
                </div>
                <input
                  type="checkbox"
                  checked={notifications.notifyOnNewPr ?? true}
                  onChange={(e) => updateNotifications({ notifyOnNewPr: e.target.checked })}
                  className="h-4 w-4 rounded border-border"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-foreground">PRs fusionnées ou fermées</span>
                  <span className="text-[10px] text-muted-foreground">Notifier quand une PR est fusionnée ou fermée</span>
                </div>
                <input
                  type="checkbox"
                  checked={notifications.notifyOnPrMerged ?? true}
                  onChange={(e) => updateNotifications({ notifyOnPrMerged: e.target.checked })}
                  className="h-4 w-4 rounded border-border"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-foreground font-sans">Demandes de revue</span>
                  <span className="text-[10px] text-muted-foreground font-sans">Notifier quand on vous demande de revoir une PR</span>
                </div>
                <input
                  type="checkbox"
                  checked={notifications.notifyOnReviewRequested ?? true}
                  onChange={(e) => updateNotifications({ notifyOnReviewRequested: e.target.checked })}
                  className="h-4 w-4 rounded border-border font-sans"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-foreground font-sans">Mises à jour des revues</span>
                  <span className="text-[10px] text-muted-foreground font-sans">Notifier quand l'état d'approbation d'une PR est mis à jour</span>
                </div>
                <input
                  type="checkbox"
                  checked={notifications.notifyOnReviewStatusChanged ?? true}
                  onChange={(e) => updateNotifications({ notifyOnReviewStatusChanged: e.target.checked })}
                  className="h-4 w-4 rounded border-border font-sans"
                />
              </label>
            </div>
          </div>

          <Separator />

          {/* Sounds */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {notifications.enableSound ? (
                  <Volume2 className="h-4 w-4 text-primary" />
                ) : (
                  <VolumeX className="h-4 w-4 text-muted-foreground" />
                )}
                <div>
                  <h4 className="text-xs font-semibold text-foreground">Effets sonores</h4>
                  <p className="text-[10px] text-muted-foreground font-sans">Jouer un son lors d'une notification ou d'une erreur critique.</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifications.enableSound}
                  onChange={(e) => updateNotifications({ enableSound: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-background after:border-border after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>
          </div>

          <Separator />

          {/* Test notifications */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-foreground">Test de notifications</h4>
            <p className="text-[10px] text-muted-foreground">Envoyer une notification native macOS de test.</p>
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
              className="flex items-center gap-2 px-3 py-1.5 rounded bg-primary text-primary-foreground font-medium text-xs transition-colors hover:bg-primary/95 mt-1"
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
