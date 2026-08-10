import { useTranslation } from '@git-manager/i18n'
import { OverriddenBadge } from '../OverriddenBadge'
import { FilterableSetting, Highlight } from '../settingsSearch'

/**
 * The integrated terminal's colours, when the repo has no override of its own.
 *
 * The two defaults are named here rather than repeated at each of their four uses — the value, the
 * preview, and the reset button all have to agree on what "default" means, and three literals that
 * happen to match is not agreement.
 */
export const DEFAULT_TERMINAL_BACKGROUND = '#000000'
export const DEFAULT_TERMINAL_FOREGROUND = '#e4e4e7'

interface TerminalColorsSettingProps {
  background: string | undefined
  foreground: string | undefined
  onChange: (patch: { terminalBackground?: string; terminalForeground?: string }) => void
}

export function TerminalColorsSetting({
  background,
  foreground,
  onChange,
}: TerminalColorsSettingProps) {
  const { t } = useTranslation('settings')
  const bg = background ?? DEFAULT_TERMINAL_BACKGROUND
  const fg = foreground ?? DEFAULT_TERMINAL_FOREGROUND

  return (
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
            value={bg}
            onChange={(e) => onChange({ terminalBackground: e.target.value })}
            data-testid="appearance-terminal-bg"
            className="h-8 w-16 cursor-pointer rounded border border-input bg-background"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
          {t('settings.appearance.terminalForeground')}
          <input
            type="color"
            value={fg}
            onChange={(e) => onChange({ terminalForeground: e.target.value })}
            data-testid="appearance-terminal-fg"
            className="h-8 w-16 cursor-pointer rounded border border-input bg-background"
          />
        </label>
        {/* A shell prompt, deliberately not translated: it is an example of what the terminal
            renders, not copy. */}
        <div
          className="flex h-8 items-center rounded border border-input px-3 font-mono text-xs"
          style={{ backgroundColor: bg, color: fg }}
          data-testid="appearance-terminal-preview"
        >
          $ git status
        </div>
        <button
          type="button"
          onClick={() =>
            onChange({
              terminalBackground: DEFAULT_TERMINAL_BACKGROUND,
              terminalForeground: DEFAULT_TERMINAL_FOREGROUND,
            })
          }
          data-testid="appearance-terminal-reset"
          className="h-7 cursor-pointer rounded border border-border px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {t('settings.appearance.resetTerminalColors')}
        </button>
      </div>
    </FilterableSetting>
  )
}
