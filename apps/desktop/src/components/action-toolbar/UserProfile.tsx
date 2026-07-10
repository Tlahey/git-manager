import { User, UserPlus } from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import { useSettingsStore } from '../../stores/settings.store'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@git-manager/ui'
import type { Section } from '../../app/settings/SettingsPage'

interface UserProfileProps {
  onOpenSettings: (section?: Section) => void
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/** Avatar miniature du compte Git/GitHub lié + menu compte. */
export function UserProfile({ onOpenSettings }: UserProfileProps) {
  const { t } = useTranslation('settings')
  const { settings, updateSettings } = useSettingsStore()

  const github = settings.github || { accounts: [], activeAccountId: null }
  const activeAccount = github.accounts.find((a) => a.id === github.activeAccountId) || null

  const name = activeAccount ? (activeAccount.user.name || activeAccount.user.login) : t('settings.github.defaultUser')
  const email = activeAccount ? activeAccount.user.email : settings.git.defaultAuthorEmail
  const avatarUrl = activeAccount ? activeAccount.user.avatarUrl : null
  
  const defaultInitials = settings.git.defaultAuthorName ? initials(settings.git.defaultAuthorName) : ''
  const avatarText = activeAccount ? initials(name) : defaultInitials

  const otherAccounts = github.accounts.filter((a) => a.id !== github.activeAccountId)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={name}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-secondary text-[10px] font-semibold text-secondary-foreground transition-colors hover:bg-accent overflow-hidden"
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt={name} className="h-full w-full object-cover" />
          ) : avatarText ? (
            avatarText
          ) : (
            <User className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <div className="flex items-center gap-2.5 px-2 py-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-secondary text-xs font-semibold text-secondary-foreground overflow-hidden">
            {avatarUrl ? (
              <img src={avatarUrl} alt={name} className="h-full w-full object-cover" />
            ) : avatarText ? (
              avatarText
            ) : (
              <User className="h-4 w-4 text-muted-foreground" />
            )}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-xs font-medium text-foreground">
              {name}
            </span>
            {email && (
              <span className="truncate text-[10px] text-muted-foreground">{email}</span>
            )}
          </span>
        </div>

        {otherAccounts.length > 0 && (
          <>
            <div className="my-1 border-t border-border" />
            <div className="px-2 py-1 text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">
              {t('settings.github.switchAccount')}
            </div>
            <div className="max-h-[160px] overflow-y-auto">
              {otherAccounts.map((acc) => (
                <DropdownMenuItem
                  key={acc.id}
                  onSelect={() => {
                    updateSettings({
                      github: {
                        ...github,
                        activeAccountId: acc.id,
                      },
                    })
                  }}
                  className="gap-2 text-xs"
                >
                  <img src={acc.user.avatarUrl} alt={acc.user.login} className="h-4 w-4 rounded-full border border-border" />
                  <span className="truncate flex-1 font-medium text-foreground">
                    {acc.user.name || acc.user.login}
                  </span>
                </DropdownMenuItem>
              ))}
            </div>
          </>
        )}

        <div className="my-1 border-t border-border" />

        <DropdownMenuItem
          onSelect={() => onOpenSettings('integrations')}
          className="gap-2 text-xs font-medium text-primary hover:text-primary-hover"
        >
          <UserPlus className="h-3.5 w-3.5" />
          {t('settings.github.addUser')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
