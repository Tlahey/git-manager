import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ReportVerdictBanner } from './ReportVerdictBanner'

describe('ReportVerdictBanner', () => {
  it('states the verdict and the reason behind it, in real copy', () => {
    render(<ReportVerdictBanner verdict="expected" reasonKey="report.reason.hookFailed" />)

    expect(screen.getByText('This is not a bug.')).toBeInTheDocument()
    expect(screen.getByText(/hooks stopped the operation/)).toBeInTheDocument()
  })

  it('renders each verdict with its own testid, so the dialog’s state is assertable', () => {
    const { rerender } = render(
      <ReportVerdictBanner verdict="bug" reasonKey="report.reason.crash" />
    )
    expect(screen.getByTestId('report-verdict-bug')).toBeInTheDocument()

    rerender(<ReportVerdictBanner verdict="unclear" reasonKey="report.reason.gitRefusal" />)
    expect(screen.getByTestId('report-verdict-unclear')).toBeInTheDocument()
  })
})
