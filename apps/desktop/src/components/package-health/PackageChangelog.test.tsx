import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SWRConfig } from 'swr'
import type { ReactElement } from 'react'

const apiGetPackageChangelog = vi.fn()
const openUrl = vi.fn()

vi.mock('../../api/packageHealth.api', () => ({
  apiGetPackageChangelog: (...args: unknown[]) => apiGetPackageChangelog(...args),
  apiCheckOutdatedPackages: vi.fn(),
  apiRunPackageHealthCheck: vi.fn(),
  apiHasPackageManifest: vi.fn(),
  apiUpdatePackages: vi.fn(),
}))
vi.mock('../../lib/openUrl', () => ({ openUrl: (...args: unknown[]) => openUrl(...args) }))

import { PackageChangelog } from './PackageChangelog'

function renderIsolated(ui: ReactElement) {
  return render(<SWRConfig value={{ provider: () => new Map() }}>{ui}</SWRConfig>)
}

const renderChangelog = () =>
  renderIsolated(<PackageChangelog repoPath="/repo" name="react" from="18.2.0" to="19.0.0" />)

const RELEASE = {
  tag: 'v19.0.0',
  name: 'React 19',
  publishedAt: '2024-12-05T00:00:00Z',
  body: '# Highlights\n\nActions, and more.',
  url: 'https://example.test/r',
}

describe('PackageChangelog', () => {
  beforeEach(() => {
    apiGetPackageChangelog.mockReset()
    openUrl.mockReset()
  })

  it('renders the release notes as markdown', async () => {
    apiGetPackageChangelog.mockResolvedValue({
      repository: 'facebook/react',
      releasesUrl: 'https://github.com/facebook/react/releases',
      matched: true,
      releases: [RELEASE],
    })
    renderChangelog()

    expect(await screen.findByTestId('changelog')).toBeInTheDocument()
    expect(screen.getByText('v19.0.0')).toBeInTheDocument()
    expect(screen.getByText('React 19')).toBeInTheDocument()
    expect(screen.getByText('Highlights')).toBeInTheDocument()
    expect(screen.queryByTestId('changelog-unmatched')).not.toBeInTheDocument()
  })

  /** Showing recent-but-wrong notes silently would be worse than showing none. */
  it('warns when the notes are recent rather than the ones being installed', async () => {
    apiGetPackageChangelog.mockResolvedValue({
      repository: 'facebook/react',
      releasesUrl: 'https://github.com/facebook/react/releases',
      matched: false,
      releases: [RELEASE],
    })
    renderChangelog()

    expect(await screen.findByTestId('changelog-unmatched')).toHaveTextContent(
      'No release matched this version range'
    )
  })

  it('explains a package with no GitHub repository', async () => {
    apiGetPackageChangelog.mockResolvedValue({
      repository: null,
      releasesUrl: null,
      matched: false,
      releases: [],
    })
    renderChangelog()

    expect(await screen.findByTestId('changelog-no-repository')).toHaveTextContent(
      'declares no GitHub repository'
    )
  })

  it('reports an empty range distinctly from a missing repository', async () => {
    apiGetPackageChangelog.mockResolvedValue({
      repository: 'facebook/react',
      releasesUrl: 'https://github.com/facebook/react/releases',
      matched: false,
      releases: [],
    })
    renderChangelog()

    expect(await screen.findByTestId('changelog-empty')).toHaveTextContent(
      'No release notes found for this version range.'
    )
    expect(screen.queryByTestId('changelog-no-repository')).not.toBeInTheDocument()
  })

  it('opens the full history in the real browser, not the webview', async () => {
    apiGetPackageChangelog.mockResolvedValue({
      repository: 'facebook/react',
      releasesUrl: 'https://github.com/facebook/react/releases',
      matched: true,
      releases: [RELEASE],
    })
    renderChangelog()

    await userEvent.click(await screen.findByTestId('changelog-open-github'))

    expect(openUrl).toHaveBeenCalledWith('https://github.com/facebook/react/releases')
  })

  it('surfaces a failed fetch', async () => {
    apiGetPackageChangelog.mockRejectedValue(new Error('rate limited'))
    renderChangelog()

    expect(await screen.findByTestId('changelog-error')).toHaveTextContent(
      'Could not load the release notes'
    )
  })

  /**
   * `accountId` is a GitHub login, never a token — the component must forward it
   * as-is so the real credential can be resolved server-side by that id.
   */
  it('forwards the connected account id to the changelog request', async () => {
    apiGetPackageChangelog.mockResolvedValue({
      repository: 'facebook/react',
      releasesUrl: null,
      matched: false,
      releases: [],
    })
    renderIsolated(
      <PackageChangelog
        repoPath="/repo"
        name="react"
        from="18.2.0"
        to="19.0.0"
        accountId="octocat"
      />
    )

    await screen.findByTestId('changelog-empty')

    expect(apiGetPackageChangelog).toHaveBeenCalledWith(
      '/repo',
      'react',
      '18.2.0',
      '19.0.0',
      'octocat'
    )
  })

  it('works with no account connected, unauthenticated', async () => {
    apiGetPackageChangelog.mockResolvedValue({
      repository: 'facebook/react',
      releasesUrl: null,
      matched: false,
      releases: [],
    })
    renderChangelog()

    await screen.findByTestId('changelog-empty')

    expect(apiGetPackageChangelog).toHaveBeenCalledWith(
      '/repo',
      'react',
      '18.2.0',
      '19.0.0',
      undefined
    )
  })
})
