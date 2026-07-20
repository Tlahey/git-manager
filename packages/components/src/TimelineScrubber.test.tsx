import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TimelineScrubber, type TimelineScrubberProps } from './TimelineScrubber'

function setup(overrides: Partial<TimelineScrubberProps> = {}) {
  const props: TimelineScrubberProps = {
    stepCount: 4,
    previewIndex: 2,
    onPreviewChange: vi.fn(),
    onValidate: vi.fn(),
    onCancel: vi.fn(),
    validateLabel: 'Validate',
    cancelLabel: 'Cancel',
    prevLabel: 'Previous step',
    nextLabel: 'Next step',
    trackLabel: 'Timeline',
    testId: 'scrubber',
    ...overrides,
  }
  render(<TimelineScrubber {...props} />)
  return props
}

describe('TimelineScrubber', () => {
  it('moves one step back/forward via the round arrow buttons', async () => {
    const user = userEvent.setup()
    const onPreviewChange = vi.fn()
    setup({ previewIndex: 2, onPreviewChange })

    await user.click(screen.getByRole('button', { name: 'Previous step' }))
    expect(onPreviewChange).toHaveBeenLastCalledWith(1)

    await user.click(screen.getByRole('button', { name: 'Next step' }))
    expect(onPreviewChange).toHaveBeenLastCalledWith(3)
  })

  it('disables previous at the start and enables next', () => {
    setup({ previewIndex: 0 })
    expect(screen.getByRole('button', { name: 'Previous step' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next step' })).toBeEnabled()
  })

  it('disables next at the end and enables previous', () => {
    setup({ previewIndex: 3, stepCount: 4 })
    expect(screen.getByRole('button', { name: 'Next step' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Previous step' })).toBeEnabled()
  })

  it('navigates with the arrow keys on the track', async () => {
    const user = userEvent.setup()
    const onPreviewChange = vi.fn()
    setup({ previewIndex: 2, onPreviewChange })

    const track = screen.getByRole('slider')
    track.focus()
    await user.keyboard('{ArrowLeft}')
    expect(onPreviewChange).toHaveBeenLastCalledWith(1)
    await user.keyboard('{ArrowRight}')
    expect(onPreviewChange).toHaveBeenLastCalledWith(3)
  })

  it('exposes slider ARIA bounds and current position', () => {
    setup({ previewIndex: 1, stepCount: 4 })
    const track = screen.getByRole('slider')
    expect(track).toHaveAttribute('aria-valuemin', '0')
    expect(track).toHaveAttribute('aria-valuemax', '3')
    expect(track).toHaveAttribute('aria-valuenow', '1')
  })

  it('calls validate and cancel handlers', async () => {
    const user = userEvent.setup()
    const onValidate = vi.fn()
    const onCancel = vi.fn()
    setup({ onValidate, onCancel })

    await user.click(screen.getByRole('button', { name: 'Validate' }))
    expect(onValidate).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('disables the validate button when validateDisabled is set', () => {
    setup({ validateDisabled: true })
    expect(screen.getByRole('button', { name: 'Validate' })).toBeDisabled()
  })

  it('renders the hint text', () => {
    setup({ hint: 'Validate = undo ×2' })
    expect(screen.getByText('Validate = undo ×2')).toBeInTheDocument()
  })
})
