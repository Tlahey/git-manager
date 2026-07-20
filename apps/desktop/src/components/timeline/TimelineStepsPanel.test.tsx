import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TimelineStepsPanel } from './TimelineStepsPanel'
import type { TimelineStep } from '../../lib/timelineModel'

const steps: TimelineStep[] = [
  { index: 0, label: null, type: 'base', headOid: 'oid0', timestamp: null },
  { index: 1, label: { key: 'undo.commit' }, type: 'commit', headOid: 'oid1', timestamp: 1000 },
  { index: 2, label: { key: 'undo.reset' }, type: 'reset', headOid: 'oid0', timestamp: 2000 },
]

function setup(overrides: Partial<React.ComponentProps<typeof TimelineStepsPanel>> = {}) {
  const props = {
    steps,
    previewIndex: 1,
    currentIndex: 2,
    onSelect: vi.fn(),
    renderLabel: (s: TimelineStep) => (s.label ? s.label.key : 'Initial'),
    title: 'History',
    currentTag: 'actual',
    ...overrides,
  }
  render(<TimelineStepsPanel {...props} />)
  return props
}

describe('TimelineStepsPanel', () => {
  it('renders a row per step with resolved labels', () => {
    setup()
    expect(screen.getByText('Initial')).toBeInTheDocument()
    expect(screen.getByText('undo.commit')).toBeInTheDocument()
    expect(screen.getByText('undo.reset')).toBeInTheDocument()
  })

  it('marks the previewed step with aria-current', () => {
    setup({ previewIndex: 1 })
    expect(screen.getByTestId('timeline-step-1')).toHaveAttribute('aria-current', 'true')
    expect(screen.getByTestId('timeline-step-0')).toHaveAttribute('aria-current', 'false')
  })

  it('tags the current pointer step and only that one', () => {
    setup({ currentIndex: 2 })
    const tags = screen.getAllByText('actual')
    expect(tags).toHaveLength(1)
    expect(screen.getByTestId('timeline-step-2')).toContainElement(tags[0])
  })

  it('calls onSelect with the clicked step index', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    setup({ onSelect })
    await user.click(screen.getByTestId('timeline-step-0'))
    expect(onSelect).toHaveBeenCalledWith(0)
  })

  it('renders the relative timestamp under the label when provided', () => {
    setup({ renderTimestamp: (s) => (s.timestamp != null ? `${s.timestamp}ms` : null) })
    expect(screen.getByText('1000ms')).toBeInTheDocument()
    expect(screen.getByText('2000ms')).toBeInTheDocument()
    // Base step has no timestamp → no caption
    expect(screen.queryByText('nullms')).not.toBeInTheDocument()
  })

  it('fills the rail nodes up to and including the previewed step', () => {
    setup({ previewIndex: 1 })
    expect(screen.getByTestId('timeline-node-0')).toHaveAttribute('data-state', 'reached')
    expect(screen.getByTestId('timeline-node-1')).toHaveAttribute('data-state', 'active')
    expect(screen.getByTestId('timeline-node-2')).toHaveAttribute('data-state', 'unreached')
  })

  it('sets the exact date as the row title tooltip', () => {
    setup({ renderExactDate: (s) => (s.timestamp != null ? `exact-${s.timestamp}` : null) })
    expect(screen.getByTestId('timeline-step-1')).toHaveAttribute('title', 'exact-1000')
    expect(screen.getByTestId('timeline-step-0')).not.toHaveAttribute('title')
  })
})
