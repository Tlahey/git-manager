import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@git-manager/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('./components/GeneralSection', () => ({
  GeneralSection: () => <div data-testid="section-general" />,
}))
vi.mock('./components/RepositorySection', () => ({
  RepositorySection: () => <div data-testid="section-repository" />,
}))
vi.mock('./components/AiCommitSection', () => ({
  AiCommitSection: () => <div data-testid="section-ai_commit" />,
}))
vi.mock('./components/SshSection', () => ({ SshSection: () => <div data-testid="section-ssh" /> }))
vi.mock('./components/IntegrationSection', () => ({
  IntegrationSection: () => <div data-testid="section-integrations" />,
}))
vi.mock('./components/AiSection', () => ({
  AiSection: () => <div data-testid="section-local_ai" />,
}))
vi.mock('./components/ExternalToolsSection', () => ({
  ExternalToolsSection: () => <div data-testid="section-external_tools" />,
}))
vi.mock('./components/NotificationSection', () => ({
  NotificationSection: () => <div data-testid="section-notifications" />,
}))
vi.mock('./components/AppearanceSection', () => ({
  AppearanceSection: () => <div data-testid="section-ui_customization" />,
}))
vi.mock('./components/RewardsSection', () => ({
  RewardsSection: () => <div data-testid="section-rewards" />,
}))

import { SettingsPage } from './SettingsPage'
import { useRepoUIStore } from '../../stores/repoUI.store'
import { useSettingsStore } from '../../stores/settings.store'

const INITIAL_SETTINGS = useSettingsStore.getState()

beforeEach(() => {
  // A workspace is open by default so the Local scope is available; individual tests clear it.
  useRepoUIStore.setState({ activeRepo: '/repo' })
  useSettingsStore.setState(INITIAL_SETTINGS, true)
})

describe('SettingsPage — navigation', () => {
  it('shows the General section by default', () => {
    render(<SettingsPage onClose={vi.fn()} />)
    expect(screen.getByTestId('section-general')).toBeInTheDocument()
    expect(screen.queryByTestId('section-ssh')).not.toBeInTheDocument()
  })

  it('honors an initialSection prop', () => {
    render(<SettingsPage onClose={vi.fn()} initialSection="notifications" />)
    expect(screen.getByTestId('section-notifications')).toBeInTheDocument()
  })

  it('switches sections when a nav item is clicked, rendering only the active one', async () => {
    const user = userEvent.setup()
    render(<SettingsPage onClose={vi.fn()} />)
    await user.click(screen.getByText('settings.sections.ssh'))
    expect(screen.getByTestId('section-ssh')).toBeInTheDocument()
    expect(screen.queryByTestId('section-general')).not.toBeInTheDocument()
  })

  it('renders every section on request, including the full-bleed integrations layout', async () => {
    const user = userEvent.setup()
    render(<SettingsPage onClose={vi.fn()} />)
    for (const key of [
      'integrations',
      'local_ai',
      'external_tools',
      'ui_customization',
      'rewards',
    ]) {
      await user.click(screen.getByTestId(`settings-tab-${key}`))
      expect(screen.getByTestId(`section-${key}`)).toBeInTheDocument()
    }
  })
})

describe('SettingsPage — grouped side panel', () => {
  it('defaults to the first Global section, showing both nav groups', () => {
    render(<SettingsPage onClose={vi.fn()} />)
    expect(screen.getByTestId('settings-group-global')).toBeInTheDocument()
    expect(screen.getByTestId('settings-group-repository')).toBeInTheDocument()
    expect(screen.getByTestId('settings-tab-general')).toBeInTheDocument()
    expect(screen.queryByTestId('section-repository')).not.toBeInTheDocument()
  })

  it('labels the Repository group with the project name (last path segment)', () => {
    useRepoUIStore.setState({ activeRepo: '/home/me/gm-sandbox' })
    render(<SettingsPage onClose={vi.fn()} />)
    expect(screen.getByTestId('settings-group-repository')).toHaveTextContent('gm-sandbox')
  })

  it('hides the Repository group entirely when no workspace is open', () => {
    useRepoUIStore.setState({ activeRepo: null })
    render(<SettingsPage onClose={vi.fn()} />)
    expect(screen.queryByTestId('settings-group-repository')).not.toBeInTheDocument()
    expect(screen.queryByTestId('settings-local-tab-general')).not.toBeInTheDocument()
    // Global settings still render, and the Global group header is still shown.
    expect(screen.getByTestId('settings-group-global')).toBeInTheDocument()
    expect(screen.getByTestId('section-general')).toBeInTheDocument()
  })

  it('switches to a Repository page from the same side panel, keeping the global nav visible', async () => {
    const user = userEvent.setup()
    render(<SettingsPage onClose={vi.fn()} />)
    await user.click(screen.getByTestId('settings-local-tab-general'))
    expect(screen.getByTestId('section-repository')).toBeInTheDocument()
    // Both groups' nav items remain in the single side panel.
    expect(screen.getByTestId('settings-local-tab-appearance')).toBeInTheDocument()
    expect(screen.getByTestId('settings-tab-ssh')).toBeInTheDocument()
  })

  it('returns to a Global section', async () => {
    const user = userEvent.setup()
    render(<SettingsPage onClose={vi.fn()} />)
    await user.click(screen.getByTestId('settings-local-tab-general'))
    await user.click(screen.getByTestId('settings-tab-general'))
    expect(screen.getByTestId('section-general')).toBeInTheDocument()
    expect(screen.queryByTestId('section-repository')).not.toBeInTheDocument()
  })
})

describe('SettingsPage — AI-commit section gating', () => {
  it('shows the AI-commit nav entry when AI is enabled (default)', () => {
    render(<SettingsPage onClose={vi.fn()} />)
    expect(screen.getByTestId('settings-tab-ai_commit')).toBeInTheDocument()
  })

  it('hides the AI-commit nav entry when AI is disabled', () => {
    useSettingsStore.setState((s) => ({
      settings: { ...s.settings, ai: { ...s.settings.ai, enabled: false } },
    }))
    render(<SettingsPage onClose={vi.fn()} />)
    expect(screen.queryByTestId('settings-tab-ai_commit')).not.toBeInTheDocument()
  })

  it('also exposes an AI-commit page in the Repository group when AI is enabled', () => {
    render(<SettingsPage onClose={vi.fn()} />)
    expect(screen.getByTestId('settings-local-tab-ai_commit')).toBeInTheDocument()
  })
})

describe('SettingsPage — per-page reset', () => {
  it('shows a reset-to-default button on a settings-bearing page', () => {
    render(<SettingsPage onClose={vi.fn()} />)
    expect(screen.getByTestId('reset-to-default')).toBeInTheDocument()
  })

  it('shows a reset button on the Repository pages too', async () => {
    const user = userEvent.setup()
    render(<SettingsPage onClose={vi.fn()} />)
    await user.click(screen.getByTestId('settings-local-tab-general'))
    expect(screen.getByTestId('reset-to-default')).toBeInTheDocument()
  })

  it('does not show a reset button on non-settings pages (rewards)', async () => {
    const user = userEvent.setup()
    render(<SettingsPage onClose={vi.fn()} />)
    await user.click(screen.getByText('settings.sections.rewards'))
    expect(screen.queryByTestId('reset-to-default')).not.toBeInTheDocument()
  })
})

describe('SettingsPage — close', () => {
  it('calls onClose from the back button', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<SettingsPage onClose={onClose} />)
    await user.click(screen.getByText('Retour'))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
