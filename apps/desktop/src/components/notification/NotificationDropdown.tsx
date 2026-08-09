import { useState } from 'react'
import { useNotificationStore, type AppNotification } from '../../stores/notification.store'
import { useTranslation } from '@git-manager/i18n'
import { Bell, CheckCheck, Trash2 } from 'lucide-react'
import { getNotificationIcon, getNotificationText } from './utils'
import { buildNotificationRoute } from '../../lib/notifications/notificationRoute'
import { routeNotification } from '../../lib/notifications/notificationRouting'
import { Popover, PopoverTrigger, PopoverContent, Badge, NumberBadge } from '@git-manager/ui'
import { formatRelativeTimestamp } from '../../lib/relativeDate'

/**
 * The bell: what has already happened, and nothing else.
 *
 * It used to carry a simulator panel as well — four dev-only "Test …" buttons plus a mock-PR
 * mutator — which is now in the footer's debug menu. Two reasons for the move: this component had
 * grown to twice the size of the list it renders, and a trigger hidden inside the very surface it
 * tests is only discoverable by whoever wrote it.
 */
export function NotificationDropdown() {
  const { t } = useTranslation('common')
  const { notifications, markAllAsRead, clearNotifications } = useNotificationStore()

  const [menuOpen, setMenuOpen] = useState(false)

  const unreadCount = notifications.filter((n) => !n.read).length
  const recentNotifications = notifications.slice(0, 5)

  // Same destination as clicking the OS banner for this notification — one router, so the two
  // surfaces can't drift (marking it read is part of the route, not repeated here).
  function handleNotificationClick(notif: AppNotification) {
    setMenuOpen(false)
    void routeNotification(buildNotificationRoute(notif))
  }

  return (
    <Popover open={menuOpen} onOpenChange={setMenuOpen}>
      <PopoverTrigger asChild>
        <button
          data-testid="notification-bell-button"
          className={`relative flex h-7 w-7 cursor-pointer items-center justify-center rounded text-sidebar-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground ${
            menuOpen ? 'bg-sidebar-accent text-sidebar-foreground' : ''
          }`}
          title={t('notifications.title')}
        >
          <Bell className="h-3.5 w-3.5" />
          <NumberBadge
            count={unreadCount}
            data-testid="notification-unread-badge"
            className="absolute -top-1 -right-1 ring-2 ring-sidebar"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        data-testid="notification-dropdown"
        className="z-notification flex w-80 flex-col rounded-lg border border-border bg-popover text-popover-foreground shadow-2xl backdrop-blur-xs"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-foreground">
              {t('notifications.title')}
            </span>
            {unreadCount > 0 && (
              <Badge className="px-1.5 py-0 text-[9px] font-medium">{unreadCount} new</Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            {notifications.length > 0 && (
              <>
                <button
                  onClick={markAllAsRead}
                  data-testid="notification-mark-all-read"
                  className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  title={t('notifications.markAllAsRead')}
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={clearNotifications}
                  data-testid="notification-clear-all"
                  className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
                  title={t('notifications.clearAll')}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Notifications List */}
        <div className="max-h-[280px] min-h-[100px] overflow-y-auto">
          {recentNotifications.length === 0 ? (
            <div
              data-testid="notification-empty-state"
              className="flex flex-col items-center justify-center px-4 py-8 text-center"
            >
              <Bell className="mb-2 h-7 w-7 stroke-[1.5] text-muted-foreground/30" />
              <p className="text-[11px] text-muted-foreground">{t('notifications.empty')}</p>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {recentNotifications.map((notif) => {
                const { title, message } = getNotificationText(notif, t)
                return (
                  <button
                    key={notif.id}
                    data-testid={`notification-item-${notif.id}`}
                    onClick={() => handleNotificationClick(notif)}
                    className={`flex w-full cursor-pointer items-start gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-accent/40 ${
                      !notif.read ? 'bg-primary/5' : ''
                    }`}
                  >
                    <div className="mt-0.5 shrink-0">{getNotificationIcon(notif.type)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="truncate text-[11px] font-semibold text-foreground">
                          {title}
                        </span>
                        <span className="shrink-0 font-sans text-[9px] text-muted-foreground/60">
                          {formatRelativeTimestamp(notif.createdAt, t)}
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 font-sans text-[10px] leading-snug wrap-break-word text-muted-foreground">
                        {message}
                      </p>
                    </div>
                    {!notif.read && (
                      <div className="mt-1.5 ml-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
