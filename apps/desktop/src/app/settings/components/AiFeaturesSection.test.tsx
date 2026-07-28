import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AiFeaturesSection } from './AiFeaturesSection'
import { useSettingsStore } from '../../../stores/settings.store'

const INITIAL_SETTINGS = useSettingsStore.getState()

beforeEach(() => {
  useSettingsStore.setState(INITIAL_SETTINGS, true)
})

describe('AiFeaturesSection', () => {
  /**
   * The page's whole reason to exist: what the AI is asked to *do*, in one place. Before it, the
   * commit guidance had its own nav entry while the briefing toggles were buried at the bottom of
   * the connection form.
   */
  it('gathers the commit style and the briefing under one page', () => {
    render(<AiFeaturesSection />)

    expect(screen.getByTestId('ai-features-group-commit')).toBeInTheDocument()
    expect(screen.getByTestId('ai-features-group-briefing')).toBeInTheDocument()
    expect(screen.getByTestId('commit-instructions-input')).toBeInTheDocument()
    expect(screen.getByTestId('commit-pattern-input')).toBeInTheDocument()
    expect(screen.getByTestId('daily-summary-enabled-toggle')).toBeInTheDocument()
  })

  it('names each group so the page is scannable', () => {
    render(<AiFeaturesSection />)
    expect(screen.getByRole('heading', { name: 'Commit style' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Daily briefing' })).toBeInTheDocument()
  })

  it('opens without a rule above the first group', () => {
    render(<AiFeaturesSection />)
    expect(screen.getByTestId('ai-features-group-commit').className).not.toContain('border-t')
    expect(screen.getByTestId('ai-features-group-briefing').className).toContain('border-t')
  })

  it('persists the commit guidance it is edited with', async () => {
    const user = userEvent.setup()
    render(<AiFeaturesSection />)

    await user.type(screen.getByTestId('commit-instructions-input'), 'Imperative mood.')

    expect(useSettingsStore.getState().settings.git.commitInstructions).toBe('Imperative mood.')
  })

  /** Feature *enablement* and style only — the instruction and temperature stay in `@git-manager/ai`. */
  it('exposes no prompt tuning', () => {
    render(<AiFeaturesSection />)
    expect(screen.queryByText('Temperature')).not.toBeInTheDocument()
    expect(screen.queryByText(/system prompt/i)).not.toBeInTheDocument()
  })
})
