import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Button, ScrollArea } from '@git-manager/ui'
import { ArrowLeft } from 'lucide-react'
import { GeneralSection } from './components/GeneralSection'
import { SshSection } from './components/SshSection'
import { IntegrationSection } from './components/IntegrationSection'
import { LlmSection } from './components/LlmSection'
import { ExternalToolsSection } from './components/ExternalToolsSection'
import { NotificationSection } from './components/NotificationSection'
import { AppearanceSection } from './components/AppearanceSection'

type Section = 'general' | 'ssh' | 'integrations' | 'local_ai' | 'external_tools' | 'notifications' | 'ui_customization'

interface SettingsPageProps {
  onClose: () => void
  initialSection?: Section
}

const isMac = typeof window !== 'undefined' && navigator.userAgent.includes('Mac')

export function SettingsPage({ onClose, initialSection }: SettingsPageProps) {
  const { t } = useTranslation('settings')
  const [activeSection, setActiveSection] = useState<Section>(initialSection || 'general')

  const navItems: { id: Section; label: string }[] = [
    { id: 'general', label: t('settings.sections.general') },
    { id: 'ssh', label: t('settings.sections.ssh') },
    { id: 'integrations', label: t('settings.sections.integrations') },
    { id: 'local_ai', label: t('settings.sections.local_ai') },
    { id: 'external_tools', label: t('settings.sections.external_tools') },
    { id: 'notifications', label: t('settings.sections.notifications') },
    { id: 'ui_customization', label: t('settings.sections.ui_customization') },
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
          Retour
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
              className={`w-full rounded px-3 py-2 text-left text-xs transition-colors cursor-pointer ${
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
        {activeSection === 'integrations' ? (
          <div className="flex-1 overflow-hidden h-full p-6">
            <IntegrationSection />
          </div>
        ) : (
          <ScrollArea className="flex-1">
            <div className="mx-auto max-w-xl px-8 py-6">
              {activeSection === 'general' && <GeneralSection />}
              {activeSection === 'ssh' && <SshSection />}
              {activeSection === 'local_ai' && <LlmSection />}
              {activeSection === 'external_tools' && <ExternalToolsSection />}
              {activeSection === 'notifications' && <NotificationSection />}
              {activeSection === 'ui_customization' && <AppearanceSection />}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  )
}
