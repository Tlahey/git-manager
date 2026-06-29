import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Button, ScrollArea } from '@git-manager/ui'
import { ArrowLeft } from 'lucide-react'
import { LlmSection } from './components/LlmSection'
import { GithubSection } from './components/GithubSection'
import { GitSection } from './components/GitSection'
import { AppearanceSection } from './components/AppearanceSection'
import { LanguageSection } from './components/LanguageSection'
import { AdvancedSection } from './components/AdvancedSection'

type Section = 'llm' | 'github' | 'git' | 'appearance' | 'language' | 'advanced'

interface SettingsPageProps {
  onClose: () => void
  initialSection?: Section
}

const isMac = typeof window !== 'undefined' && navigator.userAgent.includes('Mac')

export function SettingsPage({ onClose, initialSection }: SettingsPageProps) {
  const { t } = useTranslation('settings')
  const [activeSection, setActiveSection] = useState<Section>(initialSection || 'llm')

  const navItems: { id: Section; label: string }[] = [
    { id: 'llm', label: t('settings.sections.llm') },
    { id: 'github', label: t('settings.sections.github') },
    { id: 'git', label: t('settings.sections.git') },
    { id: 'appearance', label: t('settings.sections.appearance') },
    { id: 'language', label: t('settings.sections.language') },
    { id: 'advanced', label: t('settings.sections.advanced') },
  ]

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* Header */}
      <header
        data-tauri-drag-region
        className={`flex items-center gap-3 border-b border-border px-4 py-3 shrink-0 ${
          isMac ? 'pl-[72px]' : ''
        }`}
      >
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
        {activeSection === 'github' ? (
          <div className="flex-1 overflow-hidden h-full">
            <GithubSection />
          </div>
        ) : (
          <ScrollArea className="flex-1">
            <div className="mx-auto max-w-xl px-8 py-6">
              {activeSection === 'llm' && <LlmSection />}
              {activeSection === 'git' && <GitSection />}
              {activeSection === 'appearance' && <AppearanceSection />}
              {activeSection === 'language' && <LanguageSection />}
              {activeSection === 'advanced' && <AdvancedSection />}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  )
}
