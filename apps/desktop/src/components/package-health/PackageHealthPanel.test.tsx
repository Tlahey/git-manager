import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SWRConfig } from 'swr'
import type { ReactElement } from 'react'
import type { HealthCheck, PackageHealthReport } from '@git-manager/git-types'

const apiRunPackageHealthCheck = vi.fn()

vi.mock('../../api/packageHealth.api', () => ({
  apiRunPackageHealthCheck: (...args: unknown[]) => apiRunPackageHealthCheck(...args),
  apiHasPackageManifest: vi.fn(),
  apiCheckOutdatedPackages: vi.fn(),
}))

import { PackageHealthPanel } from './PackageHealthPanel'
import { usePackageHealthStore } from '../../stores/packageHealth.store'

/** Fresh SWR cache per render so one test's report doesn't serve the next. */
function renderIsolated(ui: ReactElement) {
  return render(<SWRConfig value={{ provider: () => new Map() }}>{ui}</SWRConfig>)
}

function check(overrides: Partial<HealthCheck> & Pick<HealthCheck, 'id'>): HealthCheck {
  return { severity: 'ok', findings: [], ...overrides }
}

function report(overrides: Partial<PackageHealthReport> = {}): PackageHealthReport {
  return {
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
    checks: [check({ id: 'versionAlignment' }), check({ id: 'catalogDrift' })],
    ...overrides,
  }
}

describe('PackageHealthPanel', () => {
  beforeEach(() => {
    apiRunPackageHealthCheck.mockReset().mockResolvedValue(report())
    usePackageHealthStore.setState({ open: true, selection: { kind: 'overview' } })
  })

  it('summarises the workspace and calls a clean repo all clear', async () => {
    renderIsolated(<PackageHealthPanel repoPath="/repo" />)

    expect(await screen.findByTestId('package-health-summary')).toHaveTextContent(
      '2 packages · 12 dependencies · pnpm'
    )
    expect(screen.getByTestId('package-health-verdict')).toHaveTextContent('All checks passed.')
  })

  it('counts only the checks that need attention, ignoring passed and skipped ones', async () => {
    apiRunPackageHealthCheck.mockResolvedValue(
      report({
        checks: [
          check({ id: 'versionAlignment', severity: 'warning' }),
          check({ id: 'duplicateDependency', severity: 'error' }),
          check({ id: 'missingInstall', severity: 'skipped' }),
          check({ id: 'catalogDrift', severity: 'ok' }),
        ],
      })
    )
    renderIsolated(<PackageHealthPanel repoPath="/repo" />)

    expect(await screen.findByTestId('package-health-verdict')).toHaveTextContent(
      '2 checks need attention'
    )
  })

  it('lists each check by its translated title with a finding count', async () => {
    apiRunPackageHealthCheck.mockResolvedValue(
      report({
        checks: [
          check({
            id: 'versionAlignment',
            severity: 'warning',
            findings: [
              { severity: 'warning', dependency: 'react', refs: [], actual: null, expected: null },
              { severity: 'warning', dependency: 'vite', refs: [], actual: null, expected: null },
            ],
          }),
        ],
      })
    )
    renderIsolated(<PackageHealthPanel repoPath="/repo" />)

    const row = await screen.findByTestId('health-check-versionAlignment')
    expect(row).toHaveTextContent('Version alignment')
    expect(row).toHaveTextContent('2')
  })

  it('hands the selected check to the center pane', async () => {
    renderIsolated(<PackageHealthPanel repoPath="/repo" />)

    await userEvent.click(await screen.findByTestId('health-check-catalogDrift'))

    expect(usePackageHealthStore.getState().selection).toEqual({
      kind: 'check',
      id: 'catalogDrift',
    })
  })

  it('offers updates as its own destination', async () => {
    renderIsolated(<PackageHealthPanel repoPath="/repo" />)

    await userEvent.click(await screen.findByTestId('health-check-updates'))

    expect(usePackageHealthStore.getState().selection).toEqual({ kind: 'updates' })
  })

  it('goes back to the overview', async () => {
    usePackageHealthStore.setState({ selection: { kind: 'check', id: 'catalogDrift' } })
    renderIsolated(<PackageHealthPanel repoPath="/repo" />)

    await userEvent.click(await screen.findByTestId('health-check-overview'))

    expect(usePackageHealthStore.getState().selection).toEqual({ kind: 'overview' })
  })

  it('re-runs the checks on refresh', async () => {
    renderIsolated(<PackageHealthPanel repoPath="/repo" />)
    await screen.findByTestId('package-health-summary')

    await userEvent.click(screen.getByTestId('package-health-refresh'))

    await waitFor(() => expect(apiRunPackageHealthCheck).toHaveBeenCalledTimes(2))
  })

  it('surfaces a failed run instead of an empty report', async () => {
    apiRunPackageHealthCheck.mockRejectedValue(new Error('No readable package.json at repo root'))
    renderIsolated(<PackageHealthPanel repoPath="/repo" />)

    expect(await screen.findByTestId('package-health-error')).toHaveTextContent(
      'No readable package.json at repo root'
    )
  })
})
