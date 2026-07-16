import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@git-manager/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key,
  }),
}))

const { apiOpenUrl } = vi.hoisted(() => ({ apiOpenUrl: vi.fn() }))
vi.mock('../../../api/shell.api', () => ({ apiOpenUrl }))

import { SupportSection } from './SupportSection'

describe('SupportSection', () => {
  it('renders the support section with title and sponsor button', () => {
    render(<SupportSection />)

    expect(screen.getByTestId('support-settings-section')).toBeInTheDocument()
    expect(screen.getByText('settings.support.title')).toBeInTheDocument()
    expect(screen.getByTestId('support-sponsor-button')).toBeInTheDocument()
  })

  it('opens the GitHub Sponsors page when the sponsor button is clicked', async () => {
    const user = userEvent.setup()
    render(<SupportSection />)

    await user.click(screen.getByTestId('support-sponsor-button'))

    expect(apiOpenUrl).toHaveBeenCalledWith('https://github.com/sponsors/Tlahey')
  })
})
