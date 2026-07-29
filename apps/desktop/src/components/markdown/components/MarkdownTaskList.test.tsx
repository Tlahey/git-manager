import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MarkdownTaskListInput } from './MarkdownTaskList'
import {
  MarkdownTaskItemLineContext,
  MarkdownTaskListContext,
  type MarkdownTaskListContextValue,
} from '../taskListContext'

function withContext(children: ReactNode, value: MarkdownTaskListContextValue, line = 3) {
  return (
    <MarkdownTaskListContext.Provider value={value}>
      <MarkdownTaskItemLineContext.Provider value={line}>
        {children}
      </MarkdownTaskItemLineContext.Provider>
    </MarkdownTaskListContext.Provider>
  )
}

describe('MarkdownTaskListInput', () => {
  it('reflects the state written in the document', () => {
    const { rerender } = render(<MarkdownTaskListInput checked />)
    expect(screen.getByTestId('markdown-task-checkbox')).toBeChecked()

    rerender(<MarkdownTaskListInput checked={false} />)
    expect(screen.getByTestId('markdown-task-checkbox')).not.toBeChecked()
  })

  it('treats a task with no state as unchecked rather than warning about a null value', () => {
    render(<MarkdownTaskListInput />)
    expect(screen.getByTestId('markdown-task-checkbox')).not.toBeChecked()
  })

  it('cannot be toggled when the document is only being read', () => {
    render(<MarkdownTaskListInput checked={false} />)
    const box = screen.getByTestId('markdown-task-checkbox')

    expect(box).toBeDisabled()
    fireEvent.click(box)

    expect(box).not.toBeChecked()
  })

  it('reports the enclosing item line when the document is editable', () => {
    const onToggle = vi.fn()
    render(withContext(<MarkdownTaskListInput checked={false} />, { onToggle }, 7))
    const box = screen.getByTestId('markdown-task-checkbox')

    expect(box).toBeEnabled()
    fireEvent.click(box)

    expect(onToggle).toHaveBeenCalledWith(7, true)
  })

  it('reports unticking as well', () => {
    const onToggle = vi.fn()
    render(withContext(<MarkdownTaskListInput checked />, { onToggle }))

    fireEvent.click(screen.getByTestId('markdown-task-checkbox'))

    expect(onToggle).toHaveBeenCalledWith(3, false)
  })

  it('stays frozen while a toggle is being saved, so a second click cannot race the first', () => {
    const onToggle = vi.fn()
    render(withContext(<MarkdownTaskListInput checked={false} />, { onToggle, pending: true }))
    const box = screen.getByTestId('markdown-task-checkbox')

    expect(box).toBeDisabled()
    fireEvent.click(box)

    expect(onToggle).not.toHaveBeenCalled()
  })

  it('stays read-only outside a list item, where there is no line to write back to', () => {
    const onToggle = vi.fn()
    render(
      <MarkdownTaskListContext.Provider value={{ onToggle }}>
        <MarkdownTaskListInput checked={false} />
      </MarkdownTaskListContext.Provider>
    )

    expect(screen.getByTestId('markdown-task-checkbox')).toBeDisabled()
  })
})
