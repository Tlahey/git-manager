import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MultiSelectDropdown } from './MultiSelectDropdown'

function renderDropdown(props: Partial<React.ComponentProps<typeof MultiSelectDropdown>> = {}) {
  return render(
    <MultiSelectDropdown
      label="Status"
      icon={<span data-testid="icon" />}
      options={['open', 'closed', 'merged']}
      selected={new Set()}
      onToggle={vi.fn()}
      onClear={vi.fn()}
      clearAllLabel="Clear all"
      emptyLabel="No options available"
      selectedLabel={(n) => `${n} selected`}
      {...props}
    />
  )
}

describe('MultiSelectDropdown — closed by default', () => {
  it('shows the label/icon and no option list', () => {
    renderDropdown()
    expect(screen.getByText('Status')).toBeInTheDocument()
    expect(screen.queryByText('open')).not.toBeInTheDocument()
  })

  it('hides the count badge when nothing is selected', () => {
    renderDropdown()
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('shows the count badge when items are selected', () => {
    renderDropdown({ selected: new Set(['open', 'closed']) })
    expect(screen.getByText('2')).toBeInTheDocument()
  })
})

describe('MultiSelectDropdown — opening', () => {
  it('opens on click, showing all options', async () => {
    const user = userEvent.setup()
    renderDropdown()
    await user.click(screen.getByText('Status'))
    expect(screen.getByText('open')).toBeInTheDocument()
    expect(screen.getByText('closed')).toBeInTheDocument()
    expect(screen.getByText('merged')).toBeInTheDocument()
  })

  it('shows an empty message when there are no options', async () => {
    const user = userEvent.setup()
    renderDropdown({ options: [] })
    await user.click(screen.getByText('Status'))
    expect(screen.getByText('No options available')).toBeInTheDocument()
  })

  it('toggles closed on a second click', async () => {
    const user = userEvent.setup()
    renderDropdown()
    await user.click(screen.getByText('Status'))
    expect(screen.getByText('open')).toBeInTheDocument()
    await user.click(screen.getByText('Status'))
    expect(screen.queryByText('open')).not.toBeInTheDocument()
  })

  it('closes on outside click', async () => {
    const user = userEvent.setup()
    render(
      <div>
        <MultiSelectDropdown
          label="Status"
          icon={null}
          options={['open']}
          selected={new Set()}
          onToggle={vi.fn()}
          onClear={vi.fn()}
          clearAllLabel="Clear all"
          emptyLabel="No options available"
          selectedLabel={(n) => `${n} selected`}
        />
        <button>outside</button>
      </div>
    )
    await user.click(screen.getByText('Status'))
    expect(screen.getByText('open')).toBeInTheDocument()
    fireEvent.mouseDown(screen.getByText('outside'))
    expect(screen.queryByText('open')).not.toBeInTheDocument()
  })
})

describe('MultiSelectDropdown — selecting options', () => {
  it('calls onToggle with the clicked option', async () => {
    const onToggle = vi.fn()
    const user = userEvent.setup()
    renderDropdown({ onToggle })
    await user.click(screen.getByText('Status'))
    await user.click(screen.getByText('open'))
    expect(onToggle).toHaveBeenCalledWith('open')
  })

  it('shows a check mark only for selected options', async () => {
    const user = userEvent.setup()
    const { container } = renderDropdown({ selected: new Set(['closed']) })
    await user.click(screen.getByText('Status'))
    expect(container.querySelectorAll('.lucide-circle-check')).toHaveLength(1)
  })
})

describe('MultiSelectDropdown — clear all', () => {
  it('hides "Clear all" when nothing is selected', async () => {
    const user = userEvent.setup()
    renderDropdown()
    await user.click(screen.getByText('Status'))
    expect(screen.queryByText('Clear all')).not.toBeInTheDocument()
  })

  it('shows the selected count and clears via the button, without toggling an option', async () => {
    const onClear = vi.fn()
    const onToggle = vi.fn()
    const user = userEvent.setup()
    renderDropdown({ selected: new Set(['open']), onClear, onToggle })
    await user.click(screen.getByText('Status'))
    expect(screen.getByText('1 selected')).toBeInTheDocument()
    await user.click(screen.getByText('Clear all'))
    expect(onClear).toHaveBeenCalledOnce()
    expect(onToggle).not.toHaveBeenCalled()
  })
})
