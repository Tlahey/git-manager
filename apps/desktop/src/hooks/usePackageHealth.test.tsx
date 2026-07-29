import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { ReactNode } from 'react'

const apiHasPackageManifest = vi.fn()
const apiRunPackageHealthCheck = vi.fn()
const apiCheckOutdatedPackages = vi.fn()
const apiGetPackageChangelog = vi.fn()
const apiUpdatePackages = vi.fn()

vi.mock('../api/packageHealth.api', () => ({
  apiHasPackageManifest: (...args: unknown[]) => apiHasPackageManifest(...args),
  apiRunPackageHealthCheck: (...args: unknown[]) => apiRunPackageHealthCheck(...args),
  apiCheckOutdatedPackages: (...args: unknown[]) => apiCheckOutdatedPackages(...args),
  apiGetPackageChangelog: (...args: unknown[]) => apiGetPackageChangelog(...args),
  apiUpdatePackages: (...args: unknown[]) => apiUpdatePackages(...args),
}))

import {
  useHasPackageManifest,
  useOutdatedPackages,
  usePackageChangelog,
  usePackageHealth,
  useUpdatePackages,
} from './usePackageHealth'

const wrapper = ({ children }: { children: ReactNode }) => (
  <SWRConfig value={{ provider: () => new Map() }}>{children}</SWRConfig>
)

beforeEach(() => {
  apiHasPackageManifest.mockReset().mockResolvedValue(true)
  apiRunPackageHealthCheck.mockReset().mockResolvedValue({ packageManager: 'pnpm' })
  apiCheckOutdatedPackages.mockReset().mockResolvedValue({ status: 'ok', packages: [] })
  apiGetPackageChangelog.mockReset().mockResolvedValue({ repository: null, releases: [] })
  apiUpdatePackages.mockReset().mockResolvedValue({ updated: ['react'], output: '' })
})

describe('usePackageHealth hooks', () => {
  it('does not query without a repo', () => {
    renderHook(() => usePackageHealth(null), { wrapper })
    renderHook(() => useHasPackageManifest(null), { wrapper })

    expect(apiRunPackageHealthCheck).not.toHaveBeenCalled()
    expect(apiHasPackageManifest).not.toHaveBeenCalled()
  })

  it('loads the report for a repo', async () => {
    const { result } = renderHook(() => usePackageHealth('/repo'), { wrapper })

    await waitFor(() => expect(result.current.data).toEqual({ packageManager: 'pnpm' }))
    expect(apiRunPackageHealthCheck).toHaveBeenCalledWith('/repo')
  })

  it('scans for updates as soon as it is mounted', async () => {
    const { result } = renderHook(() => useOutdatedPackages('/repo', 'pnpm'), { wrapper })

    await waitFor(() => expect(result.current.data).toEqual({ status: 'ok', packages: [] }))
    expect(apiCheckOutdatedPackages).toHaveBeenCalledWith('/repo', 'pnpm')
  })

  it('does not scan without a package manager', () => {
    renderHook(() => useOutdatedPackages('/repo', undefined), { wrapper })
    expect(apiCheckOutdatedPackages).not.toHaveBeenCalled()
  })

  /**
   * Shelling out to pnpm is slow, so a second visit to the page must reuse the
   * answer rather than run it again — that is what "if it hasn't already" means.
   */
  it('reuses the cached scan when the page is reopened', async () => {
    const cache = new Map()
    const sharedWrapper = ({ children }: { children: ReactNode }) => (
      <SWRConfig value={{ provider: () => cache }}>{children}</SWRConfig>
    )

    const first = renderHook(() => useOutdatedPackages('/repo', 'pnpm'), {
      wrapper: sharedWrapper,
    })
    await waitFor(() => expect(first.result.current.data).toBeDefined())
    first.unmount()

    renderHook(() => useOutdatedPackages('/repo', 'pnpm'), { wrapper: sharedWrapper })

    await waitFor(() => expect(apiCheckOutdatedPackages).toHaveBeenCalledTimes(1))
  })

  it('reports a failed scan through `error`', async () => {
    apiCheckOutdatedPackages.mockRejectedValue(new Error('pnpm exploded'))
    const { result } = renderHook(() => useOutdatedPackages('/repo', 'pnpm'), { wrapper })

    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error))
  })

  it('fetches a changelog only once a package is named', async () => {
    renderHook(() => usePackageChangelog('/repo', null, '1.0.0', '2.0.0'), { wrapper })
    expect(apiGetPackageChangelog).not.toHaveBeenCalled()

    renderHook(() => usePackageChangelog('/repo', 'react', '18.2.0', '19.0.0', 'ghp_x'), {
      wrapper,
    })

    await waitFor(() =>
      expect(apiGetPackageChangelog).toHaveBeenCalledWith(
        '/repo',
        'react',
        '18.2.0',
        '19.0.0',
        'ghp_x'
      )
    )
  })

  /** This one mutates the repo, so it must never fire without an explicit trigger. */
  it('never updates on mount', async () => {
    const { result } = renderHook(() => useUpdatePackages('/repo', 'pnpm'), { wrapper })
    expect(apiUpdatePackages).not.toHaveBeenCalled()

    await result.current.trigger({ names: ['react'], toLatest: true })

    await waitFor(() =>
      expect(apiUpdatePackages).toHaveBeenCalledWith('/repo', 'pnpm', ['react'], true)
    )
  })
})
