import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@git-manager/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('./components/GeneralSection', () => ({
  GeneralSection: () => <div data-testid="section-general" />,
}))
vi.mock('./components/SshSection', () => ({ SshSection: () => <div data-testid="section-ssh" /> }))
vi.mock('./components/IntegrationSection', () => ({
  IntegrationSection: () => <div data-testid="section-integrations" />,
}))
vi.mock('./components/LlmSection', () => ({
  LlmSection: () => <div data-testid="section-local_ai" />,
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
      await user.click(screen.getByText(`settings.sections.${key}`))
      expect(screen.getByTestId(`section-${key}`)).toBeInTheDocument()
    }
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
