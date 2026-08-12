import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MarkdownField } from './MarkdownField'

function Harness({ initial = '', onChange }: { initial?: string; onChange?: (v: string) => void }) {
  const [value, setValue] = useState(initial)
  return (
    <MarkdownField
      value={value}
      onChange={(next) => {
        setValue(next)
        onChange?.(next)
      }}
      placeholder="Describe the change"
      data-testid="field"
    />
  )
}

/** The formatted mode is the one that opens; the raw field lives under the other tab. */
async function showCode() {
  await userEvent.click(screen.getByTestId('markdown-tab-code'))
}

describe('MarkdownField', () => {
  it('formats the selected text when a toolbar button is used', async () => {
    render(<Harness initial="hello world" />)
    await showCode()
    const field = screen.getByTestId('field') as HTMLTextAreaElement
    field.setSelectionRange(6, 11)

    await userEvent.click(screen.getByTestId('markdown-toolbar-bold'))

    expect(field.value).toBe('hello **world**')
  })

  it('reports the formatted value to its owner', async () => {
    const onChange = vi.fn()
    render(<Harness initial="todo" onChange={onChange} />)
    await showCode()
    const field = screen.getByTestId('field') as HTMLTextAreaElement
    field.setSelectionRange(0, 4)

    await userEvent.click(screen.getByTestId('markdown-toolbar-taskList'))

    expect(onChange).toHaveBeenCalledWith('- [ ] todo')
  })

  it('applies the GitHub keyboard shortcuts', async () => {
    render(<Harness initial="hello world" />)
    await showCode()
    const field = screen.getByTestId('field') as HTMLTextAreaElement

    await userEvent.type(field, '{Meta>}i{/Meta}', {
      initialSelectionStart: 6,
      initialSelectionEnd: 11,
    })

    expect(field.value).toBe('hello _world_')
  })

  it('still types normally', async () => {
    render(<Harness />)
    await showCode()
    const field = screen.getByTestId('field') as HTMLTextAreaElement

    await userEvent.type(field, 'plain text')

    expect(field.value).toBe('plain text')
  })

  it("runs the caller's own key handler alongside the shortcuts", async () => {
    const onKeyDown = vi.fn()
    render(<MarkdownField value="" onChange={vi.fn()} onKeyDown={onKeyDown} data-testid="field" />)
    await showCode()

    await userEvent.type(screen.getByTestId('field'), '{Enter}')

    expect(onKeyDown).toHaveBeenCalled()
  })

  it('shows the formatted editor on the same markdown', () => {
    render(<MarkdownField value="## Title" onChange={vi.fn()} data-testid="field" />)

    expect(screen.getByTestId('field-rich').textContent).toContain('Title')
  })

  it('disables the toolbar with the field', () => {
    render(<MarkdownField value="" onChange={vi.fn()} disabled data-testid="field" />)

    expect(screen.getByTestId('field')).toBeDisabled()
    expect(screen.getByTestId('markdown-toolbar-bold')).toBeDisabled()
  })
})
