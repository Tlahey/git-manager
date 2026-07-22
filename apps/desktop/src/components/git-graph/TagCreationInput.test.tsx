import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TagCreationInput } from './TagCreationInput'

describe('TagCreationInput — inline variant', () => {
  const onSubmit = vi.fn()
  const onCancel = vi.fn()
  beforeEach(() => vi.clearAllMocks())

  function renderInline() {
    return render(
      <TagCreationInput variant="inline" onSubmit={onSubmit} onCancel={onCancel} />
    )
  }

  it('shows the tag-name input with its placeholder', () => {
    renderInline()
    expect(screen.getByPlaceholderText('Enter tag name')).toBeInTheDocument()
  })

  it('submits the trimmed name on Enter', () => {
    renderInline()
    const input = screen.getByTestId('tag-creation-inline-input')
    fireEvent.change(input, { target: { value: '  v1.0.0  ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSubmit).toHaveBeenCalledWith('v1.0.0')
  })

  it('does not submit an empty name on Enter', () => {
    renderInline()
    fireEvent.keyDown(screen.getByTestId('tag-creation-inline-input'), { key: 'Enter' })
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('cancels on Escape', () => {
    renderInline()
    fireEvent.keyDown(screen.getByTestId('tag-creation-inline-input'), { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('cancels when focus leaves an empty input', () => {
    renderInline()
    fireEvent.blur(screen.getByTestId('tag-creation-inline-input'))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('does not cancel on blur once a name has been typed', () => {
    renderInline()
    const input = screen.getByTestId('tag-creation-inline-input')
    fireEvent.change(input, { target: { value: 'v1' } })
    fireEvent.blur(input)
    expect(onCancel).not.toHaveBeenCalled()
  })
})

describe('TagCreationInput — bar variant', () => {
  const onSubmit = vi.fn()
  const onCancel = vi.fn()
  beforeEach(() => vi.clearAllMocks())

  function renderBar() {
    return render(<TagCreationInput variant="bar" onSubmit={onSubmit} onCancel={onCancel} />)
  }

  it('shows the label, input and buttons', () => {
    renderBar()
    expect(screen.getByText('Enter a name for the new tag:')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Tag name')).toBeInTheDocument()
    expect(screen.getByTestId('tag-creation-bar-submit')).toBeInTheDocument()
    expect(screen.getByTestId('tag-creation-bar-cancel')).toBeInTheDocument()
  })

  it('disables Submit until a name is entered', () => {
    renderBar()
    expect(screen.getByTestId('tag-creation-bar-submit')).toBeDisabled()
    fireEvent.change(screen.getByTestId('tag-creation-bar-input'), { target: { value: 'v2' } })
    expect(screen.getByTestId('tag-creation-bar-submit')).toBeEnabled()
  })

  it('submits the trimmed name on Submit click', () => {
    renderBar()
    fireEvent.change(screen.getByTestId('tag-creation-bar-input'), {
      target: { value: ' release-1 ' },
    })
    fireEvent.click(screen.getByTestId('tag-creation-bar-submit'))
    expect(onSubmit).toHaveBeenCalledWith('release-1')
  })

  it('cancels on Cancel click', () => {
    renderBar()
    fireEvent.click(screen.getByTestId('tag-creation-bar-cancel'))
    expect(onCancel).toHaveBeenCalledOnce()
  })
})
