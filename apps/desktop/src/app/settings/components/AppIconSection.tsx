import type { AppIconId } from '@git-manager/git-types'
import { useSettingsStore } from '../../../stores/settings.store'
import { FilterableSetting, Highlight } from './settingsSearch'
import { useTranslation } from '@git-manager/i18n'

import iconDefault from '../../../../src-tauri/icons/icon.png'
import iconLine from '../../../../src-tauri/icons/icon_line.png'
import iconFlat from '../../../../src-tauri/icons/icon_flat.png'
import iconMinimalLight from '../../../../src-tauri/icons/icon_minimal_light.png'
import iconNeon from '../../../../src-tauri/icons/icon_neon.png'
import icon3d from '../../../../src-tauri/icons/icon_3d.png'
import iconLight from '../../../../src-tauri/icons/icon_light.png'
import iconDuotone from '../../../../src-tauri/icons/icon_duotone.png'

export interface AppIconOption {
  id: AppIconId
  preview: string
}

export const APP_ICONS: AppIconOption[] = [
  { id: 'default', preview: iconDefault },
  { id: 'line', preview: iconLine },
  { id: 'flat', preview: iconFlat },
  { id: 'minimal-light', preview: iconMinimalLight },
  { id: 'neon', preview: iconNeon },
  { id: '3d', preview: icon3d },
  { id: 'light', preview: iconLight },
  { id: 'duotone', preview: iconDuotone },
]

export function AppIconSection() {
  const { settings, updateSettings } = useSettingsStore()
  const appearance = settings.appearance
  const selectedIcon = appearance.appIcon ?? 'default'
  const { t } = useTranslation('settings')

  // Only the setting is written here. `useAppIcon` is the one place that pushes a change to the
  // host, so a picked icon reaches the Dock by exactly one route whether it was picked here or
  // arrived from another window's copy of the store.
  const handleSelectIcon = (iconId: AppIconId) => {
    if (iconId === selectedIcon) return
    updateSettings({ appearance: { ...appearance, appIcon: iconId } })
  }

  return (
    <FilterableSetting
      className="space-y-3"
      testId="setting-app-icon"
      match={`${t('settings.appIcon.title')} ${t('settings.appIcon.keywords')}`}
    >
      <div className="flex items-center gap-2">
        <p className="text-xs font-medium text-foreground">
          <Highlight text={t('settings.appIcon.title')} />
        </p>
      </div>

      <ul
        className="max-h-[300px] space-y-2 overflow-y-auto rounded-md border border-border p-2"
        data-testid="app-icon-list"
      >
        {APP_ICONS.map((icon) => {
          const isActive = selectedIcon === icon.id
          const name = t(`settings.appIcon.${icon.id}.name`)
          const description = t(`settings.appIcon.${icon.id}.desc`)

          return (
            <li key={icon.id}>
              <label
                data-testid={`app-icon-card-${icon.id}`}
                className={`flex cursor-pointer items-center gap-4 rounded-lg border p-3 transition-all ${
                  isActive
                    ? 'border-primary bg-primary/10 ring-1 ring-primary'
                    : 'border-border hover:border-muted-foreground/40 hover:bg-accent/50'
                }`}
              >
                <div
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                    isActive ? 'border-primary' : 'border-muted-foreground/40'
                  }`}
                >
                  {isActive && <div className="h-2.5 w-2.5 rounded-full bg-primary" />}
                </div>

                <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/80 shadow-xs">
                  <img src={icon.preview} alt={name} className="h-full w-full object-cover" />
                </div>

                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-foreground">{name}</span>
                  <span className="text-xs text-muted-foreground">{description}</span>
                </div>

                <input
                  type="radio"
                  name="app-icon"
                  value={icon.id}
                  checked={isActive}
                  onChange={() => handleSelectIcon(icon.id)}
                  className="sr-only"
                  data-testid={`app-icon-radio-${icon.id}`}
                />
              </label>
            </li>
          )
        })}
      </ul>
    </FilterableSetting>
  )
}
