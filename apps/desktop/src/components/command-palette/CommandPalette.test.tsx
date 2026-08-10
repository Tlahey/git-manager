import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PaletteCommand } from './commands/types'

vi.mock('@git-manager/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

// Fake cmdk primitives — cmdk's internal filtering/keyboard handling isn't what we're testing here,
// and it's brittle in jsdom (same rationale as the Monaco fake). We test the palette's own wiring:
// grouping, testids, and the run → close/onCloseSettings behaviour.
vi.mock('@git-manager/ui', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
  CommandDialog: ({
    open,
    children,
    ...props
  }: {
    open: boolean
    children: React.ReactNode
    filter?: (value: string, search: string, keywords?: string[]) => number
  }) => {
    dialogProps.current = props
    return open ? <div data-testid="fake-command-dialog">{children}</div> : null
  },
  // Bridge cmdk's controlled `value`/`onValueChange` to a native input so tests can type.
  CommandInput: (props: {
    value?: string
    onValueChange?: (v: string) => void
    onKeyDown?: (e: React.KeyboardEvent) => void
    'data-testid'?: string
    placeholder?: string
  }) => (
    <input
      data-testid={props['data-testid']}
      placeholder={props.placeholder}
      value={props.value ?? ''}
      onChange={(e) => props.onValueChange?.(e.target.value)}
      onKeyDown={props.onKeyDown}
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

// The fake dialog below doesn't filter — cmdk's job — so the scorer the palette hands it is
// captured here and exercised directly instead.
const { dialogProps, globalCommands, commitCommands, stashCommands, refCommands } = vi.hoisted(
  () => ({
    dialogProps: { current: {} as { filter?: (v: string, s: string, k?: string[]) => number } },
    globalCommands: { current: [] as PaletteCommand[] },
    commitCommands: { current: [] as PaletteCommand[] },
    stashCommands: { current: [] as PaletteCommand[] },
    refCommands: { current: [] as PaletteCommand[] },
  })
)
vi.mock('./commands/useGlobalCommands', () => ({ useGlobalCommands: () => globalCommands.current }))
vi.mock('./commands/useCommitCommands', () => ({ useCommitCommands: () => commitCommands.current }))
vi.mock('./commands/useStashCommands', () => ({ useStashCommands: () => stashCommands.current }))
vi.mock('./commands/useRefCommands', () => ({ useRefCommands: () => refCommands.current }))

import { CommandPalette } from './CommandPalette'
import { useCommandPaletteStore } from '../../stores/commandPalette.store'
import { useRepoUIStore } from '../../stores/repoUI.store'

const navRun = vi.fn()
const settingsRun = vi.fn()
const commitRun = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  useCommandPaletteStore.setState({ open: false, mode: 'all', refPicker: null })
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
  const onOpenActivityLogs = vi.fn()
  render(
    <CommandPalette
      onOpenSettings={onOpenSettings}
      onCloseSettings={onCloseSettings}
      onOpenActivityLogs={onOpenActivityLogs}
    />
  )
  return { onOpenSettings, onCloseSettings, onOpenActivityLogs }
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
    stashCommands.current = [{ id: 'stash-pop', group: 'stash', title: 'Pop stash', run: vi.fn() }]
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

  it('offers a focus-commit lookup only when the query is a commit sha, and hands it to the graph', async () => {
    const user = userEvent.setup()
    useRepoUIStore.setState({ activeRepo: '/repo', pendingGraphSelection: null })
    useCommandPaletteStore.setState({ open: true })
    renderPalette()

    expect(screen.queryByTestId('command-item-lookup-focus-commit')).not.toBeInTheDocument()
    await user.type(screen.getByTestId('command-palette-input'), 'deadbeefcafe')

    const item = screen.getByTestId('command-item-lookup-focus-commit')
    await user.click(item)
    // The SHA is published for GitGraph to resolve, and the palette closes.
    expect(useRepoUIStore.getState().pendingGraphSelection).toBe('deadbeefcafe')
    expect(useCommandPaletteStore.getState().open).toBe(false)
  })

  it('does not offer a focus-commit lookup for a non-sha query', async () => {
    const user = userEvent.setup()
    useRepoUIStore.setState({ activeRepo: '/repo' })
    useCommandPaletteStore.setState({ open: true })
    renderPalette()

    await user.type(screen.getByTestId('command-palette-input'), 'not a sha')
    expect(screen.queryByTestId('command-item-lookup-focus-commit')).not.toBeInTheDocument()
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

// A branch verb is picked before its branch (see `RefPickerStep`): running the verb narrows the
// palette instead of closing it, and the second screen is that verb's branches and nothing else.
describe('CommandPalette — the branch picker step', () => {
  const verbRun = vi.fn()

  beforeEach(() => {
    refCommands.current = [
      { id: 'ref-merge', group: 'ref', title: 'Merge a branch…', keepOpen: true, run: verbRun },
    ]
  })

  it('a keepOpen command runs, clears the query and leaves the palette open', async () => {
    const user = userEvent.setup()
    useCommandPaletteStore.setState({ open: true })
    const { onCloseSettings } = renderPalette()

    await user.type(screen.getByTestId('command-palette-input'), 'mer')
    await user.click(screen.getByTestId('command-item-ref-merge'))

    expect(verbRun).toHaveBeenCalledOnce()
    expect(useCommandPaletteStore.getState().open).toBe(true)
    expect(screen.getByTestId('command-palette-input')).toHaveValue('')
    // It acted on nothing, so there is no result to go back to the main view for.
    expect(onCloseSettings).not.toHaveBeenCalled()
  })

  it('shows the picked verb as the heading and drops every other group', () => {
    refCommands.current = [{ id: 'ref-pick-merge-feat', group: 'ref', title: 'feat', run: vi.fn() }]
    useCommandPaletteStore.setState({
      open: true,
      refPicker: { verb: 'merge', label: 'Merge a branch into main…' },
    })
    renderPalette()

    expect(screen.getByTestId('command-item-ref-pick-merge-feat')).toBeInTheDocument()
    expect(screen.queryByTestId('command-item-nav-dashboard')).not.toBeInTheDocument()
    expect(document.querySelector('[data-heading]')).toHaveAttribute(
      'data-heading',
      'Merge a branch into main…'
    )
  })

  it.each([['{Escape}'], ['{Backspace}']])(
    '%s on an empty query leaves the picker',
    async (key) => {
      const user = userEvent.setup()
      useCommandPaletteStore.setState({
        open: true,
        refPicker: { verb: 'merge', label: 'Merge a branch into main…' },
      })
      renderPalette()

      await user.type(screen.getByTestId('command-palette-input'), key)

      expect(useCommandPaletteStore.getState().refPicker).toBeNull()
      // Back one step, not out: the palette is still open on the full list.
      expect(useCommandPaletteStore.getState().open).toBe(true)
      expect(screen.getByTestId('command-item-nav-dashboard')).toBeInTheDocument()
    }
  )

  // A row marks the part of itself that answered the query (`highlight`), which is what makes a
  // long list readable at a glance.
  it('marks the query inside the title of a row that asks for it', () => {
    refCommands.current = [
      {
        id: 'ref-pick-checkout-a',
        group: 'ref',
        title: 'feature/login',
        highlight: { query: 'log' },
        run: vi.fn(),
      },
      {
        id: 'ref-pick-checkout-b',
        group: 'ref',
        title: 'release/2026',
        highlight: { query: 'log' },
        run: vi.fn(),
      },
    ]
    useCommandPaletteStore.setState({ open: true })
    renderPalette()

    const row = screen.getByTestId('command-item-ref-pick-checkout-a')
    expect(row.querySelector('mark')).toHaveTextContent('log')
    // The name is still whole — the row reads "feature/login", split for styling only.
    expect(row).toHaveTextContent('feature/login')
    // A row the query doesn't touch keeps its label unmarked rather than guessing at a match. (In
    // the real dialog cmdk's filter would have dropped it; the fake below doesn't filter.)
    expect(screen.getByTestId('command-item-ref-pick-checkout-b').querySelector('mark')).toBeNull()
  })

  // The row spells out `checkout ada-boost`, but the verb is the half already settled — every row
  // in the list repeats it — and `from` keeps the marking off it.
  it('marks inside the branch alone, wherever the match lands in it', () => {
    refCommands.current = [
      {
        id: 'ref-run-checkout-a',
        group: 'ref',
        title: 'checkout ada-boost',
        // "boost" sits in the middle of the branch and nowhere near the verb.
        highlight: { query: 'boost', from: 'checkout '.length },
        run: vi.fn(),
      },
    ]
    useCommandPaletteStore.setState({ open: true })
    renderPalette()

    const marks = screen.getByTestId('command-item-ref-run-checkout-a').querySelectorAll('mark')
    expect([...marks].map((m) => m.textContent)).toEqual(['boost'])
  })

  // Typing `checkout ou` must not light up the `ou` of "checkout" in every row.
  it('never marks the verb, even when the argument occurs in it', () => {
    refCommands.current = [
      {
        id: 'ref-run-checkout-a',
        group: 'ref',
        title: 'checkout routing',
        highlight: { query: 'ou', from: 'checkout '.length },
        run: vi.fn(),
      },
    ]
    useCommandPaletteStore.setState({ open: true })
    renderPalette()

    const marks = screen.getByTestId('command-item-ref-run-checkout-a').querySelectorAll('mark')
    expect([...marks].map((m) => m.textContent)).toEqual(['ou'])
    expect(marks[0]!.previousSibling?.textContent).toBe('r')
  })

  // The bug this replaced: cmdk's own scorer accepted any subsequence, so a branch with a stray a,
  // d and a scattered through it was "found" while the one actually named was not.
  it('hands cmdk a scorer that requires the letters as a group', () => {
    useCommandPaletteStore.setState({ open: true })
    renderPalette()

    const filter = dialogProps.current.filter!
    expect(filter('checkout ada-boost', 'checkout ada')).toBeGreaterThan(0)
    expect(filter('feature/dashboard', 'ada')).toBe(0)
  })

  // A sentence-length title doesn't opt in: a fuzzy match would speckle it with single letters.
  it('leaves ordinary command titles unhighlighted', async () => {
    const user = userEvent.setup()
    useCommandPaletteStore.setState({ open: true })
    renderPalette()

    await user.type(screen.getByTestId('command-palette-input'), 'das')

    expect(screen.getByTestId('command-item-nav-dashboard').querySelector('mark')).toBeNull()
  })

  // Backspace is how you erase what you typed; it only walks back once there is nothing left.
  it('backspace with a query in the box edits the query instead', async () => {
    const user = userEvent.setup()
    useCommandPaletteStore.setState({
      open: true,
      refPicker: { verb: 'merge', label: 'Merge a branch into main…' },
    })
    renderPalette()

    const input = screen.getByTestId('command-palette-input')
    await user.type(input, 'fe{Backspace}')

    expect(useCommandPaletteStore.getState().refPicker).not.toBeNull()
    expect(input).toHaveValue('f')
  })
})
