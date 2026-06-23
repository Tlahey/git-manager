import { createPortal } from 'react-dom'
import { Settings, User } from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import { useSettingsStore } from '../../stores/settings.store'
import { useAnchoredMenu } from './useAnchoredMenu'

interface UserProfileProps {
  onOpenSettings: () => void
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/** Avatar miniature du compte Git/GitHub lié + menu compte. */
export function UserProfile({ onOpenSettings }: UserProfileProps) {
  const { t } = useTranslation('git')
  const { settings } = useSettingsStore()
  const { open, setOpen, pos, containerRef, triggerRef, menuRef } = useAnchoredMenu({
    align: 'right',
  })

  const name = settings.git.defaultAuthorName
  const email = settings.git.defaultAuthorEmail
  const avatarText = name ? initials(name) : ''

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={name || t('toolbar.account')}
        className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-secondary text-[10px] font-semibold text-secondary-foreground transition-colors hover:bg-accent"
      >
        {avatarText || <User className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: 'fixed', top: pos.top, left: pos.left, transform: 'translateX(-100%)' }}
            className="z-50 w-60 rounded-md border border-border bg-popover p-1 shadow-lg"
          >
            <div className="flex items-center gap-2.5 px-2 py-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-secondary text-xs font-semibold text-secondary-foreground">
                {avatarText || <User className="h-4 w-4 text-muted-foreground" />}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-xs font-medium text-foreground">
                  {name || t('toolbar.noAccount')}
                </span>
                {email && (
                  <span className="truncate text-[10px] text-muted-foreground">{email}</span>
                )}
              </span>
            </div>

            <div className="my-1 border-t border-border" />

            <button
              type="button"
              onClick={() => {
                setOpen(false)
                onOpenSettings()
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent"
            >
              <Settings className="h-3.5 w-3.5 text-muted-foreground" />
              {t('toolbar.preferences')}
            </button>
          </div>,
          document.body,
        )}
    </div>
  )
}
