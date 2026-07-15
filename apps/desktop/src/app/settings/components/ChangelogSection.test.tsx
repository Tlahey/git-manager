import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@git-manager/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key,
  }),
}))

const { apiGetAppVersion } = vi.hoisted(() => ({ apiGetAppVersion: vi.fn() }))
vi.mock('../../../api/updater.api', () => ({ apiGetAppVersion }))

const { apiOpenUrl } = vi.hoisted(() => ({ apiOpenUrl: vi.fn() }))
vi.mock('../../../api/shell.api', () => ({ apiOpenUrl }))

vi.mock('../../../lib/changelog', () => ({
  getAppChangelog: () => [
    {
      version: 'Unreleased',
      date: null,
      sections: [
        {
          heading: '',
          items: [
            'feat: add thing by @octocat in https://github.com/owner/repo/pull/42',
          ],
        },
      ],
    },
    {
      version: '1.1.0',
      date: '2026-07-10',
      sections: [
        { heading: 'Added', items: ['Feature A', 'Feature B'] },
        { heading: 'Fixed', items: ['Bug C'] },
      ],
    },
    {
      version: '1.0.0',
      date: '2026-06-01',
      sections: [{ heading: 'Added', items: ['First feature'] }],
    },
  ],
}))

import { ChangelogSection } from './ChangelogSection'

describe('ChangelogSection', () => {
  it('renders every changelog entry with its sections and bullet items', async () => {
    apiGetAppVersion.mockResolvedValue('1.1.0')
    render(<ChangelogSection />)

    expect(screen.getByTestId('changelog-entry-Unreleased')).toBeInTheDocument()
    expect(screen.getByTestId('changelog-entry-1.1.0')).toBeInTheDocument()
    expect(screen.getByTestId('changelog-entry-1.0.0')).toBeInTheDocument()
    expect(screen.getByText('Feature A')).toBeInTheDocument()
    expect(screen.getByText('Bug C')).toBeInTheDocument()
    expect(screen.getByText('2026-06-01')).toBeInTheDocument()
  })

  it('badges the entry matching the running app version as current', async () => {
    apiGetAppVersion.mockResolvedValue('1.1.0')
    render(<ChangelogSection />)

    const badge = await screen.findByTestId('changelog-current-badge')
    expect(screen.getByTestId('changelog-entry-1.1.0')).toContainElement(badge)
  })

  it('does not show a current badge when the version cannot be read (e.g. outside Tauri)', async () => {
    apiGetAppVersion.mockRejectedValue(new Error('not in tauri'))
    render(<ChangelogSection />)

    expect(screen.queryByTestId('changelog-current-badge')).not.toBeInTheDocument()
  })

  it('renders a GitHub "by @user in <url>" bullet as a compact PR link and opens it via apiOpenUrl on click', async () => {
    apiGetAppVersion.mockResolvedValue('1.1.0')
    const user = userEvent.setup()
    render(<ChangelogSection />)

    expect(screen.getByText(/feat: add thing/)).toBeInTheDocument()
    expect(screen.getByText('@octocat')).toBeInTheDocument()
    const link = screen.getByText('#42')
    await user.click(link)
    expect(apiOpenUrl).toHaveBeenCalledWith('https://github.com/owner/repo/pull/42')
  })
})
