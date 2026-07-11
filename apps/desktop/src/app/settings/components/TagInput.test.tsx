import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TagInput } from './TagInput'

describe('TagInput — rendering', () => {
  it('renders existing tags with a remove button each', () => {
    render(<TagInput tags={['a', 'b']} onChange={vi.fn()} />)
    expect(screen.getByText('a')).toBeInTheDocument()
    expect(screen.getByText('b')).toBeInTheDocument()
    expect(screen.getAllByText('×')).toHaveLength(2)
  })

  it('shows the placeholder only when there are no tags', () => {
    const { rerender } = render(<TagInput tags={[]} onChange={vi.fn()} placeholder="Add a tag…" />)
    expect(screen.getByPlaceholderText('Add a tag…')).toBeInTheDocument()

    rerender(<TagInput tags={['a']} onChange={vi.fn()} placeholder="Add a tag…" />)
    expect(screen.queryByPlaceholderText('Add a tag…')).not.toBeInTheDocument()
  })
})

describe('TagInput — adding tags', () => {
  it('adds a trimmed tag on Enter', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<TagInput tags={[]} onChange={onChange} />)
    await user.type(screen.getByRole('textbox'), '  feature  {Enter}')
    expect(onChange).toHaveBeenCalledWith(['feature'])
  })

  it('adds a tag on comma', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<TagInput tags={[]} onChange={onChange} />)
    await user.type(screen.getByRole('textbox'), 'feature,')
    expect(onChange).toHaveBeenCalledWith(['feature'])
  })

  it('does not add an empty/whitespace-only tag', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<TagInput tags={[]} onChange={onChange} />)
    await user.type(screen.getByRole('textbox'), '   {Enter}')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('does not add a duplicate tag', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<TagInput tags={['feature']} onChange={onChange} />)
    await user.type(screen.getByRole('textbox'), 'feature{Enter}')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('clears the input after adding a tag', async () => {
    const user = userEvent.setup()
    render(<TagInput tags={[]} onChange={vi.fn()} />)
    await user.type(screen.getByRole('textbox'), 'feature{Enter}')
    expect(screen.getByRole('textbox')).toHaveValue('')
  })
})

describe('TagInput — removing tags', () => {
  it('removes the last tag on Backspace when the input is empty', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<TagInput tags={['a', 'b']} onChange={onChange} />)
    await user.type(screen.getByRole('textbox'), '{Backspace}')
    expect(onChange).toHaveBeenCalledWith(['a'])
  })

  it('does not remove a tag on Backspace when the input has text', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<TagInput tags={['a']} onChange={onChange} />)
    await user.type(screen.getByRole('textbox'), 'x{Backspace}')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('removes a specific tag via its × button', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<TagInput tags={['a', 'b', 'c']} onChange={onChange} />)
    await user.click(screen.getAllByText('×')[1])
    expect(onChange).toHaveBeenCalledWith(['a', 'c'])
  })
})
