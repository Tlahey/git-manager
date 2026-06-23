import { useState, useEffect } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { i18next } from '@git-manager/i18n'
import { Button, Input, Textarea, Separator, ScrollArea } from '@git-manager/ui'
import { ArrowLeft, ChevronDown, ChevronRight, Monitor, Check } from 'lucide-react'
import { useSettingsStore } from '../../stores/settings.store'
import { checkOllamaStatus, getUserThemes } from '../../lib/tauri'
import { BUILTIN_THEMES } from '../../lib/themes'
import type { OllamaStatus, UserTheme } from '@git-manager/git-types'

type Section = 'llm' | 'git' | 'appearance' | 'language' | 'advanced'

interface SettingsPageProps {
  onClose: () => void
}

// ─── Tag Input ────────────────────────────────────────────────────────────────

interface TagInputProps {
  tags: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
}

function TagInput({ tags, onChange, placeholder }: TagInputProps) {
  const [input, setInput] = useState('')

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if ((e.key === 'Enter' || e.key === ',') && input.trim()) {
      e.preventDefault()
      const value = input.trim().replace(/,+$/, '')
      if (value && !tags.includes(value)) {
        onChange([...tags, value])
      }
      setInput('')
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      onChange(tags.slice(0, -1))
    }
  }

  function removeTag(index: number) {
    onChange(tags.filter((_, i) => i !== index))
  }

  return (
    <div className="flex flex-wrap gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm focus-within:ring-1 focus-within:ring-ring min-h-[38px]">
      {tags.map((tag, i) => (
        <span
          key={i}
          className="flex items-center gap-1 rounded bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
        >
          {tag}
          <button
            type="button"
            onClick={() => removeTag(i)}
            className="opacity-60 hover:opacity-100 text-xs leading-none"
          >
            ×
          </button>
        </span>
      ))}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={tags.length === 0 ? placeholder : ''}
        className="flex-1 min-w-[80px] bg-transparent outline-none text-xs placeholder:text-muted-foreground"
      />
    </div>
  )
}

// ─── LLM Section ─────────────────────────────────────────────────────────────

