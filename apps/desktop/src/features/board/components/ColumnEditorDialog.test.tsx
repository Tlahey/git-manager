import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { BoardColumn } from '@git-manager/git-types'
import { ColumnEditorDialog } from './ColumnEditorDialog'

const columns: BoardColumn[] = [
  { id: 'todo', name: 'To do', order: 0 },
  { id: 'done', name: 'Done', order: 1 },
]

describe('ColumnEditorDialog', () => {
  it('adds a new column and saves the whole draft', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<ColumnEditorDialog open onOpenChange={() => {}} columns={columns} onSave={onSave} />)

    await userEvent.type(screen.getByTestId('column-editor-new-name'), 'In review')
    await userEvent.click(screen.getByTestId('column-editor-add'))
    await userEvent.click(screen.getByTestId('column-editor-save'))

    expect(onSave).toHaveBeenCalledWith([
      { id: 'todo', name: 'To do', order: 0 },
      { id: 'done', name: 'Done', order: 1 },
      { id: 'in-review', name: 'In review', order: 2 },
    ])
  })

  it('removes a column', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<ColumnEditorDialog open onOpenChange={() => {}} columns={columns} onSave={onSave} />)

    await userEvent.click(screen.getByTestId('column-editor-remove-todo'))
    await userEvent.click(screen.getByTestId('column-editor-save'))

    expect(onSave).toHaveBeenCalledWith([{ id: 'done', name: 'Done', order: 0 }])
  })

  it('renames a column in place', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<ColumnEditorDialog open onOpenChange={() => {}} columns={columns} onSave={onSave} />)

    const input = screen.getByDisplayValue('To do')
    await userEvent.clear(input)
    await userEvent.type(input, 'Backlog')
    await userEvent.click(screen.getByTestId('column-editor-save'))

    expect(onSave).toHaveBeenCalledWith([
      { id: 'todo', name: 'Backlog', order: 0 },
      { id: 'done', name: 'Done', order: 1 },
    ])
  })
})

/**
 * Which columns count as "done" is what drives the sprint report and decides which cards carry over
 * — see `sprintStats.doneColumnIds`. It is a per-column flag rather than "the last column" because a
 * workflow can end in more than one terminal state (Done, Shipped, Won't do).
 */
describe('ColumnEditorDialog — columns that count as done', () => {
  it('marks a column as done', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<ColumnEditorDialog open onOpenChange={() => {}} columns={columns} onSave={onSave} />)

    await userEvent.click(screen.getByTestId('column-editor-done-done'))
    await userEvent.click(screen.getByTestId('column-editor-save'))

    // The untouched column is left exactly as it was — no `isDone` key is invented for it.
    expect(onSave).toHaveBeenCalledWith([
      { id: 'todo', name: 'To do', order: 0 },
      { id: 'done', name: 'Done', order: 1, isDone: true },
    ])
  })

  it('reflects the flag a column already carries, and can clear it', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <ColumnEditorDialog
        open
        onOpenChange={() => {}}
        columns={[{ id: 'done', name: 'Done', order: 0, isDone: true }]}
        onSave={onSave}
      />
    )

    const checkbox = screen.getByTestId('column-editor-done-done')
    expect(checkbox).toBeChecked()

    await userEvent.click(checkbox)
    await userEvent.click(screen.getByTestId('column-editor-save'))
    expect(onSave).toHaveBeenCalledWith([{ id: 'done', name: 'Done', order: 0, isDone: false }])
  })

  it('allows several terminal columns at once', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<ColumnEditorDialog open onOpenChange={() => {}} columns={columns} onSave={onSave} />)

    await userEvent.click(screen.getByTestId('column-editor-done-todo'))
    await userEvent.click(screen.getByTestId('column-editor-done-done'))
    await userEvent.click(screen.getByTestId('column-editor-save'))

    expect(onSave).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'todo', isDone: true }),
      expect.objectContaining({ id: 'done', isDone: true }),
    ])
  })
})
