import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@git-manager/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key,
  }),
}))

const { apiGetAppVersion } = vi.hoisted(() => ({ apiGetAppVersion: vi.fn() }))
vi.mock('../../../api/updater.api', () => ({ apiGetAppVersion }))

vi.mock('../../../lib/changelog', () => ({
  getAppChangelog: () => [
    {
      version: 'Unreleased',
      date: null,
      sections: [{ heading: 'Added', items: ['Work in progress feature'] }],
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
})
