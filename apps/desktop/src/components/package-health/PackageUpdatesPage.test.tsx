import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SWRConfig } from 'swr'
import type { ReactElement } from 'react'
import type { OutdatedPackage } from '@git-manager/git-types'

const apiCheckOutdatedPackages = vi.fn()
const apiUpdatePackages = vi.fn()
const apiGetPackageChangelog = vi.fn()

vi.mock('../../api/packageHealth.api', () => ({
  apiCheckOutdatedPackages: (...args: unknown[]) => apiCheckOutdatedPackages(...args),
  apiUpdatePackages: (...args: unknown[]) => apiUpdatePackages(...args),
  apiGetPackageChangelog: (...args: unknown[]) => apiGetPackageChangelog(...args),
  apiRunPackageHealthCheck: vi.fn(),
  apiHasPackageManifest: vi.fn(),
}))

import { PackageUpdatesPage } from './PackageUpdatesPage'

function renderIsolated(ui: ReactElement) {
  return render(<SWRConfig value={{ provider: () => new Map() }}>{ui}</SWRConfig>)
}

const renderPage = (manager = 'pnpm') =>
  renderIsolated(<PackageUpdatesPage repoPath="/repo" packageManager={manager} />)

function pkg(overrides: Partial<OutdatedPackage> = {}): OutdatedPackage {
  return {
    name: 'react',
    current: '18.2.0',
    wanted: '18.3.1',
    latest: '19.0.0',
    majorUpdate: true,
    deprecated: false,
    ...overrides,
  }
}

const okReport = (packages: OutdatedPackage[]) => ({
  packageManager: 'pnpm',
  status: 'ok' as const,
  packages,
})

