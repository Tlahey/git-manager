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
    const onOpenChange = vi.fn()
    render(
      <CardFieldRow
        label="Priority"
        testId="row"
        editor={<input data-testid="editor" />}
        open={false}
        onOpenChange={onOpenChange}
      >
        <span>High</span>
      </CardFieldRow>
    )
    await userEvent.click(screen.getByTestId('row-edit'))
    expect(onOpenChange).toHaveBeenCalledWith(true)
  })

  it('renders a field with no editor as plain text, with nothing to click', () => {
    render(
      <CardFieldRow label="Priority" testId="row">
        <span>High</span>
      </CardFieldRow>
    )
    expect(screen.queryByTestId('row-edit')).not.toBeInTheDocument()
  })

  /** The choices are shown *over* the value rather than under the row: the rows either side of the
   * one being edited stay where the eye left them. */
  it('keeps the editor out of the row until it is opened', () => {
    const { rerender } = render(
      <CardFieldRow label="Priority" testId="row" editor={<input data-testid="editor" />} open={false}>
        <span>High</span>
      </CardFieldRow>
    )
    expect(screen.queryByTestId('editor')).not.toBeInTheDocument()

    rerender(
      <CardFieldRow label="Priority" testId="row" editor={<input data-testid="editor" />} open>
        <span>High</span>
      </CardFieldRow>
    )
    expect(screen.getByTestId('editor')).toBeInTheDocument()
    expect(screen.getByTestId('row')).not.toContainElement(screen.getByTestId('editor'))
  })
})
