import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AiPresetDefinition } from '@git-manager/ai'
import { ProviderCombobox } from './ProviderCombobox'

const PRESETS: AiPresetDefinition[] = [
  {
    id: 'ollama',
    label: 'Ollama',
    protocol: 'openai-compatible',
    defaultUrl: 'http://localhost:11434',
    supportsApiKey: false,
    descriptionKey: 'settings.ai.presetHint.ollama',
  },
  {
    id: 'openai-compatible',
    label: 'OpenAI-compatible',
    protocol: 'openai-compatible',
    defaultUrl: 'http://localhost:1234',
    supportsApiKey: true,
    descriptionKey: 'settings.ai.presetHint.openaiCompatible',
  },
]

function renderCombobox(onChange = vi.fn()) {
  render(
    <ProviderCombobox
      presets={PRESETS}
      value="ollama"
      onChange={onChange}
      searchPlaceholder="Search providers…"
      emptyLabel="No provider found."
    />
  )
  return onChange
}

describe('ProviderCombobox', () => {
  it('shows the selected preset label on the closed trigger', () => {
    renderCombobox()
    expect(screen.getByTestId('ai-provider-select')).toHaveTextContent('Ollama')
  })

  it('lists every preset once opened, all of them selectable', async () => {
    const user = userEvent.setup()
    renderCombobox()
    await user.click(screen.getByTestId('ai-provider-select'))

    expect(screen.getByTestId('ai-provider-option-ollama')).toHaveAttribute('aria-disabled', 'false')
    expect(screen.getByTestId('ai-provider-option-openai-compatible')).toHaveAttribute(
      'aria-disabled',
      'false'
    )
  })

  it('filters the list via the search bar', async () => {
    const user = userEvent.setup()
    renderCombobox()
    await user.click(screen.getByTestId('ai-provider-select'))
    await user.type(screen.getByTestId('ai-provider-search'), 'openai')

    expect(screen.getByTestId('ai-provider-option-openai-compatible')).toBeInTheDocument()
    expect(screen.queryByTestId('ai-provider-option-ollama')).not.toBeInTheDocument()
  })

  it('selecting a preset calls onChange and closes the popover', async () => {
    const user = userEvent.setup()
    const onChange = renderCombobox()
    await user.click(screen.getByTestId('ai-provider-select'))
    await user.click(screen.getByTestId('ai-provider-option-openai-compatible'))

    expect(onChange).toHaveBeenCalledWith('openai-compatible')
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