describe('PackageUpdatesPage', () => {
  beforeEach(() => {
    apiCheckOutdatedPackages.mockReset().mockResolvedValue(okReport([pkg()]))
    apiUpdatePackages.mockReset().mockResolvedValue({ updated: ['react'], output: 'done' })
    apiGetPackageChangelog.mockReset().mockResolvedValue({
      repository: 'facebook/react',
      releasesUrl: null,
      matched: true,
      releases: [],
    })
  })

  /** Opening the tab is the trigger — the user shouldn't have to ask twice. */
  it('scans as soon as the page opens', async () => {
    renderPage()

    await waitFor(() => expect(apiCheckOutdatedPackages).toHaveBeenCalledWith('/repo', 'pnpm'))
    expect(await screen.findByTestId('package-update-row')).toBeInTheDocument()
  })

  it('lists a row per outdated package', async () => {
    apiCheckOutdatedPackages.mockResolvedValue(
      okReport([
        pkg(),
        pkg({
          name: 'vite',
          current: '6.0.3',
          wanted: '6.4.3',
          latest: '6.4.3',
          majorUpdate: false,
        }),
      ])
    )
    renderPage()

    expect(await screen.findByText('2 updates available')).toBeInTheDocument()
    expect(screen.getAllByTestId('package-update-row')).toHaveLength(2)
  })

  it('re-scans on demand', async () => {
    renderPage()
    await screen.findByTestId('package-update-row')

    await userEvent.click(screen.getByTestId('updates-scan'))

    await waitFor(() => expect(apiCheckOutdatedPackages).toHaveBeenCalledTimes(2))
  })

  it('updates one package and re-scans so the list cannot advertise a landed update', async () => {
    renderPage()
    await screen.findByTestId('package-update-row')

    await userEvent.click(screen.getByTestId('update-in-range'))

    await waitFor(() =>
      expect(apiUpdatePackages).toHaveBeenCalledWith('/repo', 'pnpm', ['react'], false)
    )
    // The scan on arrival, then one more once the update lands.
    await waitFor(() => expect(apiCheckOutdatedPackages).toHaveBeenCalledTimes(2))
  })

  it('bulk-updates only the in-range bumps, never the majors', async () => {
    apiCheckOutdatedPackages.mockResolvedValue(
      okReport([
        pkg(),
        // Nothing newer inside its range, so the bulk action must skip it.
        pkg({ name: 'stuck', current: '1.0.0', wanted: '1.0.0', latest: '2.0.0' }),
      ])
    )
    renderPage()

    const bulk = await screen.findByTestId('updates-bulk-in-range')
    expect(bulk).toHaveTextContent('Update all in-range (1)')
    await userEvent.click(bulk)

    expect(apiUpdatePackages).toHaveBeenCalledWith('/repo', 'pnpm', ['react'], false)
  })

  it('offers no bulk action when nothing is updatable in range', async () => {
    apiCheckOutdatedPackages.mockResolvedValue(
      okReport([pkg({ name: 'stuck', current: '1.0.0', wanted: '1.0.0', latest: '2.0.0' })])
    )
    renderPage()

    await screen.findByTestId('package-update-row')
    expect(screen.queryByTestId('updates-bulk-in-range')).not.toBeInTheDocument()
  })

  it('surfaces a failed update without clearing the list', async () => {
    apiUpdatePackages.mockRejectedValue(new Error('ERR_PNPM_OUTDATED_LOCKFILE'))
    renderPage()
    await screen.findByTestId('package-update-row')

    await userEvent.click(screen.getByTestId('update-in-range'))

    expect(await screen.findByTestId('updates-run-error')).toHaveTextContent(
      'ERR_PNPM_OUTDATED_LOCKFILE'
    )
    expect(screen.getByTestId('package-update-row')).toBeInTheDocument()
  })

  it('surfaces a failed scan', async () => {
    apiCheckOutdatedPackages.mockRejectedValue(new Error('ERR_PNPM_NO_LOCKFILE'))
    renderPage()

    expect(await screen.findByTestId('updates-scan-error')).toHaveTextContent(
      'ERR_PNPM_NO_LOCKFILE'
    )
  })

  it('opens the changelog in a side panel rather than inside the row', async () => {
    renderPage()
    const row = await screen.findByTestId('package-update-row')
    expect(within(row).queryByTestId('changelog')).not.toBeInTheDocument()

    await userEvent.click(within(row).getByTestId('toggle-changelog'))

    const panel = await screen.findByTestId('package-changelog-panel')
    expect(panel).toHaveTextContent('react')
    // The list stays behind the panel, so closing it returns you to your place.
    expect(screen.getByTestId('package-update-row')).toBeInTheDocument()
  })

  it('closes the changelog panel', async () => {
    renderPage()
    const row = await screen.findByTestId('package-update-row')
    await userEvent.click(within(row).getByTestId('toggle-changelog'))
    await screen.findByTestId('package-changelog-panel')

    await userEvent.keyboard('{Escape}')

    expect(screen.queryByTestId('package-changelog-panel')).not.toBeInTheDocument()
  })

  it('confirms everything is current when the scan finds nothing', async () => {
    apiCheckOutdatedPackages.mockResolvedValue(okReport([]))
    renderPage()

    expect(await screen.findByTestId('updates-up-to-date')).toHaveTextContent(
      'Every dependency is on its latest version.'
    )
  })

  it('tells the user to install the package manager rather than reporting a failure', async () => {
    apiCheckOutdatedPackages.mockResolvedValue({
      packageManager: 'pnpm',
      status: 'toolMissing',
      packages: [],
    })
    renderPage()

    expect(await screen.findByTestId('updates-tool-missing')).toHaveTextContent(
      'pnpm is not installed'
    )
  })

  it('explains that yarn has no machine-readable outdated command', async () => {
    apiCheckOutdatedPackages.mockResolvedValue({
      packageManager: 'yarn',
      status: 'unsupported',
      packages: [],
    })
    renderPage('yarn')

    expect(await screen.findByTestId('updates-unsupported')).toHaveTextContent(
      'yarn has no machine-readable outdated command'
    )
  })
})
