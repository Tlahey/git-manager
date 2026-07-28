import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../../../api/ai.api', () => ({
  aiStatusService: { check: vi.fn(), probe: vi.fn() },
}))

import { aiStatusService } from '../../../api/ai.api'
import { AiSection } from './AiSection'
import { useSettingsStore } from '../../../stores/settings.store'
import { useAiStatusStore } from '../../../stores/aiStatus.store'

const mockedCheck = aiStatusService.check as unknown as ReturnType<typeof vi.fn>
const INITIAL_SETTINGS = useSettingsStore.getState()
const INITIAL_STATUS = useAiStatusStore.getState()

beforeEach(() => {
  vi.clearAllMocks()
  mockedCheck.mockResolvedValue({ connected: false, models: [] })
  useSettingsStore.setState(INITIAL_SETTINGS, true)
  useAiStatusStore.setState(INITIAL_STATUS, true)
})

describe('AiSection — master switch', () => {
  it('is on by default and shows the provider configuration', async () => {
    render(<AiSection />)
    expect(screen.getByTestId('ai-enabled-toggle')).toBeChecked()
    expect(await screen.findByTestId('ai-provider-select')).toBeInTheDocument()
    expect(screen.getByText('Server URL')).toBeInTheDocument()
  })

  it('hides every AI setting — provider and features alike — once turned off', async () => {
    const user = userEvent.setup()
    render(<AiSection />)
    await user.click(screen.getByTestId('ai-enabled-toggle'))

    expect(useSettingsStore.getState().settings.ai.enabled).toBe(false)
    expect(screen.queryByTestId('ai-provider-select')).not.toBeInTheDocument()
    expect(screen.queryByText('Server URL')).not.toBeInTheDocument()
    expect(screen.queryByTestId('daily-summary-enabled-toggle')).not.toBeInTheDocument()
    expect(screen.getByTestId('ai-disabled-hint')).toHaveTextContent(
      'Turn AI features on to configure a provider.'
    )
  })

  it('brings the configuration back when turned on again', async () => {
    const user = userEvent.setup()
    render(<AiSection />)
    const toggle = screen.getByTestId('ai-enabled-toggle')
    await user.click(toggle)
    await user.click(toggle)

    expect(useSettingsStore.getState().settings.ai.enabled).toBe(true)
    expect(await screen.findByTestId('ai-provider-select')).toBeInTheDocument()
  })
})

describe('AiSection — feature toggles', () => {
  /**
   * The page answers "which model, where, within what limits" and nothing else. The briefing
   * toggles used to sit at the bottom of the connection form, which left neither page with a
   * subject; they now have their own nav entry (see `AiFeaturesSection`).
   */
  it('holds no feature toggles — those live on the AI features page', () => {
    render(<AiSection />)
    expect(screen.queryByTestId('daily-summary-enabled-toggle')).not.toBeInTheDocument()
    expect(screen.queryByTestId('daily-summary-auto-toggle')).not.toBeInTheDocument()
  })

  it('does not expose feature tuning (temperature / system prompt / auto-scope)', () => {
    render(<AiSection />)
    // Instruction/temperature/scope are owned per-feature inside @git-manager/ai and must never
    // surface in Settings. (The daily-summary enable/auto toggles are feature *enablement*, not
    // prompt tuning, so they are allowed.)
    expect(screen.queryByText('Temperature')).not.toBeInTheDocument()
    expect(screen.queryByText(/system prompt/i)).not.toBeInTheDocument()
  })
})
