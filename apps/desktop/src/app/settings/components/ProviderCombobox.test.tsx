import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProviderCombobox } from './ProviderCombobox'

const PRESETS = [
  { id: 'ollama', label: 'Ollama', protocol: 'openai-compatible', defaultUrl: 'http://localhost:11434', requiresApiKey: false, implemented: true },
  { id: 'lmstudio', label: 'LM Studio', protocol: 'openai-compatible', defaultUrl: 'http://localhost:1234', requiresApiKey: false, implemented: false },
  { id: 'anthropic', label: 'Anthropic', protocol: 'anthropic-messages', defaultUrl: 'https://api.anthropic.com', requiresApiKey: true, implemented: false },
] as const

function renderCombobox(onChange = vi.fn()) {
  render(
    <ProviderCombobox
      presets={[...PRESETS]}
      value="ollama"
      onChange={onChange}
      searchPlaceholder="Search providers…"
      emptyLabel="No provider found."
      comingSoonLabel="(coming soon)"
    />
  )
  return onChange
}

describe('ProviderCombobox', () => {
  it('shows the selected preset label on the closed trigger', () => {
    renderCombobox()
    expect(screen.getByTestId('ai-provider-select')).toHaveTextContent('Ollama')
  })

  it('lists every preset once opened, marking non-implemented ones as disabled', async () => {
    const user = userEvent.setup()
    renderCombobox()
    await user.click(screen.getByTestId('ai-provider-select'))

    expect(screen.getByTestId('ai-provider-option-ollama')).toHaveAttribute('aria-disabled', 'false')
    expect(screen.getByTestId('ai-provider-option-lmstudio')).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByTestId('ai-provider-option-anthropic')).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getAllByText('(coming soon)')).toHaveLength(2)
  })

  it('filters the list via the search bar', async () => {
    const user = userEvent.setup()
    renderCombobox()
    await user.click(screen.getByTestId('ai-provider-select'))
    await user.type(screen.getByTestId('ai-provider-search'), 'anthro')

    expect(screen.getByTestId('ai-provider-option-anthropic')).toBeInTheDocument()
    expect(screen.queryByTestId('ai-provider-option-ollama')).not.toBeInTheDocument()
  })

  it('selecting an implemented preset calls onChange and closes the popover', async () => {
    const user = userEvent.setup()
    const onChange = renderCombobox()
    await user.click(screen.getByTestId('ai-provider-select'))
    await user.click(screen.getByTestId('ai-provider-option-lmstudio'))

    // cmdk blocks selection of disabled items — lmstudio isn't implemented, so onChange never fires
    // and the popover (and its search input) stays open.
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByTestId('ai-provider-search')).toBeInTheDocument()

    await user.click(screen.getByTestId('ai-provider-option-ollama'))
    expect(onChange).toHaveBeenCalledWith('ollama')
    expect(screen.queryByTestId('ai-provider-search')).not.toBeInTheDocument()
  })

  it('shows the empty state when no preset matches the search', async () => {
    const user = userEvent.setup()
    renderCombobox()
    await user.click(screen.getByTestId('ai-provider-select'))
    await user.type(screen.getByTestId('ai-provider-search'), 'zzz-nope')

    expect(screen.getByText('No provider found.')).toBeInTheDocument()
  })
})
