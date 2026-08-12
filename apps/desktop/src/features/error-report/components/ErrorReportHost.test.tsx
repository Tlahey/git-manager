import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { act } from 'react'

vi.mock('./ErrorReportDialog', () => ({
  ErrorReportDialog: ({ draft }: { draft: { message: string } }) => (
    <div data-testid="fake-dialog">{draft.message}</div>
  ),
}))

import { useErrorReportStore } from '../stores/errorReport.store'
import { ErrorReportHost } from './ErrorReportHost'

beforeEach(() => {
  useErrorReportStore.setState({ draft: null, reported: {} })
})

describe('ErrorReportHost', () => {
  it('renders nothing until something opens a report', () => {
    render(<ErrorReportHost />)
    expect(screen.queryByTestId('fake-dialog')).not.toBeInTheDocument()
  })

  it('opens the dialog for whichever draft the store holds', () => {
    render(<ErrorReportHost />)

    act(() => {
      useErrorReportStore.getState().openReport({
        kind: 'operation',
        message: 'boom',
        timestamp: 1,
        context: [],
      })
    })

    expect(screen.getByTestId('fake-dialog')).toHaveTextContent('boom')
  })

  it('remounts the dialog per failure, so one report’s description cannot leak into the next', () => {
    render(<ErrorReportHost />)

    act(() => {
      useErrorReportStore
        .getState()
        .openReport({ kind: 'operation', message: 'first', timestamp: 1, context: [] })
    })
    const first = screen.getByTestId('fake-dialog')

    act(() => {
      useErrorReportStore
        .getState()
        .openReport({ kind: 'operation', message: 'second', timestamp: 2, context: [] })
    })

    expect(screen.getByTestId('fake-dialog')).not.toBe(first)
    expect(screen.getByTestId('fake-dialog')).toHaveTextContent('second')
  })
})
