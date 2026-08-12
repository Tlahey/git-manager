import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ReportPreview } from './ReportPreview'

const BODY = '<!-- gm-fp:a1b2c3d4 -->\n### Error\ncode:    UNKNOWN'

describe('ReportPreview', () => {
  it('shows the body verbatim — this is the reporter’s last look before it is public', () => {
    render(<ReportPreview body={BODY} />)
    // Read `textContent` rather than `toHaveTextContent`, which collapses whitespace: the point of
    // this preview is that it is the exact string, alignment included.
    expect(screen.getByTestId('error-report-preview').textContent).toBe(BODY)
  })

  it('copies that same body, so someone with no account can file it by hand', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    // `defineProperty`, not assignment: `navigator.clipboard` is getter-only in jsdom. And
    // `fireEvent` rather than `userEvent`, whose `setup()` installs a clipboard stub of its own
    // over this one — the same pattern `CopyToClipboard.test.tsx` uses.
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

    render(<ReportPreview body={BODY} />)
    fireEvent.click(screen.getByTestId('error-report-copy'))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(BODY))
  })

  it('says what was stripped, so nobody reads the gaps as missing information', () => {
    render(<ReportPreview body={BODY} />)
    expect(screen.getByText(/already removed/)).toBeInTheDocument()
  })
})
