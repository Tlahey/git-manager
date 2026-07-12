import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OperationProgressBar } from './OperationProgressBar'
import { useOperationProgressStore } from '../../stores/operationProgress.store'

beforeEach(() => {
  useOperationProgressStore.setState({ running: {} })
})

describe('OperationProgressBar', () => {
  it('renders the rail without a shimmer when nothing is running', () => {
    render(<OperationProgressBar />)
    const bar = screen.getByTestId('operation-progress-bar')
    expect(bar).toBeInTheDocument()
    expect(bar.querySelector('.animate-shimmer')).toBeNull()
  })

  it('shows the shimmer when an operation is running', () => {
    useOperationProgressStore.setState({ running: { '/repo': 'rebase' } })
    render(<OperationProgressBar />)
    expect(
      screen.getByTestId('operation-progress-bar').querySelector('.animate-shimmer')
    ).not.toBeNull()
  })

  it('hides the shimmer again once the operation clears', () => {
    useOperationProgressStore.setState({ running: { '/repo': 'rebase' } })
    const { rerender } = render(<OperationProgressBar />)
    useOperationProgressStore.setState({ running: {} })
    rerender(<OperationProgressBar />)
    expect(
      screen.getByTestId('operation-progress-bar').querySelector('.animate-shimmer')
    ).toBeNull()
  })
})
