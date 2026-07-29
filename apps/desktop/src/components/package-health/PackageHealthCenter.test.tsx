import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SWRConfig } from 'swr'
import type { ReactElement } from 'react'
import type { PackageHealthReport } from '@git-manager/git-types'

const apiRunPackageHealthCheck = vi.fn()
const apiCheckOutdatedPackages = vi.fn()

vi.mock('../../api/packageHealth.api', () => ({
  apiRunPackageHealthCheck: (...args: unknown[]) => apiRunPackageHealthCheck(...args),
  apiCheckOutdatedPackages: (...args: unknown[]) => apiCheckOutdatedPackages(...args),
  apiHasPackageManifest: vi.fn(),
  apiGetPackageChangelog: vi.fn(),
  apiUpdatePackages: vi.fn(),
}))

import { PackageHealthCenter } from './PackageHealthCenter'
import { usePackageHealthStore } from '../../stores/packageHealth.store'

function renderIsolated(ui: ReactElement) {
  return render(<SWRConfig value={{ provider: () => new Map() }}>{ui}</SWRConfig>)
}

const REPORT: PackageHealthReport = {
  packageManager: 'pnpm',
  hasCatalog: true,
  dependencyCount: 12,
  packages: [
    { name: 'root', path: 'package.json', version: null, private: true, dependencyCount: 4 },
    {
      name: '@app/ui',
      path: 'packages/ui/package.json',
      version: '1.0.0',
      private: false,
      dependencyCount: 8,
    },
  ],
  checks: [
    {
      id: 'versionAlignment',
      severity: 'warning',
      findings: [
        {
          severity: 'warning',
          dependency: 'react',
          actual: '^18.2.0, ^18.3.1',
          expected: null,
          refs: [
            {
              package: '@app/ui',
              path: 'packages/ui/package.json',
              field: 'dependencies',
              range: '^18.3.1',
            },
          ],
        },
      ],
    },
    { id: 'catalogDrift', severity: 'ok', findings: [] },
  ],
}

describe('PackageHealthCenter', () => {
  beforeEach(() => {
    apiRunPackageHealthCheck.mockReset().mockResolvedValue(REPORT)
    apiCheckOutdatedPackages.mockReset()
    usePackageHealthStore.setState({ open: true, selection: { kind: 'overview' } })
  })

  it('shows the workspace inventory on the overview', async () => {
    renderIsolated(<PackageHealthCenter repoPath="/repo" />)

    expect(await screen.findByTestId('health-report-overview')).toBeInTheDocument()
    expect(screen.getAllByTestId('health-workspace-package')).toHaveLength(2)
    expect(screen.getByText('@app/ui')).toBeInTheDocument()
    // Updates are a page of their own now, so nothing here can reach the network.
    expect(screen.queryByTestId('package-updates-page')).not.toBeInTheDocument()
  })

  it('renders the updates page as its own destination', async () => {
    usePackageHealthStore.setState({ selection: { kind: 'updates' } })
    renderIsolated(<PackageHealthCenter repoPath="/repo" />)

    expect(await screen.findByTestId('package-updates-page')).toBeInTheDocument()
    expect(screen.queryByTestId('health-report-overview')).not.toBeInTheDocument()
    // Selecting the tab is what starts the scan; the user shouldn't ask twice.
    await waitFor(() => expect(apiCheckOutdatedPackages).toHaveBeenCalledWith('/repo', 'pnpm'))
  })

  it('reports the catalog as in use when the repo declares one', async () => {
    renderIsolated(<PackageHealthCenter repoPath="/repo" />)
    expect(await screen.findByText('Catalog: in use')).toBeInTheDocument()
  })

  it('renders the selected check instead of the overview', async () => {
    usePackageHealthStore.setState({ selection: { kind: 'check', id: 'versionAlignment' } })
    renderIsolated(<PackageHealthCenter repoPath="/repo" />)

    expect(await screen.findByTestId('health-report-versionAlignment')).toBeInTheDocument()
    expect(screen.getByText('Ranges: ^18.2.0, ^18.3.1')).toBeInTheDocument()
    expect(screen.queryByTestId('health-report-overview')).not.toBeInTheDocument()
  })

  it('falls back to the overview when the selected check is not in the report', async () => {
    usePackageHealthStore.setState({ selection: { kind: 'check', id: 'rangeMismatch' } })
    renderIsolated(<PackageHealthCenter repoPath="/repo" />)

    expect(await screen.findByTestId('health-report-overview')).toBeInTheDocument()
  })

  it('closes the tool', async () => {
    renderIsolated(<PackageHealthCenter repoPath="/repo" />)
    await screen.findByTestId('health-report-overview')

    await userEvent.click(screen.getByTestId('package-health-close'))

    expect(usePackageHealthStore.getState().open).toBe(false)
  })

  it('surfaces a failed run', async () => {
    apiRunPackageHealthCheck.mockRejectedValue(new Error('No readable package.json at repo root'))
    renderIsolated(<PackageHealthCenter repoPath="/repo" />)

    const error = await screen.findByTestId('package-health-center-error')
    expect(error).toHaveTextContent('Could not run the health check')
    expect(error).toHaveTextContent('No readable package.json at repo root')
  })
})
