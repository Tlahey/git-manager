import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Button, Input, Separator } from '@git-manager/ui'
import { TagInput } from './TagInput'
import { useSettingsStore } from '../../../stores/settings.store'

export function AdvancedSection() {
  const { t } = useTranslation('settings')
  const { settings, updateSettings, resetSettings } = useSettingsStore()
  const advanced = settings.advanced
  const [confirmReset, setConfirmReset] = useState(false)

  function updateAdvanced(partial: Partial<typeof advanced>) {
    updateSettings({ advanced: { ...advanced, ...partial } })
  }

  async function handleOpenDataFolder() {
    const { open } = await import('@tauri-apps/plugin-shell')
    await open('~/.config/git-manager/').catch(() => {})
  }

  function handleReset() {
    if (confirmReset) {
      resetSettings()
      setConfirmReset(false)
    } else {
      setConfirmReset(true)
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">
          {t('settings.advanced.exclusions')}
        </label>
        <TagInput
          tags={advanced.scanExclusions}
          onChange={(tags) => updateAdvanced({ scanExclusions: tags })}
          placeholder="node_modules, dist…"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">
          {t('settings.advanced.scanDepth')}
        </label>
        <Input
          type="number"
          min={1}
          max={10}
          value={advanced.maxScanDepth}
          onChange={(e) => updateAdvanced({ maxScanDepth: parseInt(e.target.value, 10) })}
          className="h-8 w-24 text-xs"
        />
      </div>

      <Button
        size="sm"
        variant="outline"
        className="text-xs"
        onClick={handleOpenDataFolder}
      >
        {t('settings.advanced.openDataFolder')}
      </Button>

      <Separator />

      {/* Danger zone */}
      <div className="space-y-2 rounded border border-destructive/40 bg-destructive/5 p-4">
        <p className="text-xs font-semibold text-destructive">{t('settings.dangerZone')}</p>
        {confirmReset && (
          <p className="text-xs text-muted-foreground">{t('settings.advanced.resetConfirm')}</p>
        )}
        <Button
          size="sm"
          variant="destructive"
          className="text-xs"
          onClick={handleReset}
        >
          {confirmReset ? 'Confirm — reset all settings' : t('settings.advanced.reset')}
        </Button>
        {confirmReset && (
          <Button
            size="sm"
            variant="ghost"
            className="text-xs ml-2"
            onClick={() => setConfirmReset(false)}
          >
            Cancel
          </Button>
        )}
      </div>
    </div>
  )
}
