import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PaletteCommand } from './commands/types'

vi.mock('@git-manager/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

// Fake cmdk primitives — cmdk's internal filtering/keyboard handling isn't what we're testing here,
// and it's brittle in jsdom (same rationale as the Monaco fake). We test the palette's own wiring:
// grouping, testids, and the run → close/onCloseSettings behaviour.
const { apiGetCommitWebUrl, apiOpenUrl } = vi.hoisted(() => ({
  apiGetCommitWebUrl: vi.fn(),
  apiOpenUrl: vi.fn(),
}))
vi.mock('../../api/git.api', () => ({ apiGetCommitWebUrl }))
vi.mock('../../api/shell.api', () => ({ apiOpenUrl }))

vi.mock('@git-manager/ui', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
  CommandDialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="fake-command-dialog">{children}</div> : null,
  // Bridge cmdk's controlled `value`/`onValueChange` to a native input so tests can type.
  CommandInput: (props: {
    value?: string
    onValueChange?: (v: string) => void
    'data-testid'?: string
    placeholder?: string
  }) => (
    <input
      data-testid={props['data-testid']}
      placeholder={props.placeholder}
      value={props.value ?? ''}
      onChange={(e) => props.onValueChange?.(e.target.value)}
    />
  ),
  CommandList: ({ children, ...p }: { children: React.ReactNode }) => <div {...p}>{children}</div>,
  CommandEmpty: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandGroup: ({ heading, children }: { heading: string; children: React.ReactNode }) => (
    <div data-heading={heading}>{children}</div>
  ),
  // Reads only the props it needs — ignores cmdk's value/keywords rather than spreading them onto a
  // DOM node (which would warn) or destructuring-and-discarding them (which would trip unused-vars).
  CommandItem: (props: {
    children: React.ReactNode
    onSelect: () => void
    'data-testid'?: string
  }) => (
    <button type="button" onClick={props.onSelect} data-testid={props['data-testid']}>
      {props.children}
    </button>
  ),
}))

const { globalCommands, commitCommands, stashCommands } = vi.hoisted(() => ({
  globalCommands: { current: [] as PaletteCommand[] },
  commitCommands: { current: [] as PaletteCommand[] },
  stashCommands: { current: [] as PaletteCommand[] },
}))
vi.mock('./commands/useGlobalCommands', () => ({ useGlobalCommands: () => globalCommands.current }))
vi.mock('./commands/useCommitCommands', () => ({ useCommitCommands: () => commitCommands.current }))
vi.mock('./commands/useStashCommands', () => ({ useStashCommands: () => stashCommands.current }))

import { CommandPalette } from './CommandPalette'
import { useCommandPaletteStore } from '../../stores/commandPalette.store'
import { useRepoUIStore } from '../../stores/repoUI.store'

const navRun = vi.fn()
const settingsRun = vi.fn()
const commitRun = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  useCommandPaletteStore.setState({ open: false })
  useRepoUIStore.setState({ activeRepo: null })
  globalCommands.current = [
    { id: 'nav-dashboard', group: 'navigation', title: 'Dashboard', run: navRun },
    { id: 'settings-general', group: 'settings', title: 'Settings: General', run: settingsRun },
  ]
  commitCommands.current = []
  stashCommands.current = []
})

function renderPalette() {
  const onOpenSettings = vi.fn()
  const onCloseSettings = vi.fn()
  render(<CommandPalette onOpenSettings={onOpenSettings} onCloseSettings={onCloseSettings} />)
  return { onOpenSettings, onCloseSettings }
}

describe('CommandPalette', () => {
  it('renders nothing while closed', () => {
    renderPalette()
    expect(screen.queryByTestId('command-palette-input')).not.toBeInTheDocument()
  })

  it('renders input and grouped items when open', () => {
    useCommandPaletteStore.setState({ open: true })
    renderPalette()
    expect(screen.getByTestId('command-palette-input')).toBeInTheDocument()
    expect(screen.getByTestId('command-item-nav-dashboard')).toBeInTheDocument()
    expect(screen.getByTestId('command-item-settings-general')).toBeInTheDocument()
  })

  it('surfaces commit commands when present', () => {
    commitCommands.current = [
      { id: 'commit-reset-mixed', group: 'commit', title: 'Reset (mixed)', run: commitRun },
    ]
    useCommandPaletteStore.setState({ open: true })
    renderPalette()
    expect(screen.getByTestId('command-item-commit-reset-mixed')).toBeInTheDocument()
  })

  it('surfaces stash commands when present', () => {
    stashCommands.current = [
      { id: 'stash-pop', group: 'stash', title: 'Pop stash', run: vi.fn() },
    ]
    useCommandPaletteStore.setState({ open: true })
    renderPalette()
    expect(screen.getByTestId('command-item-stash-pop')).toBeInTheDocument()
  })

  it('running a non-settings command runs it, closes the palette and leaves settings', async () => {
    const user = userEvent.setup()
    useCommandPaletteStore.setState({ open: true })
    const { onCloseSettings } = renderPalette()
    await user.click(screen.getByTestId('command-item-nav-dashboard'))
    expect(navRun).toHaveBeenCalledOnce()
    expect(onCloseSettings).toHaveBeenCalledOnce()
    expect(useCommandPaletteStore.getState().open).toBe(false)
  })

  it('offers a GitHub lookup command only when the query is a commit sha', async () => {
    const user = userEvent.setup()
    useRepoUIStore.setState({ activeRepo: '/repo' })
    apiGetCommitWebUrl.mockResolvedValue('https://github.com/o/r/commit/deadbeefcafe')
    apiOpenUrl.mockResolvedValue(undefined)
    useCommandPaletteStore.setState({ open: true })
    renderPalette()

    expect(screen.queryByTestId('command-item-lookup-open-commit')).not.toBeInTheDocument()
    await user.type(screen.getByTestId('command-palette-input'), 'deadbeefcafe')

    const item = screen.getByTestId('command-item-lookup-open-commit')
    await user.click(item)
    expect(apiGetCommitWebUrl).toHaveBeenCalledWith('/repo', 'deadbeefcafe')
    await vi.waitFor(() =>
      expect(apiOpenUrl).toHaveBeenCalledWith('https://github.com/o/r/commit/deadbeefcafe')
    )
  })

  it('running a settings command does not force-close settings', async () => {
    const user = userEvent.setup()
    useCommandPaletteStore.setState({ open: true })
    const { onCloseSettings } = renderPalette()
    await user.click(screen.getByTestId('command-item-settings-general'))
    expect(settingsRun).toHaveBeenCalledOnce()
    expect(onCloseSettings).not.toHaveBeenCalled()
    expect(useCommandPaletteStore.getState().open).toBe(false)
  })
})
