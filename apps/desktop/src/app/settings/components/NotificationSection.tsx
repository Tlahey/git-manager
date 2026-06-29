import { useTranslation } from '@git-manager/i18n'
import { Bell, BellOff, Volume2, VolumeX } from 'lucide-react'
import { useSettingsStore } from '../../../stores/settings.store'
import { Separator } from '@git-manager/ui'

export function NotificationSection() {
  const { t } = useTranslation('settings')
  const { settings, updateSettings } = useSettingsStore()

  const notifications = settings.notifications || {
    enabled: true,
    notifyOnFetch: true,
    notifyOnPull: true,
    notifyOnPush: true,
    enableSound: false,
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
        </>
      )}
    </div>
  )
}
