import { useTranslation } from '@git-manager/i18n'
import { Checkbox, NativeSelect } from '@git-manager/ui'
import { Monitor, Check } from 'lucide-react'
import { useSettingsStore } from '../../../stores/settings.store'
import { OverriddenBadge } from './OverriddenBadge'
import { FilterableSetting, Highlight } from './settingsSearch'
import { useUserThemes } from '../../../hooks/useUserThemes'
import { BUILTIN_THEMES } from '../../../lib/themes'
import { useGameStore } from '../../../stores/game.store'
import { isEffectUnlocked } from '../../../lib/rewards/effects'

interface ThemeCardProps {
  id: string
  label: string
  colors: { bg: string; fg: string; primary: string; accent: string } | null
  isSystem?: boolean
  isActive: boolean
  isCustom?: boolean
  onClick: () => void
}

function ThemeCard({ id, label, colors, isSystem, isActive, isCustom, onClick }: ThemeCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`theme-card-${id}`}
      className={`relative flex cursor-pointer flex-col gap-2 rounded-lg border p-3 text-left transition-all ${
        isActive
          ? 'border-primary bg-primary/10 ring-1 ring-primary'
          : 'border-border hover:border-muted-foreground/40 hover:bg-accent/50'
      }`}
    >
      {/* Swatch preview */}
      {isSystem ? (
        <div className="flex h-12 w-full items-center justify-center rounded-md border border-border bg-gradient-to-br from-muted to-background">
          <Monitor className="h-5 w-5 text-muted-foreground" />
        </div>
      ) : colors ? (
        <div
          className="relative h-12 w-full overflow-hidden rounded-md border border-black/10"
          style={{ background: colors.bg }}
        >
          <div className="flex h-full gap-0.5 p-1.5">
            <div className="flex-1 rounded-sm" style={{ background: colors.primary }} />
            <div className="flex-1 rounded-sm" style={{ background: colors.accent }} />
            <div className="flex-1 rounded-sm opacity-60" style={{ background: colors.fg }} />
          </div>
        </div>
      ) : (
        <div className="relative flex h-12 w-full items-center justify-center rounded-md border border-dashed border-border bg-muted/30">
          <span className="text-[10px] text-muted-foreground">CSS</span>
        </div>
      )}

      {/* Name + badges */}
      <div className="flex w-full items-center justify-between gap-1 overflow-hidden">
        <span className="flex items-center gap-1 truncate text-xs font-medium text-foreground">
          {label}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          {isCustom && (
            <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground">
              custom
            </span>
          )}
          {isActive && <Check className="h-3.5 w-3.5 text-primary" />}
        </div>
      </div>
    </button>
  )
}

