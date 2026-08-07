import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { CopyToClipboard } from './CopyToClipboard'

beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  })
})

describe('CopyToClipboard', () => {
  it('renders children content correctly', () => {
    render(
      <CopyToClipboard textToCopy="hello">
        <span>Click to copy</span>
      </CopyToClipboard>
    )
    expect(screen.getByText('Click to copy')).toBeInTheDocument()
  })

  it('copies text to clipboard on click and shows copied feedback for specified duration', async () => {
    vi.useFakeTimers()
    render(
      <CopyToClipboard textToCopy="hello world" copiedLabel="Copied!">
        <span>Copy me</span>
      </CopyToClipboard>
    )

    await act(async () => {
      fireEvent.click(screen.getByText('Copy me'))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('hello world')
    expect(screen.getByText('Copied!')).toBeInTheDocument()

    await act(async () => vi.advanceTimersByTime(2000))
    expect(screen.queryByText('Copied!')).not.toBeInTheDocument()
    vi.useRealTimers()
  })

  it('logs an error and does not set copied state if clipboard fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    })

    render(
      <CopyToClipboard textToCopy="hello world" copiedLabel="Copied!">
        <span>Copy me</span>
      </CopyToClipboard>
    )

    await act(async () => {
      fireEvent.click(screen.getByText('Copy me'))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(consoleError).toHaveBeenCalled()
    expect(screen.queryByText('Copied!')).not.toBeInTheDocument()
  })
})
