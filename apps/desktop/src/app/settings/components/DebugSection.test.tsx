import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@git-manager/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

import { DebugSection } from './DebugSection'
import { useDebugLogStore, type DebugLogEntry } from '../../../stores/debugLog.store'

function entry(overrides: Partial<DebugLogEntry> = {}): DebugLogEntry {
  return { id: 'e1', timestamp: Date.now(), command: 'get_log', args: { path: '/repo' }, durationMs: 5, status: 'ok', ...overrides }
}

beforeEach(() => {
  vi.clearAllMocks()
  useDebugLogStore.setState({ enabled: false, entries: [] })
})

describe('DebugSection', () => {
  it('reflects the enabled flag and toggles it through the store', async () => {
    const user = userEvent.setup()
    render(<DebugSection />)
    const toggle = screen.getByTestId('debug-enable-toggle') as HTMLInputElement
    expect(toggle.checked).toBe(false)
    await user.click(toggle)
    expect(useDebugLogStore.getState().enabled).toBe(true)
  })

  it('shows an empty-state hint and disables the action buttons with no entries', () => {
    render(<DebugSection />)
    expect(screen.getByTestId('debug-copy')).toBeDisabled()
    expect(screen.getByTestId('debug-clear')).toBeDisabled()
    expect(screen.getByText(/Active le journal/)).toBeInTheDocument()
  })

  it('renders one row per entry with its command', () => {
    useDebugLogStore.setState({ enabled: true, entries: [entry({ command: 'create_commit' }), entry({ id: 'e2', command: 'get_log' })] })
    render(<DebugSection />)
    const rows = screen.getAllByTestId('debug-entry')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveAttribute('data-command', 'create_commit')
  })

  it('copies the formatted log to the clipboard', async () => {
    useDebugLogStore.setState({ enabled: true, entries: [entry({ command: 'create_commit' })] })
    const user = userEvent.setup()
    // Define our stub *after* userEvent.setup(), which installs its own clipboard implementation.
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<DebugSection />)
    await user.click(screen.getByTestId('debug-copy'))
    expect(writeText).toHaveBeenCalledOnce()
    expect(writeText.mock.calls[0][0]).toContain('create_commit')
  })

  it('clears the buffer through the store', async () => {
    useDebugLogStore.setState({ enabled: true, entries: [entry()] })
    const user = userEvent.setup()
    render(<DebugSection />)
    await user.click(screen.getByTestId('debug-clear'))
    expect(useDebugLogStore.getState().entries).toEqual([])
  })
})
