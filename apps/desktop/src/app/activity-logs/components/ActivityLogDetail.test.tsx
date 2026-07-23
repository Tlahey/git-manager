import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ActivityLogEntry } from '../../../stores/activityLog.store'
import { ActivityLogDetail } from './ActivityLogDetail'

const writeText = vi.fn()

function errorEntry(): ActivityLogEntry {
  return {
    id: '1',
    timestamp: Date.now(),
    command: 'bisect_start',
    args: { badRev: 'd063677', goodRev: 'cb06819' },
    durationMs: 12,
    status: 'error',
    error: 'Your local changes to the following files would be overwritten by checkout:\n\tf.txt',
    repoPath: '/repo',
  }
}

describe('ActivityLogDetail', () => {
  beforeEach(() => {
    writeText.mockReset().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  })

  it('renders the error block with a copy button', () => {
    render(
      <ActivityLogDetail entry={errorEntry()} block={undefined} onTrace={vi.fn()} onClose={vi.fn()} />
    )
    expect(screen.getByText('Error')).toBeInTheDocument()
    expect(screen.getByText(/would be overwritten by checkout/)).toBeInTheDocument()
    expect(screen.getByTestId('activity-detail-copy-error')).toBeInTheDocument()
  })

  it('copies the full error text to the clipboard', async () => {
    const entry = errorEntry()
    render(<ActivityLogDetail entry={entry} block={undefined} onTrace={vi.fn()} onClose={vi.fn()} />)

    fireEvent.click(screen.getByTestId('activity-detail-copy-error'))
    expect(writeText).toHaveBeenCalledWith(entry.error)
    // The button flips to the "Copied" confirmation.
    await waitFor(() => expect(screen.getByText('Copied')).toBeInTheDocument())
  })

  it('shows no error block for a successful entry', () => {
    const ok: ActivityLogEntry = { ...errorEntry(), status: 'ok', error: undefined }
    render(<ActivityLogDetail entry={ok} block={undefined} onTrace={vi.fn()} onClose={vi.fn()} />)
    expect(screen.queryByTestId('activity-detail-copy-error')).not.toBeInTheDocument()
  })
})
