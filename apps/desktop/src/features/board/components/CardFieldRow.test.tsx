import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CardFieldRow } from './CardFieldRow'

describe('CardFieldRow', () => {
  it('shows the field’s name beside its value', () => {
    render(
      <CardFieldRow label="Priority" testId="row">
        <span>High</span>
      </CardFieldRow>
    )
    expect(screen.getByTestId('row')).toHaveTextContent('PriorityHigh')
  })

  /** An empty field is an invitation, not a fact — the value cell is the only clickable thing, so a
   * greyed statement there leaves nothing to aim at. */
  it('offers the add label instead of the value when the field is empty', () => {
    render(
      <CardFieldRow label="Due date" testId="row" addLabel="Add a due date" filled={false}>
        <span>2026-01-01</span>
      </CardFieldRow>
    )
    expect(screen.getByTestId('row')).toHaveTextContent('Add a due date')
    expect(screen.queryByText('2026-01-01')).not.toBeInTheDocument()
  })

  it('makes the whole value cell the way in, rather than a separate pencil', async () => {
    const onEdit = vi.fn()
    render(
      <CardFieldRow label="Priority" testId="row" onEdit={onEdit}>
        <span>High</span>
      </CardFieldRow>
    )
    await userEvent.click(screen.getByTestId('row-edit'))
    expect(onEdit).toHaveBeenCalledTimes(1)
  })

  it('renders a read-only field as plain text, with nothing to click', () => {
    render(
      <CardFieldRow label="Priority" testId="row">
        <span>High</span>
      </CardFieldRow>
    )
    expect(screen.queryByTestId('row-edit')).not.toBeInTheDocument()
  })

  it('puts the field’s own editor under the row', () => {
    render(
      <CardFieldRow label="Priority" testId="row" editor={<input data-testid="editor" />}>
        <span>High</span>
      </CardFieldRow>
    )
    expect(screen.getByTestId('editor')).toBeInTheDocument()
  })
})
