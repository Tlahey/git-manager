import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SplitButton, type SplitButtonAction } from './SplitButton'

function actions(overrides: Partial<SplitButtonAction>[] = []): SplitButtonAction[] {
  const base: SplitButtonAction[] = [
    { key: 'push', label: 'Commit & Push', onSelect: vi.fn() },
    { key: 'rebase', label: 'Commit & Rebase', onSelect: vi.fn() },
  ]
  return overrides.length ? (overrides as SplitButtonAction[]) : base
}

describe('SplitButton', () => {
  it('renders the label and calls onClick when the primary button is clicked', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<SplitButton label="Commit" onClick={onClick} actions={[]} />)
    await user.click(screen.getByText('Commit'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('does not render a caret/dropdown when there are no actions', () => {
    render(<SplitButton label="Commit" onClick={vi.fn()} actions={[]} />)
    expect(screen.queryByRole('button', { name: 'More options' })).not.toBeInTheDocument()
  })

  it('renders a caret dropdown listing every action when actions are provided', async () => {
    const user = userEvent.setup()
    render(<SplitButton label="Commit" onClick={vi.fn()} actions={actions()} />)
    await user.click(screen.getByRole('button', { name: 'More options' }))
    expect(screen.getByRole('menuitem', { name: 'Commit & Push' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Commit & Rebase' })).toBeInTheDocument()
  })

  it("calls the chosen action's onSelect", async () => {
    const user = userEvent.setup()
    const onSelectPush = vi.fn()
    render(
      <SplitButton
        label="Commit"
        onClick={vi.fn()}
        actions={[{ key: 'push', label: 'Commit & Push', onSelect: onSelectPush }]}
      />
    )
    await user.click(screen.getByRole('button', { name: 'More options' }))
    await user.click(screen.getByRole('menuitem', { name: 'Commit & Push' }))
    expect(onSelectPush).toHaveBeenCalledOnce()
  })

  it('disables both the primary and caret buttons when disabled', () => {
    render(<SplitButton label="Commit" onClick={vi.fn()} actions={actions()} disabled />)
    expect(screen.getByText('Commit')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'More options' })).toBeDisabled()
  })

  it('disables both buttons when busy', () => {
    render(<SplitButton label="Commit" onClick={vi.fn()} actions={actions()} busy />)
    expect(screen.getByText('Commit')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'More options' })).toBeDisabled()
  })

  it('applies data-testid attributes only when testIdPrefix is provided', () => {
    const { rerender } = render(
      <SplitButton label="Commit" onClick={vi.fn()} actions={actions()} />
    )
    expect(screen.queryByTestId('commit-btn')).not.toBeInTheDocument()

    rerender(
      <SplitButton label="Commit" onClick={vi.fn()} actions={actions()} testIdPrefix="commit" />
    )
    expect(screen.getByTestId('commit-btn')).toBeInTheDocument()
    expect(screen.getByTestId('commit-menu-btn')).toBeInTheDocument()
  })

  it('forwards size and variant to both button segments', () => {
    render(
      <SplitButton
        label="Merge"
        onClick={vi.fn()}
        actions={actions()}
        size="sm"
        variant="success"
        testIdPrefix="merge"
      />
    )
    const primary = screen.getByTestId('merge-btn')
    const caret = screen.getByTestId('merge-menu-btn')
    // `sm` size (h-8) and the `success` variant class land on both segments.
    expect(primary.className).toContain('h-8')
    expect(primary.className).toContain('bg-button-success')
    expect(caret.className).toContain('h-8')
    expect(caret.className).toContain('bg-button-success')
  })
})
