import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SWRConfig } from 'swr'
import type { ReactElement } from 'react'
import type { OutdatedPackage } from '@git-manager/git-types'

const apiGetPackageChangelog = vi.fn()

vi.mock('../../api/packageHealth.api', () => ({
  apiGetPackageChangelog: (...args: unknown[]) => apiGetPackageChangelog(...args),
  apiCheckOutdatedPackages: vi.fn(),
  apiRunPackageHealthCheck: vi.fn(),
  apiHasPackageManifest: vi.fn(),
  apiUpdatePackages: vi.fn(),
}))

import { PackageChangelogPanel } from './PackageChangelogPanel'

function renderIsolated(ui: ReactElement) {
  return render(<SWRConfig value={{ provider: () => new Map() }}>{ui}</SWRConfig>)
}

const ENTRY: OutdatedPackage = {
  name: 'react',
  current: '18.2.0',
  wanted: '18.3.1',
  latest: '19.0.0',
  majorUpdate: true,
  deprecated: false,
}

const onClose = vi.fn()

const renderPanel = () =>
  renderIsolated(
    <PackageChangelogPanel entry={ENTRY} repoPath="/repo" accountId="octocat" onClose={onClose} />
  )

describe('PackageChangelogPanel', () => {
  beforeEach(() => {
    onClose.mockReset()
    apiGetPackageChangelog.mockReset().mockResolvedValue({
      repository: 'facebook/react',
      releasesUrl: 'https://github.com/facebook/react/releases',
      matched: true,
      releases: [
        {
          tag: 'v19.0.0',
          name: 'React 19',
          publishedAt: '2024-12-05T00:00:00Z',
          body: 'Actions, and more.',
          url: 'https://example.test/r',
        },
      ],
    })
  })

  it('opens as a right-anchored panel headed by the package and its jump', async () => {
    renderPanel()

    const panel = await screen.findByTestId('package-changelog-panel')
    expect(panel).toBeInTheDocument()
    expect(panel).toHaveTextContent('react')
    // FROM → TO repeated in the header, so the panel stands on its own.
    expect(panel).toHaveTextContent('18.2.0')
    expect(panel).toHaveTextContent('19.0.0')
  })

  it('fetches across the full jump, from installed to latest', async () => {
    renderPanel()

    await screen.findByTestId('changelog')
    expect(apiGetPackageChangelog).toHaveBeenCalledWith(
      '/repo',
      'react',
      '18.2.0',
      '19.0.0',
      'octocat'
    )
  })

  it('renders the release notes inside the panel', async () => {
    renderPanel()

    expect(await screen.findByText('v19.0.0')).toBeInTheDocument()
    expect(screen.getByText('React 19')).toBeInTheDocument()
  })

  it('is resizable by its left edge', async () => {
    renderPanel()
    expect(await screen.findByTestId('package-changelog-resize')).toBeInTheDocument()
  })

  it('closes on Escape', async () => {
    renderPanel()
    await screen.findByTestId('package-changelog-panel')

    await userEvent.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalled()
  })
})
