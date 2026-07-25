import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MarkdownTaskListInput } from './MarkdownTaskList'

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

  it('cannot be toggled: this is a rendered document, not a form', () => {
    render(<MarkdownTaskListInput checked={false} />)
    const box = screen.getByTestId('markdown-task-checkbox')

    expect(box).toBeDisabled()
    fireEvent.click(box)

    expect(box).not.toBeChecked()
  })
})
