import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ExternalToolsSection } from './ExternalToolsSection'
import { SettingsSearchProvider } from './settingsSearch'
import { useSettingsStore } from '../../../stores/settings.store'

const openMock = vi.fn()
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: (...a: unknown[]) => openMock(...a) }))

const INITIAL_SETTINGS = useSettingsStore.getState()

const SECTIONS = [
  {
    name: 'editor',
    slice: 'git',
    commandKey: 'externalEditorCommand',
    selectTestId: 'externalEditor-select',
    changeTestId: 'externalEditor-change',
    clearTestId: 'externalEditor-clear',
    valueTestId: 'externalEditor-value',
  },
  {
    name: 'terminal',
    slice: 'externalTools',
    commandKey: 'externalTerminalCommand',
    selectTestId: 'externalTerminal-select',
    changeTestId: 'externalTerminal-change',
    clearTestId: 'externalTerminal-clear',
    valueTestId: 'externalTerminal-value',
  },
] as const

beforeEach(() => {
  vi.clearAllMocks()
  useSettingsStore.setState(INITIAL_SETTINGS, true)
})

function sliceField(slice: string, field: string): string {
  const settings = useSettingsStore.getState().settings as unknown as Record<string, unknown>
  return (settings[slice] as Record<string, string>)[field]
}

function withCommand(slice: string, commandKey: string, value: string) {
  const currentSlice = (INITIAL_SETTINGS.settings as unknown as Record<string, unknown>)[slice]
  useSettingsStore.setState({
    settings: {
      ...INITIAL_SETTINGS.settings,
      [slice]: { ...(currentSlice as Record<string, unknown>), [commandKey]: value },
    },
  })
}

describe.each(SECTIONS)(
  'ExternalToolsSection — $name',
  ({ slice, commandKey, selectTestId, changeTestId, clearTestId, valueTestId }) => {
    it('shows only the "select an app" button when nothing is configured — no dropdown', () => {
      render(<ExternalToolsSection />)
      expect(screen.getByTestId(selectTestId)).toBeInTheDocument()
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
      expect(screen.queryByTestId(valueTestId)).not.toBeInTheDocument()
    })

    it('picking an app stores its path', async () => {
      openMock.mockResolvedValue('/Applications/Some App.app')
      const user = userEvent.setup()
      render(<ExternalToolsSection />)
      await user.click(screen.getByTestId(selectTestId))
      expect(openMock).toHaveBeenCalledWith(
        expect.objectContaining({
          directory: false,
          filters: [{ name: 'Application', extensions: ['app'] }],
        })
      )
      expect(sliceField(slice, commandKey)).toBe('/Applications/Some App.app')
    })

    it('does nothing when the picker is dismissed', async () => {
      openMock.mockResolvedValue(null)
      const user = userEvent.setup()
      render(<ExternalToolsSection />)
      await user.click(screen.getByTestId(selectTestId))
      expect(sliceField(slice, commandKey)).toBe('')
    })

    it('once configured, shows the app name plus Changer/clear controls, no dropdown', () => {
      withCommand(slice, commandKey, '/Applications/Some App.app')
      render(<ExternalToolsSection />)
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
      expect(screen.queryByTestId(selectTestId)).not.toBeInTheDocument()
      expect(screen.getByTestId(valueTestId)).toHaveTextContent('Some App')
      expect(screen.getByTestId(changeTestId)).toBeInTheDocument()
      expect(screen.getByTestId(clearTestId)).toBeInTheDocument()
    })

    it('"Changer" opens the picker again and replaces the stored path', async () => {
      withCommand(slice, commandKey, '/Applications/Old App.app')
      openMock.mockResolvedValue('/Applications/New App.app')
      const user = userEvent.setup()
      render(<ExternalToolsSection />)
      await user.click(screen.getByTestId(changeTestId))
      expect(sliceField(slice, commandKey)).toBe('/Applications/New App.app')
    })

    it('the clear button removes the configured app, reverting to the "select" button', async () => {
      withCommand(slice, commandKey, '/Applications/Some App.app')
      const user = userEvent.setup()
      render(<ExternalToolsSection />)
      await user.click(screen.getByTestId(clearTestId))
      expect(sliceField(slice, commandKey)).toBe('')
      expect(screen.getByTestId(selectTestId)).toBeInTheDocument()
      expect(screen.queryByTestId(valueTestId)).not.toBeInTheDocument()
    })
  }
)

describe('ExternalToolsSection — in-page search filtering', () => {
  it('shows only the external-terminal setting when searching "terminal"', () => {
    render(
      <SettingsSearchProvider query="terminal">
        <ExternalToolsSection />
      </SettingsSearchProvider>
    )
    expect(screen.getByTestId('setting-external-terminal')).toBeInTheDocument()
    expect(screen.queryByTestId('setting-external-editor')).not.toBeInTheDocument()
  })

  it('shows both settings when the query is empty', () => {
    render(
      <SettingsSearchProvider query="">
        <ExternalToolsSection />
      </SettingsSearchProvider>
    )
    expect(screen.getByTestId('setting-external-editor')).toBeInTheDocument()
    expect(screen.getByTestId('setting-external-terminal')).toBeInTheDocument()
  })
})
