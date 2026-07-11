import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ExternalToolsSection } from './ExternalToolsSection'
import { useSettingsStore } from '../../../stores/settings.store'

const INITIAL_SETTINGS = useSettingsStore.getState()

const TOOL_SECTIONS = [
  { index: 0, slice: 'externalTools', key: 'mergeTool', commandKey: 'mergeToolCommand', label: 'Commande de fusion personnalisée' },
  { index: 1, slice: 'externalTools', key: 'diffTool', commandKey: 'diffToolCommand', label: 'Commande de comparaison personnalisée' },
  { index: 2, slice: 'git', key: 'externalEditor', commandKey: 'externalEditorCommand', label: "Commande de l'éditeur" },
  { index: 3, slice: 'externalTools', key: 'externalTerminal', commandKey: 'externalTerminalCommand', label: 'Commande du terminal' },
] as const

beforeEach(() => {
  useSettingsStore.setState(INITIAL_SETTINGS, true)
})

describe.each(TOOL_SECTIONS)('ExternalToolsSection — $key', ({ index, slice, key, commandKey, label }) => {
  it('reflects the current selection', () => {
    useSettingsStore.setState({
      settings: { ...INITIAL_SETTINGS.settings, [slice]: { ...INITIAL_SETTINGS.settings[slice]!, [key]: 'custom' } },
    })
    render(<ExternalToolsSection />)
    expect(screen.getAllByRole('combobox')[index]).toHaveValue('custom')
  })

  it('hides the custom-command input unless "custom" is selected', () => {
    render(<ExternalToolsSection />)
    expect(screen.queryByText(label)).not.toBeInTheDocument()
  })

  it('shows and binds the custom-command input once "custom" is selected', async () => {
    useSettingsStore.setState({
      settings: { ...INITIAL_SETTINGS.settings, [slice]: { ...INITIAL_SETTINGS.settings[slice]!, [key]: 'custom' } },
    })
    const user = userEvent.setup()
    render(<ExternalToolsSection />)
    // The command <Input> is rendered as the label's next sibling within the same wrapper div.
    const commandInput = screen.getByText(label).nextElementSibling as HTMLInputElement
    await user.type(commandInput, 'my-command')
    expect((useSettingsStore.getState().settings[slice] as unknown as Record<string, string>)[commandKey]).toBe('my-command')
  })

  it('switching the select to "custom" updates the store', async () => {
    const user = userEvent.setup()
    render(<ExternalToolsSection />)
    await user.selectOptions(screen.getAllByRole('combobox')[index], 'custom')
    expect((useSettingsStore.getState().settings[slice] as unknown as Record<string, string>)[key]).toBe('custom')
  })
})
