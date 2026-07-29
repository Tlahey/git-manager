import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/tauri', () => ({
  hasPackageManifest: vi.fn(),
  runPackageHealthCheck: vi.fn(),
  checkOutdatedPackages: vi.fn(),
  getPackageChangelog: vi.fn(),
  updatePackages: vi.fn(),
  scanPackageUsage: vi.fn(),
}))

import * as tauri from '../lib/tauri'
import * as api from './packageHealth.api'

const mocked = tauri as unknown as Record<string, ReturnType<typeof vi.fn>>
const PATH = '/repo/a'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('packageHealth.api', () => {
  it('apiHasPackageManifest delegates to hasPackageManifest', async () => {
    mocked.hasPackageManifest.mockResolvedValue(true)

    await expect(api.apiHasPackageManifest(PATH)).resolves.toBe(true)
    expect(mocked.hasPackageManifest).toHaveBeenCalledWith(PATH)
  })

  it('apiRunPackageHealthCheck delegates to runPackageHealthCheck', async () => {
    const report = {
      packageManager: 'pnpm',
      hasCatalog: false,
      packages: [],
      dependencyCount: 0,
      checks: [],
    }
    mocked.runPackageHealthCheck.mockResolvedValue(report)

    await expect(api.apiRunPackageHealthCheck(PATH)).resolves.toEqual(report)
    expect(mocked.runPackageHealthCheck).toHaveBeenCalledWith(PATH)
  })

  it('apiCheckOutdatedPackages passes the package manager through', async () => {
    mocked.checkOutdatedPackages.mockResolvedValue({
      packageManager: 'pnpm',
      status: 'ok',
      packages: [],
    })

    await api.apiCheckOutdatedPackages(PATH, 'pnpm')

    expect(mocked.checkOutdatedPackages).toHaveBeenCalledWith(PATH, 'pnpm')
  })

  it('apiGetPackageChangelog passes the version range and token through', async () => {
    mocked.getPackageChangelog.mockResolvedValue({
      repository: 'facebook/react',
      releasesUrl: null,
      releases: [],
      matched: false,
    })

    await api.apiGetPackageChangelog(PATH, 'react', '18.2.0', '19.0.0', 'ghp_x')

    expect(mocked.getPackageChangelog).toHaveBeenCalledWith(
      PATH,
      'react',
      '18.2.0',
      '19.0.0',
      'ghp_x'
    )
  })

  it('apiUpdatePackages forwards the names and the latest flag', async () => {
    mocked.updatePackages.mockResolvedValue({ updated: ['react'], output: '' })

    await api.apiUpdatePackages(PATH, 'pnpm', ['react'], true)

    expect(mocked.updatePackages).toHaveBeenCalledWith(PATH, 'pnpm', ['react'], true)
  })

  it('apiScanPackageUsage delegates to scanPackageUsage', async () => {
    mocked.scanPackageUsage.mockResolvedValue({ name: 'react', fileCount: 0, files: [] })

    await api.apiScanPackageUsage(PATH, 'react')

    expect(mocked.scanPackageUsage).toHaveBeenCalledWith(PATH, 'react')
  })
})