export function AppearanceSection() {
  const { t } = useTranslation('settings')
  const { settings, updateSettings } = useSettingsStore()
  const appearance = settings.appearance

  // Game/achievements statistics for theme locking
  const { achievements } = useGameStore()

  // Which achievement (if any) gates a given theme id is declared in achievements.json
  // (`effects: [{ type: 'theme', id: ... }]`), not hardcoded here — a new locked theme only
  // needs a JSON entry, see docs/architecture/15-rewards-system-refactor-plan.md.
  // Locked themes are hidden entirely rather than shown disabled.
  const unlockedBuiltinThemes = BUILTIN_THEMES.filter((theme) =>
    isEffectUnlocked(achievements, 'theme', theme.id)
  )

  // SWR hook replaces manual useEffect
  const { data: userThemesData } = useUserThemes()
  const userThemes = userThemesData ?? []

  function updateAppearance(partial: Partial<typeof appearance>) {
    updateSettings({ appearance: { ...appearance, ...partial } })
  }

  const densities: { value: 'compact' | 'normal' | 'comfortable'; label: string }[] = [
    { value: 'compact', label: t('settings.appearance.density.compact') },
    { value: 'normal', label: t('settings.appearance.density.normal') },
    { value: 'comfortable', label: t('settings.appearance.density.comfortable') },
  ]

  const rowHeights: { value: 'standard' | 'small'; label: string }[] = [
    { value: 'standard', label: t('settings.appearance.rowHeight.standard') },
    { value: 'small', label: t('settings.appearance.rowHeight.small') },
  ]

  const fontSizes = [12, 13, 14, 16]

  return (
    <div className="space-y-6">
      {/* Theme picker */}
      <FilterableSetting
        className="space-y-3"
        testId="setting-theme"
        match={`${t('settings.appearance.theme')} theme thème couleur apparence`}
      >
        <div className="flex items-center gap-2">
          <p className="text-xs font-medium text-foreground">
            <Highlight text={t('settings.appearance.theme')} />
          </p>
          <OverriddenBadge field="theme" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {unlockedBuiltinThemes.map((theme) => (
            <ThemeCard
              key={theme.id}
              id={theme.id}
              label={t(theme.labelKey)}
              colors={theme.colors}
              isSystem={theme.id === 'system'}
              isActive={appearance.theme === theme.id}
              onClick={() => updateAppearance({ theme: theme.id })}
            />
          ))}
          {userThemes.map((theme) => (
            <ThemeCard
              key={theme.id}
              id={theme.id}
              label={theme.name}
              colors={null}
              isActive={appearance.theme === theme.id}
              isCustom
              onClick={() => updateAppearance({ theme: theme.id })}
            />
          ))}
        </div>
        {/* Custom themes hint */}
        <p className="text-[11px] text-muted-foreground">
          {t('settings.appearance.customThemes')}:{' '}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
            ~/.git-manager/themes/
          </code>
        </p>
      </FilterableSetting>

      {/* Integrated terminal colours */}
      <FilterableSetting
        className="space-y-2"
        testId="setting-terminal-colors"
        match={`${t('settings.appearance.terminalColors')} terminal background foreground text colours couleurs fond texte shell zsh console`}
      >
        <div className="flex items-center gap-2">
          <p className="text-xs font-medium text-foreground">
            <Highlight text={t('settings.appearance.terminalColors')} />
          </p>
          <OverriddenBadge field="terminalBackground" />
          <OverriddenBadge field="terminalForeground" />
        </div>
        <p className="text-[11px] text-muted-foreground">
          {t('settings.appearance.terminalColorsHelp')}
        </p>
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
            {t('settings.appearance.terminalBackground')}
            <input
              type="color"
              value={appearance.terminalBackground ?? '#000000'}
              onChange={(e) => updateAppearance({ terminalBackground: e.target.value })}
              data-testid="appearance-terminal-bg"
              className="h-8 w-16 cursor-pointer rounded border border-input bg-background"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
            {t('settings.appearance.terminalForeground')}
            <input
              type="color"
              value={appearance.terminalForeground ?? '#e4e4e7'}
              onChange={(e) => updateAppearance({ terminalForeground: e.target.value })}
              data-testid="appearance-terminal-fg"
              className="h-8 w-16 cursor-pointer rounded border border-input bg-background"
            />
          </label>
          <div
            className="flex h-8 items-center rounded border border-input px-3 font-mono text-xs"
            style={{
              backgroundColor: appearance.terminalBackground ?? '#000000',
              color: appearance.terminalForeground ?? '#e4e4e7',
            }}
            data-testid="appearance-terminal-preview"
          >
            $ git status
          </div>
          <button
            type="button"
            onClick={() =>
              updateAppearance({ terminalBackground: '#000000', terminalForeground: '#e4e4e7' })
            }
            data-testid="appearance-terminal-reset"
            className="h-7 rounded border border-border px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {t('settings.appearance.resetTerminalColors')}
          </button>
        </div>
      </FilterableSetting>

      {/* Font size */}
      <FilterableSetting
        className="space-y-1.5"
        testId="setting-font-size"
        match={`${t('settings.appearance.fontSize')} font size police taille`}
      >
        <label className="text-xs font-medium text-foreground">
          <Highlight text={t('settings.appearance.fontSize')} />
        </label>
        <NativeSelect
          value={appearance.fontSize}
          onChange={(e) => updateAppearance({ fontSize: parseInt(e.target.value, 10) })}
          className="h-8 rounded-md border border-input bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {fontSizes.map((size) => (
            <option key={size} value={size}>
              {size}px
            </option>
          ))}
        </NativeSelect>
      </FilterableSetting>

      {/* Density */}
      <FilterableSetting
        className="space-y-2"
        testId="setting-density"
        match={`${t('settings.appearance.density')} density densité`}
      >
        <p className="text-xs font-medium text-foreground">
          <Highlight text={t('settings.appearance.density')} />
        </p>
        <div className="flex gap-2">
          {densities.map((d) => (
            <label
              key={d.value}
              className={`flex cursor-pointer items-center gap-1.5 rounded border px-3 py-1.5 text-xs transition-colors ${
                appearance.density === d.value
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border text-muted-foreground hover:bg-accent'
              }`}
            >
              <input
                type="radio"
                name="density"
                value={d.value}
                checked={appearance.density === d.value}
                onChange={() => updateAppearance({ density: d.value })}
                className="sr-only"
              />
              {d.label}
            </label>
          ))}
        </div>
      </FilterableSetting>

      {/* Row height */}
      <FilterableSetting
        className="space-y-2"
        testId="setting-row-height"
        match={`${t('settings.appearance.rowHeight')} row height hauteur ligne`}
      >
        <p className="text-xs font-medium text-foreground">
          <Highlight text={t('settings.appearance.rowHeight')} />
        </p>
        <div className="flex gap-2">
          {rowHeights.map((rh) => (
            <label
              key={rh.value}
              data-testid={`row-height-radio-${rh.value}`}
              className={`flex cursor-pointer items-center gap-1.5 rounded border px-3 py-1.5 text-xs transition-colors ${
                (appearance.rowHeight || 'standard') === rh.value
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border text-muted-foreground hover:bg-accent'
              }`}
            >
              <input
                type="radio"
                name="rowHeight"
                value={rh.value}
                checked={(appearance.rowHeight || 'standard') === rh.value}
                onChange={() => updateAppearance({ rowHeight: rh.value })}
                className="sr-only"
              />
              {rh.label}
            </label>
          ))}
        </div>
      </FilterableSetting>

      {/* Notification location */}
      <FilterableSetting
        className="space-y-1.5 font-sans"
        testId="setting-notification-location"
        match={`${t('settings.appearance.notificationLocation')} notification location emplacement`}
      >
        <label className="text-xs font-medium text-foreground">
          <Highlight text={t('settings.appearance.notificationLocation')} />
        </label>
        <NativeSelect
          value={appearance.notificationLocation || 'top-right'}
          onChange={(e) =>
            updateAppearance({
              notificationLocation: e.target.value as
                | 'top-right'
                | 'top-left'
                | 'bottom-right'
                | 'bottom-left',
            })
          }
          className="h-8 w-full rounded-md border border-input bg-background px-3 font-sans text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="top-right">Haut droit (Top Right)</option>
          <option value="top-left">Haut gauche (Top Left)</option>
          <option value="bottom-right">Bas droit (Bottom Right)</option>
          <option value="bottom-left">Bas gauche (Bottom Left)</option>
        </NativeSelect>
      </FilterableSetting>

      {/* Checkboxes */}
      <FilterableSetting
        className="space-y-2"
        match={`${t('settings.appearance.showAvatars')} ${t('settings.appearance.animations')} ${t('settings.appearance.stickyScroll')} avatars animations sticky scroll défilement`}
      >
        <FilterableSetting match={`${t('settings.appearance.showAvatars')} avatars`}>
          <label className="flex cursor-pointer items-center gap-2">
            <Checkbox
              checked={appearance.showAvatars}
              onChange={(e) => updateAppearance({ showAvatars: e.target.checked })}
            />
            <span className="text-xs text-foreground">
              <Highlight text={t('settings.appearance.showAvatars')} />
            </span>
          </label>
        </FilterableSetting>
        <FilterableSetting match={`${t('settings.appearance.animations')} animations`}>
          <label className="flex cursor-pointer items-center gap-2">
            <Checkbox
              checked={appearance.enableAnimations}
              onChange={(e) => updateAppearance({ enableAnimations: e.target.checked })}
            />
            <span className="text-xs text-foreground">
              <Highlight text={t('settings.appearance.animations')} />
            </span>
          </label>
        </FilterableSetting>
        <FilterableSetting
          match={`${t('settings.appearance.stickyScroll')} sticky scroll défilement`}
        >
          <label className="flex cursor-pointer items-center gap-2">
            <Checkbox
              checked={appearance.stickyScroll ?? false}
              onChange={(e) => updateAppearance({ stickyScroll: e.target.checked })}
            />
            <span className="text-xs text-foreground">
              <Highlight text={t('settings.appearance.stickyScroll')} />
            </span>
          </label>
        </FilterableSetting>
      </FilterableSetting>
    </div>
  )
}
