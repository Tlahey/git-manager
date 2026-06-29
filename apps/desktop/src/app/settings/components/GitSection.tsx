import { useTranslation } from '@git-manager/i18n'
import { Input, Separator } from '@git-manager/ui'
import { TagInput } from './TagInput'
import { useSettingsStore } from '../../../stores/settings.store'

export function GitSection() {
  const { t } = useTranslation('settings')
  const { settings, updateSettings } = useSettingsStore()
  const git = settings.git

  function updateGit(partial: Partial<typeof git>) {
    updateSettings({ git: { ...git, ...partial } })
  }

  const autoFetchOptions = [
    { value: null, label: t('settings.git.autoFetch.off') },
    { value: 5, label: '5 min' },
    { value: 15, label: '15 min' },
    { value: 30, label: '30 min' },
  ]

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">{t('settings.git.defaultName')}</label>
        <Input
          value={git.defaultAuthorName}
          onChange={(e) => updateGit({ defaultAuthorName: e.target.value })}
          className="h-8 text-xs"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">{t('settings.git.defaultEmail')}</label>
        <Input
          type="email"
          value={git.defaultAuthorEmail}
          onChange={(e) => updateGit({ defaultAuthorEmail: e.target.value })}
          className="h-8 text-xs"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">
          {t('settings.git.protectedBranches')}
        </label>
        <TagInput
          tags={git.protectedBranches}
          onChange={(branches) => updateGit({ protectedBranches: branches })}
          placeholder="main, master…"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">{t('settings.git.autoFetch')}</label>
        <select
          value={git.autoFetchIntervalMinutes ?? 'null'}
          onChange={(e) => {
            const val = e.target.value === 'null' ? null : parseInt(e.target.value, 10)
            updateGit({ autoFetchIntervalMinutes: val })
          }}
          className="w-full h-8 rounded-md border border-input bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {autoFetchOptions.map((opt) => (
            <option key={String(opt.value)} value={String(opt.value)}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={git.showRemoteBranches}
            onChange={(e) => updateGit({ showRemoteBranches: e.target.checked })}
            className="h-4 w-4 rounded border-border"
          />
          <span className="text-xs text-foreground">{t('settings.git.showRemotes')}</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={git.confirmBeforeForcePush}
            onChange={(e) => updateGit({ confirmBeforeForcePush: e.target.checked })}
            className="h-4 w-4 rounded border-border"
          />
          <span className="text-xs text-foreground">{t('settings.git.confirmForcePush')}</span>
        </label>
      </div>

      <Separator />

      <div className="space-y-4">
        <h4 className="text-xs font-semibold text-foreground">{t('settings.git.externalEditor')}</h4>
        <div className="space-y-1.5">
          <select
            value={git.externalEditor ?? 'vscode'}
            onChange={(e) => updateGit({ externalEditor: e.target.value })}
            className="w-full h-8 rounded-md border border-input bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring font-sans"
          >
            <option value="vscode">VS Code</option>
            <option value="cursor">Cursor</option>
            <option value="sublime">Sublime Text</option>
            <option value="intellij">IntelliJ IDEA</option>
            <option value="custom">Commande personnalisée</option>
          </select>
        </div>

        {git.externalEditor === 'custom' && (
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium text-muted-foreground">{t('settings.git.externalEditorCommand')}</label>
            <Input
              value={git.externalEditorCommand ?? ''}
              onChange={(e) => updateGit({ externalEditorCommand: e.target.value })}
              placeholder={t('settings.git.externalEditorCommandPlaceholder')}
              className="h-8 text-xs font-sans"
            />
          </div>
        )}
      </div>
    </div>
  )
}
