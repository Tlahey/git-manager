import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SectionHeader } from './SectionHeader'

describe('SectionHeader — rendering', () => {
  it('shows the title and icon', () => {
    render(
      <SectionHeader
        title="Branches"
        icon={<span data-testid="icon" />}
        isOpen={false}
        onToggle={vi.fn()}
      />
    )
    expect(screen.getByText('Branches')).toBeInTheDocument()
    expect(screen.getByTestId('icon')).toBeInTheDocument()
  })

  it('shows a chevron-right when closed and chevron-down when open', () => {
    const { container, rerender } = render(
      <SectionHeader title="Branches" icon={null} isOpen={false} onToggle={vi.fn()} />
    )
    expect(container.querySelector('.lucide-chevron-right')).toBeTruthy()
    expect(container.querySelector('.lucide-chevron-down')).toBeFalsy()

    rerender(<SectionHeader title="Branches" icon={null} isOpen onToggle={vi.fn()} />)
    expect(container.querySelector('.lucide-chevron-down')).toBeTruthy()
  })

  it('shows the count only when provided', () => {
    const { rerender } = render(
      <SectionHeader title="Branches" icon={null} isOpen={false} onToggle={vi.fn()} />
    )
    expect(screen.queryByText('0')).not.toBeInTheDocument()

    rerender(
      <SectionHeader title="Branches" icon={null} isOpen={false} onToggle={vi.fn()} count={5} />
    )
    expect(screen.getByText('5')).toBeInTheDocument()

    rerender(
      <SectionHeader title="Branches" icon={null} isOpen={false} onToggle={vi.fn()} count={0} />
    )
    expect(screen.getByText('0')).toBeInTheDocument()
  })

  it('shows a filter icon next to the count only when isFiltered', () => {
    const { container, rerender } = render(
      <SectionHeader title="Branches" icon={null} isOpen={false} onToggle={vi.fn()} count={1} />
    )
    expect(container.querySelector('.lucide-filter')).toBeFalsy()

    rerender(
      <SectionHeader
        title="Branches"
        icon={null}
        isOpen={false}
        onToggle={vi.fn()}
        count={1}
        isFiltered
      />
    )
    expect(container.querySelector('.lucide-filter')).toBeTruthy()
  })

  it('shows the action slot only when provided', () => {
    const { rerender } = render(
      <SectionHeader title="Branches" icon={null} isOpen={false} onToggle={vi.fn()} />
    )
    expect(screen.queryByTestId('action')).not.toBeInTheDocument()

    rerender(
      <SectionHeader
        title="Branches"
        icon={null}
        isOpen={false}
        onToggle={vi.fn()}
        action={<button data-testid="action">+</button>}
      />
    )
    expect(screen.getByTestId('action')).toBeInTheDocument()
  })
})

describe('SectionHeader — interaction', () => {
  it('calls onToggle when the header button is clicked', async () => {
    const onToggle = vi.fn()
    const user = userEvent.setup()
    render(<SectionHeader title="Branches" icon={null} isOpen={false} onToggle={onToggle} />)
    await user.click(screen.getByText('Branches'))
    expect(onToggle).toHaveBeenCalledOnce()
  })
})
