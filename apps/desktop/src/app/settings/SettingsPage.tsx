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
import { RewardsSection } from './components/RewardsSection'
import { DebugSection } from './components/DebugSection'
import { defineTabs, renderActiveTab, type TabDef } from '../../lib/navigation/tabRegistry'

export type Section = 'general' | 'ssh' | 'integrations' | 'local_ai' | 'external_tools' | 'notifications' | 'ui_customization' | 'rewards' | 'debug'

interface SettingsPageProps {
  onClose: () => void
  initialSection?: Section
}

const isMac = typeof window !== 'undefined' && navigator.userAgent.includes('Mac')

/** Scrollable, centered layout shared by every section except `integrations` (full-bleed). */
function scrolled(node: React.ReactNode) {
  return (
    <ScrollArea className="flex-1">
      <div className="mx-auto max-w-xl px-8 py-6">{node}</div>
    </ScrollArea>
  )
}

export function SettingsPage({ onClose, initialSection }: SettingsPageProps) {
  const { t } = useTranslation('settings')
  const [activeSection, setActiveSection] = useState<Section>(initialSection || 'general')

  const SETTINGS_TABS: TabDef<Section>[] = defineTabs([
    { id: 'general', label: t('settings.sections.general'), render: () => scrolled(<GeneralSection />) },
    { id: 'ssh', label: t('settings.sections.ssh'), render: () => scrolled(<SshSection />) },
    {
      id: 'integrations',
      label: t('settings.sections.integrations'),
      render: () => (
        <div className="flex-1 overflow-hidden h-full p-6">
          <IntegrationSection />
        </div>
      ),
    },
    { id: 'local_ai', label: t('settings.sections.local_ai'), render: () => scrolled(<LlmSection />) },
    { id: 'external_tools', label: t('settings.sections.external_tools'), render: () => scrolled(<ExternalToolsSection />) },
    { id: 'notifications', label: t('settings.sections.notifications'), render: () => scrolled(<NotificationSection />) },
    { id: 'ui_customization', label: t('settings.sections.ui_customization'), render: () => scrolled(<AppearanceSection />) },
    { id: 'rewards', label: t('settings.sections.rewards') || 'Succès & Récompenses', render: () => scrolled(<RewardsSection />) },
    { id: 'debug', label: t('settings.sections.debug') || 'Debug', render: () => scrolled(<DebugSection />) },
  ])

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
          {SETTINGS_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveSection(tab.id)}
              className={`w-full rounded px-3 py-2 text-left text-xs transition-colors cursor-pointer ${
                activeSection === tab.id
                  ? 'bg-accent text-foreground font-medium'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Content */}
        {renderActiveTab(SETTINGS_TABS, activeSection)}
      </div>
    </div>
  )
}