function LlmSection() {
  const { t } = useTranslation('settings')
  const { settings, updateSettings } = useSettingsStore()
  const ollama = settings.ollama
  const [connectionStatus, setConnectionStatus] = useState<OllamaStatus | null>(null)
  const [isTesting, setIsTesting] = useState(false)
  const [promptExpanded, setPromptExpanded] = useState(false)

  function updateOllama(partial: Partial<typeof ollama>) {
    updateSettings({ ollama: { ...ollama, ...partial } })
  }

  async function handleTestConnection() {
    setIsTesting(true)
    try {
      const status = await checkOllamaStatus(ollama.url)
      setConnectionStatus(status)
    } catch {
      setConnectionStatus({ connected: false, models: [] })
    } finally {
      setIsTesting(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* URL + Test */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">{t('settings.ollama.url')}</label>
        <div className="flex gap-2">
          <Input
            value={ollama.url}
            onChange={(e) => updateOllama({ url: e.target.value })}
            className="flex-1 h-8 text-xs"
          />
          <Button
            size="sm"
            variant="outline"
            className="h-8 shrink-0 text-xs"
            onClick={handleTestConnection}
            disabled={isTesting}
          >
            {t('settings.ollama.test')}
          </Button>
        </div>
        {connectionStatus !== null && (
          <p
            className={`text-xs ${
              connectionStatus.connected ? 'text-green-500' : 'text-destructive'
            }`}
          >
            {connectionStatus.connected
              ? t('settings.ollama.connected', { count: connectionStatus.models.length })
              : t('settings.ollama.disconnected')}
          </p>
        )}
      </div>

      {/* Model */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">{t('settings.ollama.model')}</label>
        {connectionStatus?.connected && connectionStatus.models.length > 0 ? (
          <select
            value={ollama.model}
            onChange={(e) => updateOllama({ model: e.target.value })}
            className="w-full h-8 rounded-md border border-input bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {connectionStatus.models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        ) : (
          <Input
            value={ollama.model}
            onChange={(e) => updateOllama({ model: e.target.value })}
            className="h-8 text-xs"
          />
        )}
      </div>

      {/* Temperature */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">
          {t('settings.ollama.temperature')}
        </label>
        <Input
          type="number"
          min={0}
          max={1}
          step={0.1}
          value={ollama.temperature}
          onChange={(e) => updateOllama({ temperature: parseFloat(e.target.value) })}
          className="h-8 w-24 text-xs"
        />
      </div>

      {/* Timeout */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">{t('settings.ollama.timeout')}</label>
        <Input
          type="number"
          min={5}
          max={300}
          value={ollama.timeoutSeconds}
          onChange={(e) => updateOllama({ timeoutSeconds: parseInt(e.target.value, 10) })}
          className="h-8 w-24 text-xs"
        />
      </div>

      {/* Checkboxes */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={ollama.includeRepoContext}
            onChange={(e) => updateOllama({ includeRepoContext: e.target.checked })}
            className="h-4 w-4 rounded border-border"
          />
          <span className="text-xs text-foreground">{t('settings.llm.includeContext')}</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={ollama.autoDetectScope}
            onChange={(e) => updateOllama({ autoDetectScope: e.target.checked })}
            className="h-4 w-4 rounded border-border"
          />
          <span className="text-xs text-foreground">{t('settings.llm.autoScope')}</span>
        </label>
      </div>

      {/* System prompt (collapsible) */}
      <div className="space-y-1.5">
        <button
          type="button"
          onClick={() => setPromptExpanded((v) => !v)}
          className="flex items-center gap-1 text-xs font-medium text-foreground hover:text-primary transition-colors"
        >
          {promptExpanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          {t('settings.llm.systemPrompt')}
        </button>
        {promptExpanded && (
          <div className="space-y-1.5">
            <Textarea
              value={ollama.systemPrompt}
              onChange={(e) => updateOllama({ systemPrompt: e.target.value })}
              rows={5}
              className="resize-none font-mono text-xs"
            />
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
              onClick={() => updateOllama({ systemPrompt: '' })}
            >
              {t('settings.llm.resetPrompt')}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Git Section ──────────────────────────────────────────────────────────────

function GitSection() {
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
    </div>
  )
}

// ─── Appearance Section ───────────────────────────────────────────────────────

function ThemeCard({
  label,
  colors,
  isSystem,
  isActive,
  isCustom,
  onClick,
}: {
  id: string
  label: string
  colors: { bg: string; fg: string; primary: string; accent: string } | null
  isSystem?: boolean
  isActive: boolean
  isCustom?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex flex-col gap-2 rounded-lg border p-3 text-left transition-all cursor-pointer ${
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
          className="h-12 w-full overflow-hidden rounded-md border border-black/10"
          style={{ background: colors.bg }}
        >
          <div className="flex h-full gap-0.5 p-1.5">
            <div className="flex-1 rounded-sm" style={{ background: colors.primary }} />
            <div className="flex-1 rounded-sm" style={{ background: colors.accent }} />
            <div
              className="flex-1 rounded-sm opacity-60"
              style={{ background: colors.fg }}
            />
          </div>
        </div>
      ) : (
        <div className="flex h-12 w-full items-center justify-center rounded-md border border-dashed border-border bg-muted/30">
          <span className="text-[10px] text-muted-foreground">CSS</span>
        </div>
      )}

      {/* Name + badges */}
      <div className="flex items-center justify-between gap-1">
        <span className="text-xs font-medium text-foreground truncate">{label}</span>
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

function AppearanceSection() {
  const { t } = useTranslation('settings')
  const { settings, updateSettings } = useSettingsStore()
  const appearance = settings.appearance
  const [userThemes, setUserThemes] = useState<UserTheme[]>([])

  useEffect(() => {
    getUserThemes()
      .then(setUserThemes)
      .catch(() => setUserThemes([]))
  }, [])

  function updateAppearance(partial: Partial<typeof appearance>) {
    updateSettings({ appearance: { ...appearance, ...partial } })
  }

  const densities: { value: 'compact' | 'normal' | 'comfortable'; label: string }[] = [
    { value: 'compact', label: t('settings.appearance.density.compact') },
    { value: 'normal', label: t('settings.appearance.density.normal') },
    { value: 'comfortable', label: t('settings.appearance.density.comfortable') },
  ]

  const fontSizes = [12, 13, 14, 16]

  return (
    <div className="space-y-6">
      {/* Theme picker */}
      <div className="space-y-3">
        <p className="text-xs font-medium text-foreground">{t('settings.appearance.theme')}</p>
        <div className="grid grid-cols-3 gap-2">
          {BUILTIN_THEMES.map((theme) => (
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
      </div>

      {/* Font size */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">
          {t('settings.appearance.fontSize')}
        </label>
        <select
          value={appearance.fontSize}
          onChange={(e) => updateAppearance({ fontSize: parseInt(e.target.value, 10) })}
          className="h-8 rounded-md border border-input bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {fontSizes.map((size) => (
            <option key={size} value={size}>
              {size}px
            </option>
          ))}
        </select>
      </div>

      {/* Density */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-foreground">{t('settings.appearance.density')}</p>
        <div className="flex gap-2">
          {densities.map((d) => (
            <label
              key={d.value}
              className={`flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs cursor-pointer transition-colors ${
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
      </div>

      {/* Checkboxes */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={appearance.showAvatars}
            onChange={(e) => updateAppearance({ showAvatars: e.target.checked })}
            className="h-4 w-4 rounded border-border"
          />
          <span className="text-xs text-foreground">{t('settings.appearance.showAvatars')}</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={appearance.enableAnimations}
            onChange={(e) => updateAppearance({ enableAnimations: e.target.checked })}
            className="h-4 w-4 rounded border-border"
          />
          <span className="text-xs text-foreground">{t('settings.appearance.animations')}</span>
        </label>
      </div>
    </div>
  )
}

// ─── Language Section ─────────────────────────────────────────────────────────

function LanguageSection() {
  const { t } = useTranslation('settings')
  const { settings, updateSettings } = useSettingsStore()

  function handleChange(lang: 'en' | 'fr') {
    updateSettings({ language: lang })
    i18next.changeLanguage(lang)
  }

  const languages: { value: 'en' | 'fr'; label: string }[] = [
    { value: 'en', label: t('settings.language.en') },
    { value: 'fr', label: t('settings.language.fr') },
  ]

  return (
    <div className="space-y-5">
      <p className="text-xs font-medium text-foreground">{t('settings.language.title')}</p>
      <div className="flex gap-3">
        {languages.map((lang) => (
          <label
            key={lang.value}
            className={`flex items-center gap-2 rounded border px-4 py-2 text-sm cursor-pointer transition-colors ${
              settings.language === lang.value
                ? 'border-primary bg-primary/10 text-foreground'
                : 'border-border text-muted-foreground hover:bg-accent'
            }`}
          >
            <input
              type="radio"
              name="language"
              value={lang.value}
              checked={settings.language === lang.value}
              onChange={() => handleChange(lang.value)}
              className="sr-only"
            />
            {lang.label}
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{t('settings.language.note')}</p>
    </div>
  )
}

// ─── Advanced Section ─────────────────────────────────────────────────────────

function AdvancedSection() {
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

// ─── SettingsPage ─────────────────────────────────────────────────────────────

export function SettingsPage({ onClose }: SettingsPageProps) {
  const { t } = useTranslation('settings')
  const [activeSection, setActiveSection] = useState<Section>('llm')

  const navItems: { id: Section; label: string }[] = [
    { id: 'llm', label: t('settings.sections.llm') },
    { id: 'git', label: t('settings.sections.git') },
    { id: 'appearance', label: t('settings.sections.appearance') },
    { id: 'language', label: t('settings.sections.language') },
    { id: 'advanced', label: t('settings.sections.advanced') },
  ]

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-border px-4 py-3 shrink-0">
        <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={onClose}>
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </Button>
        <h1 className="text-sm font-semibold">{t('settings.title')}</h1>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left nav */}
        <nav className="w-44 shrink-0 border-r border-border bg-muted/20 p-2">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={`w-full rounded px-3 py-2 text-left text-xs transition-colors ${
                activeSection === item.id
                  ? 'bg-accent text-foreground font-medium'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <ScrollArea className="flex-1">
          <div className="mx-auto max-w-xl px-8 py-6">
            {activeSection === 'llm' && <LlmSection />}
            {activeSection === 'git' && <GitSection />}
            {activeSection === 'appearance' && <AppearanceSection />}
            {activeSection === 'language' && <LanguageSection />}
            {activeSection === 'advanced' && <AdvancedSection />}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
