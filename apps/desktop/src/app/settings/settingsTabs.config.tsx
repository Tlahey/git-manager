import type { ReactNode } from 'react'
import { ScrollArea, LlmIcon } from '@git-manager/ui'
import {
  Bell,
  FolderTree,
  GitBranch,
  GitCommitHorizontal,
  Heart,
  Kanban,
  KeyRound,
  Palette,
  Play,
  Puzzle,
  ScrollText,
  Settings2,
  Sparkles,
  Trophy,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { GeneralSection } from './components/GeneralSection'
import { AiFeaturesSection } from './components/AiFeaturesSection'
import { SshSection } from './components/SshSection'
import { IntegrationSection } from './components/IntegrationSection'
import { AiSection } from './components/AiSection'
import { ExternalToolsSection } from './components/ExternalToolsSection'
import { NotificationSection } from './components/NotificationSection'
import { BoardSection } from './components/BoardSection'
import { AppearanceSection } from './components/AppearanceSection'
import { RewardsSection } from './components/RewardsSection'
import { ChangelogSection } from './components/ChangelogSection'
import { SupportSection } from './components/SupportSection'
import { ResetToDefaultButton } from './components/ResetToDefaultButton'
import { defineTabs, type TabDef } from '../../lib/navigation/tabRegistry'
import type { Section, LocalSection } from './sections'

/**
 * Which pages the settings side panel offers, and what each one renders.
 *
 * A table rather than a hundred lines of JSX in the page, per the repo's `*.config.ts` convention:
 * every entry answers the same four questions — id, icon, label, what it draws — and reading them
 * side by side is the only way to see that the answers stay consistent.
 *
 * Every page but two rides the same two wrappers, and which ones opt out is the part worth knowing:
 * `integrations` is full-bleed (it manages its own scrolling), and the three read-only pages —
 * rewards, changelog, support — have nothing to reset.
 */

/** What a tab needs from the page to build its reset button. Each key resets exactly its own page. */
export interface SettingsResetActions {
  general: () => void
  ssh: () => void
  ai: () => void
  aiFeatures: () => void
  externalTools: () => void
  notifications: () => void
  board: () => void
  appearance: () => void
}

interface BuildTabsInput {
  t: (key: string) => string
  /** The master AI switch. With it off, the AI-features page is not merely disabled — it is absent,
   *  here and in the repository group below, because none of its settings can apply. */
  aiEnabled: boolean
  reset: SettingsResetActions
}

/** Scrollable, centered layout shared by every section except `integrations` (full-bleed).
 *  Exported because the Repository scope frames its single page exactly the same way. */
export function scrolled(node: ReactNode) {
  return (
    <ScrollArea className="flex-1">
      <div className="mx-auto max-w-xl px-8 py-6">{node}</div>
    </ScrollArea>
  )
}

/** Prepends a right-aligned per-page "reset to default" button above a section's content. */
export function withReset(node: ReactNode, onReset: () => void) {
  return (
    <>
      <div className="mb-4 flex justify-end">
        <ResetToDefaultButton onReset={onReset} />
      </div>
      {node}
    </>
  )
}

/** The Global configuration group, in side-panel order. `support` is included and the page pins it
 *  to the bottom itself. */
export function buildSettingsTabs({ t, aiEnabled, reset }: BuildTabsInput): TabDef<Section>[] {
  return defineTabs([
    {
      id: 'general',
      icon: Settings2,
      label: t('settings.sections.general'),
      // Commit style lives on its own AI-commit page, so General resets only its own fields.
      render: () => scrolled(withReset(<GeneralSection />, reset.general)),
    },
    {
      id: 'ssh',
      icon: KeyRound,
      label: t('settings.sections.ssh'),
      render: () => scrolled(withReset(<SshSection />, reset.ssh)),
    },
    {
      id: 'integrations',
      icon: Puzzle,
      label: t('settings.sections.integrations'),
      // Full-bleed: this page owns its own scrolling and its own two-pane layout.
      render: () => (
        <div className="h-full flex-1 overflow-hidden">
          <IntegrationSection />
        </div>
      ),
    },
    {
      id: 'local_ai',
      icon: LlmIcon,
      label: t('settings.sections.local_ai'),
      render: () => scrolled(withReset(<AiSection />, reset.ai)),
    },
    ...(aiEnabled
      ? [
          {
            id: 'ai_features' as const,
            icon: Sparkles,
            label: t('settings.sections.ai_features'),
            render: () => scrolled(withReset(<AiFeaturesSection />, reset.aiFeatures)),
          },
        ]
      : []),
    {
      id: 'external_tools',
      icon: Wrench,
      label: t('settings.sections.external_tools'),
      render: () => scrolled(withReset(<ExternalToolsSection />, reset.externalTools)),
    },
    {
      id: 'notifications',
      icon: Bell,
      label: t('settings.sections.notifications'),
      render: () => scrolled(withReset(<NotificationSection />, reset.notifications)),
    },
    {
      id: 'board',
      icon: Kanban,
      label: t('settings.sections.board'),
      render: () => scrolled(withReset(<BoardSection />, reset.board)),
    },
    {
      id: 'ui_customization',
      icon: Palette,
      label: t('settings.sections.ui_customization'),
      render: () => scrolled(withReset(<AppearanceSection />, reset.appearance)),
    },
    // The three below are read-only: there is nothing on them to reset.
    {
      id: 'rewards',
      icon: Trophy,
      label: t('settings.sections.rewards'),
      render: () => scrolled(<RewardsSection />),
    },
    {
      id: 'changelog',
      icon: ScrollText,
      label: t('settings.sections.changelog'),
      render: () => scrolled(<ChangelogSection />),
    },
    {
      id: 'support',
      icon: Heart,
      label: t('settings.sections.support'),
      render: () => scrolled(<SupportSection />),
    },
  ])
}

/** The Repository configuration group. Only shown with a workspace open — see `SettingsPage`. */
export function buildLocalTabs({ t, aiEnabled }: Pick<BuildTabsInput, 't' | 'aiEnabled'>): {
  id: LocalSection
  label: string
  icon: LucideIcon
}[] {
  return [
    { id: 'gitflow', label: t('settings.sections.gitflow'), icon: GitBranch },
    { id: 'appearance', label: t('settings.sections.ui_customization'), icon: Palette },
    ...(aiEnabled
      ? [
          {
            id: 'ai_commit' as const,
            label: t('settings.sections.ai_commit'),
            icon: GitCommitHorizontal,
          },
        ]
      : []),
    { id: 'worktree', label: t('settings.sections.worktree'), icon: FolderTree },
    { id: 'run', label: t('settings.sections.run'), icon: Play },
  ]
}
