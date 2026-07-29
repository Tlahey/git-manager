import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SWRConfig } from 'swr'
import type { ReactElement } from 'react'
import type { UpgradeRiskResult } from '@git-manager/ai'
import type { OutdatedPackage } from '@git-manager/git-types'

let aiEnabled = true
const assess = vi.fn()
interface RiskState {
  result: UpgradeRiskResult | null
  running: boolean
  phase: 'idle' | 'scanning' | 'reading'
  elapsedSeconds: number
  fileCount: number | null
  error: string | null
}

const idleState = (overrides: Partial<RiskState> = {}): RiskState => ({
  result: null,
  running: false,
  phase: 'idle',
  elapsedSeconds: 0,
  fileCount: null,
  error: null,
  ...overrides,
})

let riskState: RiskState = idleState()

vi.mock('../../hooks/useAiEnabled', () => ({ useAiEnabled: () => aiEnabled }))
vi.mock('../../hooks/useUpgradeRisk', () => ({
  useUpgradeRisk: () => ({ ...riskState, assess, reset: vi.fn() }),
}))
vi.mock('../../api/packageHealth.api', () => ({
  apiGetPackageChangelog: vi.fn().mockResolvedValue({
    repository: 'facebook/react',
    releasesUrl: null,
    matched: true,
    releases: [],
  }),
  apiCheckOutdatedPackages: vi.fn(),
  apiRunPackageHealthCheck: vi.fn(),
  apiHasPackageManifest: vi.fn(),
  apiUpdatePackages: vi.fn(),
  apiScanPackageUsage: vi.fn(),
}))

import { UpgradeRiskReport } from './UpgradeRiskReport'

const ENTRY: OutdatedPackage = {
  name: 'react',
  current: '18.2.0',
  wanted: '18.3.1',
  latest: '19.0.0',
  majorUpdate: true,
  deprecated: false,
}

function renderIsolated(ui: ReactElement) {
  return render(<SWRConfig value={{ provider: () => new Map() }}>{ui}</SWRConfig>)
}

const renderReport = () => renderIsolated(<UpgradeRiskReport entry={ENTRY} repoPath="/repo" />)

function result(overrides: Partial<UpgradeRiskResult> = {}): UpgradeRiskResult {
  return { risk: 'low', summary: '', changes: [], ...overrides }
}

describe('UpgradeRiskReport', () => {
  beforeEach(() => {
    aiEnabled = true
    assess.mockReset()
    riskState = idleState()
  })

  /** A model call costs time and tokens; nothing starts without the user asking. */
  it('waits for the user to ask', () => {
    renderReport()

    expect(assess).not.toHaveBeenCalled()
    expect(screen.getByTestId('upgrade-risk-run')).toHaveTextContent('Assess with AI')
    expect(screen.queryByTestId('upgrade-risk-result')).not.toBeInTheDocument()
  })

  it('runs the assessment on click', async () => {
    renderReport()

    await userEvent.click(screen.getByTestId('upgrade-risk-run'))

    expect(assess).toHaveBeenCalledTimes(1)
  })

  it('points at the files an affecting change lands in', () => {
    riskState = idleState({
      result: result({
        risk: 'high',
        summary: 'Migrate to createRoot.',
        changes: [
          {
            change: 'ReactDOM.render removed',
            affectsUs: true,
            where: ['src/main.tsx'],
            note: 'You call it here.',
          },
        ],
      }),
    })
    renderReport()

    expect(screen.getByText('High')).toBeInTheDocument()
    expect(screen.getByText('Migrate to createRoot.')).toBeInTheDocument()
    expect(screen.getByText('Affects your code')).toBeInTheDocument()
    expect(screen.getByTestId('upgrade-risk-where')).toHaveTextContent('src/main.tsx')
  })

  /** Saying a listed change does *not* apply here is most of the value. */
  it('marks a change that does not touch this repo', () => {
    riskState = idleState({
      result: result({
        changes: [
          { change: 'Legacy context removed', affectsUs: false, where: [], note: 'Not used.' },
        ],
      }),
    })
    renderReport()

    expect(screen.getByText('Not used here')).toBeInTheDocument()
    expect(screen.queryByTestId('upgrade-risk-where')).not.toBeInTheDocument()
  })

  /** "unknown" must never read as reassurance — it means nothing could be read. */
  it('explains an unknown verdict rather than showing it as a pass', () => {
    riskState = idleState({ result: result({ risk: 'unknown' }) })
    renderReport()

    expect(screen.getByText("Can't tell")).toBeInTheDocument()
    expect(screen.getByTestId('upgrade-risk-unknown')).toHaveTextContent('this is not a verdict')
    expect(screen.queryByTestId('upgrade-risk-no-changes')).not.toBeInTheDocument()
  })

  it('reports a clean read as no breaking changes', () => {
    riskState = idleState({ result: result({ risk: 'low' }) })
    renderReport()

    expect(screen.getByTestId('upgrade-risk-no-changes')).toHaveTextContent(
      'No breaking changes were found in these notes.'
    )
  })

  /** The disclaimer is the guardrail, not decoration: it ships with every verdict. */
  it('always states what the assessment cannot see', () => {
    riskState = idleState({ result: result({ risk: 'low' }) })
    renderReport()

    const disclaimer = screen.getByTestId('upgrade-risk-disclaimer')
    expect(disclaimer).toHaveTextContent('Advisory only')
    expect(disclaimer).toHaveTextContent('read the changelog before a major')
  })

  /**
   * The call has no time limit, so a silent spinner is indistinguishable from a
   * hang — which is what the timeout used to hide.
   */
  it('names the running step, the elapsed time and what the scan found', () => {
    riskState = idleState({ running: true, phase: 'reading', elapsedSeconds: 42, fileCount: 7 })
    renderReport()

    expect(screen.getByTestId('upgrade-risk-run')).toBeDisabled()
    expect(screen.getByTestId('upgrade-risk-phase')).toHaveTextContent(
      'The model is reading the notes against your code'
    )
    expect(screen.getByTestId('upgrade-risk-elapsed')).toHaveTextContent('42s elapsed')
    expect(screen.getByTestId('upgrade-risk-scanned')).toHaveTextContent(
      'Found 7 files importing it'
    )
    expect(screen.getByTestId('upgrade-risk-progress')).toHaveTextContent('no time limit')
  })

  it('names the scan step before the model has anything to read', () => {
    riskState = idleState({ running: true, phase: 'scanning', elapsedSeconds: 1 })
    renderReport()

    expect(screen.getByTestId('upgrade-risk-phase')).toHaveTextContent('Scanning your imports')
    // Nothing to report yet, so no misleading count.
    expect(screen.queryByTestId('upgrade-risk-scanned')).not.toBeInTheDocument()
  })

  it('shows no progress block when idle', () => {
    renderReport()
    expect(screen.queryByTestId('upgrade-risk-progress')).not.toBeInTheDocument()
  })

  it('surfaces a failed call', () => {
    riskState = idleState({ error: 'provider unreachable' })
    renderReport()

    expect(screen.getByTestId('upgrade-risk-error')).toHaveTextContent('provider unreachable')
  })

  it('points at Settings when no AI provider is configured', () => {
    aiEnabled = false
    renderReport()

    expect(screen.getByTestId('upgrade-risk-disabled')).toHaveTextContent(
      'Configure an AI provider'
    )
    expect(screen.queryByTestId('upgrade-risk-run')).not.toBeInTheDocument()
  })
})
