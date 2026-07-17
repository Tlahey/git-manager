import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CommandAutocomplete, type CommandSuggestion } from './CommandAutocomplete'

const SUGGESTIONS: CommandSuggestion[] = [
  { name: 'dev', command: 'pnpm dev', detail: 'vite' },
  { name: 'build', command: 'pnpm build', detail: 'tsc' },
]

describe('CommandAutocomplete', () => {
  it('reports free-typed text through onChange', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <CommandAutocomplete value="" onChange={onChange} suggestions={[]} testId="cmd" />
    )
    await user.type(screen.getByTestId('cmd'), 'x')
    expect(onChange).toHaveBeenCalledWith('x')
  })

  it('shows suggestions on focus and selects one', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <CommandAutocomplete value="" onChange={onChange} suggestions={SUGGESTIONS} testId="cmd" />
    )
    await user.click(screen.getByTestId('cmd'))
    expect(screen.getByTestId('cmd-list')).toBeInTheDocument()
    await user.click(screen.getByTestId('cmd-option-build'))
    expect(onChange).toHaveBeenCalledWith('pnpm build')
  })

  it('filters suggestions by the typed text', async () => {
    render(
      <CommandAutocomplete value="build" onChange={vi.fn()} suggestions={SUGGESTIONS} testId="cmd" />
    )
    await userEvent.setup().click(screen.getByTestId('cmd'))
    expect(screen.getByTestId('cmd-option-build')).toBeInTheDocument()
    expect(screen.queryByTestId('cmd-option-dev')).not.toBeInTheDocument()
  })

  it('calls onEnter when Enter is pressed with the list closed', async () => {
    const user = userEvent.setup()
    const onEnter = vi.fn()
    render(
      <CommandAutocomplete
        value="pnpm test"
        onChange={vi.fn()}
        onEnter={onEnter}
        suggestions={[]}
        testId="cmd"
      />
    )
    await user.click(screen.getByTestId('cmd'))
    await user.keyboard('{Enter}')
    expect(onEnter).toHaveBeenCalled()
  })
})
