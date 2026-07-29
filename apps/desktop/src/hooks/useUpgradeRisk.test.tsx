import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { OutdatedPackage, PackageChangelog, PackageUsage } from '@git-manager/git-types'

const apiScanPackageUsage = vi.fn()
const run = vi.fn()

vi.mock('../api/packageHealth.api', () => ({
  apiScanPackageUsage: (...args: unknown[]) => apiScanPackageUsage(...args),
}))
vi.mock('../api/ai.api', () => ({ upgradeRiskService: { run: (...a: unknown[]) => run(...a) } }))

import { useUpgradeRisk } from './useUpgradeRisk'

const ENTRY: OutdatedPackage = {
  name: 'react',
  current: '18.2.0',
  wanted: '18.3.1',
  latest: '19.0.0',
  majorUpdate: true,
  deprecated: false,
}

const USAGE: PackageUsage = {
  name: 'react',
  fileCount: 2,
  files: ['src/main.tsx', 'src/App.tsx'],
  symbols: ['useState'],
  subpaths: [],
  defaultImport: true,
  namespaceImport: false,
  samples: [],
}

const CHANGELOG: PackageChangelog = {
  repository: 'facebook/react',
  releasesUrl: null,
  matched: true,
  releases: [
    {
      tag: 'v19.0.0',
      name: 'React 19',
      publishedAt: '',
      body: 'ReactDOM.render is removed.',
      url: '',
    },
  ],
}

describe('useUpgradeRisk', () => {
  beforeEach(() => {
    apiScanPackageUsage.mockReset().mockResolvedValue(USAGE)
    run.mockReset().mockResolvedValue({ risk: 'low', summary: 'ok', changes: [] })
  })

  it('starts idle', () => {
    const { result } = renderHook(() => useUpgradeRisk('/repo'))

    expect(result.current.result).toBeNull()
    expect(result.current.running).toBe(false)
    expect(result.current.phase).toBe('idle')
    expect(apiScanPackageUsage).not.toHaveBeenCalled()
  })

  /**
   * The call is unbounded, so the phase is the only thing distinguishing "still
   * working" from "hung". It has to move off `scanning` once the scan is done.
   */
  it('reports the scan phase, then the reading phase, then goes idle', async () => {
    let releaseModel: (v: unknown) => void = () => {}
    run.mockImplementation(() => new Promise((resolve) => (releaseModel = resolve)))

    const { result } = renderHook(() => useUpgradeRisk('/repo'))
    let pending: Promise<void>
    await act(async () => {
      pending = result.current.assess(ENTRY, CHANGELOG)
    })

    expect(result.current.phase).toBe('reading')
    expect(result.current.running).toBe(true)
    // The scan's own finding is shown while the model works, so the wait has content.
    expect(result.current.fileCount).toBe(2)

    await act(async () => {
      releaseModel({ risk: 'low', summary: '', changes: [] })
      await pending
    })

    expect(result.current.phase).toBe('idle')
    expect(result.current.running).toBe(false)
  })

  /** Usage is what makes the answer specific rather than a paraphrase of the notes. */
  it('sends the repo usage and the notes together', async () => {
    const { result } = renderHook(() => useUpgradeRisk('/repo'))

    await act(() => result.current.assess(ENTRY, CHANGELOG))

    expect(apiScanPackageUsage).toHaveBeenCalledWith('/repo', 'react')
    const input = run.mock.calls[0][1]
    expect(input.package).toBe('react')
    expect(input.from).toBe('18.2.0')
    expect(input.to).toBe('19.0.0')
    expect(input.usage).toEqual(USAGE)
    expect(input.changelog).toContain('ReactDOM.render is removed.')
    expect(input.changelogMatched).toBe(true)
  })

  /** Unmatched notes must reach the model flagged, so it can discount them. */
  it('passes the unmatched flag through', async () => {
    const { result } = renderHook(() => useUpgradeRisk('/repo'))

    await act(() => result.current.assess(ENTRY, { ...CHANGELOG, matched: false }))

    expect(run.mock.calls[0][1].changelogMatched).toBe(false)
  })

  it('treats a missing changelog as no notes rather than failing', async () => {
    const { result } = renderHook(() => useUpgradeRisk('/repo'))

    await act(() => result.current.assess(ENTRY, undefined))

    expect(run.mock.calls[0][1].changelog).toBe('')
    expect(run.mock.calls[0][1].changelogMatched).toBe(false)
  })

  /** A path the model invented would render as a file to go and check that isn't there. */
  it('drops locations that are not in the scanned file list', async () => {
    run.mockResolvedValue({
      risk: 'high',
      summary: '',
      changes: [
        {
          change: 'x',
          affectsUs: true,
          where: ['src/main.tsx', 'src/hallucinated.tsx'],
          note: '',
        },
      ],
    })
    const { result } = renderHook(() => useUpgradeRisk('/repo'))

    await act(() => result.current.assess(ENTRY, CHANGELOG))

    expect(result.current.result?.changes[0].where).toEqual(['src/main.tsx'])
  })

  it('reports a failed call without a stale verdict', async () => {
    run.mockRejectedValue(new Error('provider unreachable'))
    const { result } = renderHook(() => useUpgradeRisk('/repo'))

    await act(() => result.current.assess(ENTRY, CHANGELOG))

    await waitFor(() => expect(result.current.error).toContain('provider unreachable'))
    expect(result.current.result).toBeNull()
    expect(result.current.running).toBe(false)
  })

  it('resets back to idle', async () => {
    const { result } = renderHook(() => useUpgradeRisk('/repo'))
    await act(() => result.current.assess(ENTRY, CHANGELOG))
    expect(result.current.result).not.toBeNull()

    act(() => result.current.reset())

    expect(result.current.result).toBeNull()
    expect(result.current.error).toBeNull()
  })
})
