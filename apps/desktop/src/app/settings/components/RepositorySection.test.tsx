import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@git-manager/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('../../../hooks/useUserThemes', () => ({ useUserThemes: () => ({ data: [] }) }))
// The default-file match-count hook hits the IPC layer; the override tests don't exercise it.
vi.mock('../../../hooks/useDefaultFileMatchCounts', () => ({
  useDefaultFileMatchCounts: () => ({}),
}))

import { RepositorySection } from './RepositorySection'
import { SettingsSearchProvider } from './settingsSearch'
import { useSettingsStore } from '../../../stores/settings.store'
import { useRepoUIStore } from '../../../stores/repoUI.store'

const INITIAL_SETTINGS = useSettingsStore.getState()

beforeEach(() => {
  vi.clearAllMocks()
  useSettingsStore.setState(INITIAL_SETTINGS, true)
  useRepoUIStore.setState({ activeRepo: null })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('RepositorySection — no repo', () => {
  it('shows a hint and no controls when no repo is active', () => {
    render(<RepositorySection category="gitflow" />)
    expect(screen.getByTestId('repository-no-repo')).toBeInTheDocument()
    expect(screen.queryByTestId('repo-default-branch-input')).not.toBeInTheDocument()
  })
})

describe('RepositorySection — appearance page', () => {
  const REPO = '/repo'
  beforeEach(() => useRepoUIStore.setState({ activeRepo: REPO }))

  it('shows the repo name and a disabled theme select while inheriting', () => {
    useRepoUIStore.setState({ activeRepo: '/home/me/my-project' })
    render(<RepositorySection category="appearance" />)
    expect(screen.getByTestId('repository-name')).toHaveTextContent('my-project')
    expect(screen.getByTestId('repo-theme-select')).toBeDisabled()
    // General-page controls are not on this page.
    expect(screen.queryByTestId('repo-commit-pattern')).not.toBeInTheDocument()
  })

  it('override seeds the theme from the global value and enables the select', async () => {
    const user = userEvent.setup()
    render(<RepositorySection category="appearance" />)
    await user.click(screen.getByTestId('repo-override-theme-override'))
    expect(useSettingsStore.getState().settings.repoOverrides[REPO]).toEqual({ theme: 'dark' })
    expect(screen.getByTestId('repo-theme-select')).toBeEnabled()
  })

  it('editing the theme select writes the override', async () => {
    const user = userEvent.setup()
    render(<RepositorySection category="appearance" />)
    await user.click(screen.getByTestId('repo-override-theme-override'))
    await user.selectOptions(screen.getByTestId('repo-theme-select'), 'dracula')
    expect(useSettingsStore.getState().settings.repoOverrides[REPO]?.theme).toBe('dracula')
  })

  it('inherit removes the theme override again', async () => {
    const user = userEvent.setup()
    useSettingsStore.getState().setRepoSetting(REPO, 'theme', 'dracula')
    render(<RepositorySection category="appearance" />)
    expect(screen.getByTestId('repo-theme-select')).toBeEnabled()
    await user.click(screen.getByTestId('repo-override-theme-inherit'))
    expect(useSettingsStore.getState().settings.repoOverrides[REPO]).toBeUndefined()
    expect(screen.getByTestId('repo-theme-select')).toBeDisabled()
  })

  it('shows terminal colour pickers disabled while inheriting, enabled once overridden', async () => {
    const user = userEvent.setup()
    render(<RepositorySection category="appearance" />)
    expect(screen.getByTestId('repo-terminal-bg')).toBeDisabled()
    expect(screen.getByTestId('repo-terminal-fg')).toBeDisabled()
    // One toggle governs both colours; overriding seeds both from the effective (global) values.
    await user.click(screen.getByTestId('repo-override-terminal-override'))
    expect(screen.getByTestId('repo-terminal-bg')).toBeEnabled()
    expect(screen.getByTestId('repo-terminal-fg')).toBeEnabled()
    expect(useSettingsStore.getState().settings.repoOverrides[REPO]?.terminalBackground).toBe(
      '#000000'
    )
    expect(useSettingsStore.getState().settings.repoOverrides[REPO]?.terminalForeground).toBe(
      '#e4e4e7'
    )
  })

  it('editing a terminal colour writes the per-repo override', async () => {
    const user = userEvent.setup()
    render(<RepositorySection category="appearance" />)
    await user.click(screen.getByTestId('repo-override-terminal-override'))
    fireEvent.change(screen.getByTestId('repo-terminal-fg'), { target: { value: '#ff8800' } })
    expect(useSettingsStore.getState().settings.repoOverrides[REPO]?.terminalForeground).toBe(
      '#ff8800'
    )
  })

  it('inherit clears both terminal-colour overrides at once', async () => {
    const user = userEvent.setup()
    useSettingsStore.getState().setRepoSetting(REPO, 'terminalBackground', '#111111')
    useSettingsStore.getState().setRepoSetting(REPO, 'terminalForeground', '#222222')
    render(<RepositorySection category="appearance" />)
    expect(screen.getByTestId('repo-terminal-bg')).toBeEnabled()
    await user.click(screen.getByTestId('repo-override-terminal-inherit'))
    expect(
      useSettingsStore.getState().settings.repoOverrides[REPO]?.terminalBackground
    ).toBeUndefined()
    expect(
      useSettingsStore.getState().settings.repoOverrides[REPO]?.terminalForeground
    ).toBeUndefined()
  })

  it('filters to only the terminal-colours setting when searching "terminal"', () => {
    render(
      <SettingsSearchProvider query="terminal">
        <RepositorySection category="appearance" />
      </SettingsSearchProvider>
    )
    const terminal = screen.getByTestId('repo-override-terminal')
    expect(terminal).toBeInTheDocument()
    // The theme override is hidden — this was the reported bug.
    expect(screen.queryByTestId('repo-override-theme')).not.toBeInTheDocument()
    // The matched word is highlighted in the label (the second reported issue).
    expect(terminal.querySelector('mark')).toHaveTextContent('terminal')
  })
})

describe('RepositorySection — GitFlow page', () => {
  const REPO = '/repo'
  beforeEach(() => useRepoUIStore.setState({ activeRepo: REPO }))

  it('shows the default branch + protected branches editors; theme/commit are on other pages', () => {
    render(<RepositorySection category="gitflow" />)
    expect(screen.getByTestId('repo-default-branch-input')).toBeInTheDocument()
    expect(screen.getByTestId('repo-protected-branches')).toBeInTheDocument()
    expect(screen.queryByTestId('repo-theme-select')).not.toBeInTheDocument()
    expect(screen.queryByTestId('repo-commit-pattern')).not.toBeInTheDocument()
  })

  it('seeds the built-in defaults when the repo has no override', () => {
    render(<RepositorySection category="gitflow" />)
    expect(screen.getByTestId('repo-default-branch-input')).toHaveValue('main')
    expect(screen.getByTestId('repo-protected-branches')).toHaveTextContent('main')
    // Displaying defaults must not itself write an override.
    expect(useSettingsStore.getState().settings.repoOverrides[REPO]).toBeUndefined()
  })

  it('editing the default branch name writes the per-repo override', async () => {
    const user = userEvent.setup()
    render(<RepositorySection category="gitflow" />)
    const input = screen.getByTestId('repo-default-branch-input')
    await user.clear(input)
    await user.type(input, 'trunk')
    expect(useSettingsStore.getState().settings.repoOverrides[REPO]?.defaultBranchName).toBe('trunk')
  })

  it('adding a protected branch writes the per-repo override (seeded from defaults)', async () => {
    const user = userEvent.setup()
    render(<RepositorySection category="gitflow" />)
    const tagInput = screen.getByTestId('repo-protected-branches').querySelector('input')!
    await user.type(tagInput, 'release{Enter}')
    expect(useSettingsStore.getState().settings.repoOverrides[REPO]?.protectedBranches).toEqual([
      'main',
      'master',
      'develop',
      'release',
    ])
  })
})

describe('RepositorySection — ai_commit page', () => {
  const REPO = '/repo'
  beforeEach(() => useRepoUIStore.setState({ activeRepo: REPO }))

  it('shows the commit-style controls disabled while inheriting; protected branches is elsewhere', () => {
    render(<RepositorySection category="ai_commit" />)
    expect(screen.getByTestId('repo-commit-instructions')).toBeDisabled()
    expect(screen.getByTestId('repo-commit-pattern')).toBeDisabled()
    expect(screen.queryByTestId('repo-protected-branches')).not.toBeInTheDocument()
  })

  it('overriding and editing the commit pattern writes the override', async () => {
    const user = userEvent.setup()
    render(<RepositorySection category="ai_commit" />)
    await user.click(screen.getByTestId('repo-override-commitPattern-override'))
    await user.type(screen.getByTestId('repo-commit-pattern'), '^x')
    expect(useSettingsStore.getState().settings.repoOverrides[REPO]?.commitPattern).toBe('^x')
  })

  it('keeps the other commit field inheriting when only one is overridden', async () => {
    const user = userEvent.setup()
    render(<RepositorySection category="ai_commit" />)
    await user.click(screen.getByTestId('repo-override-commitInstructions-override'))
    expect(screen.getByTestId('repo-commit-pattern')).toBeDisabled()
  })
})

describe('RepositorySection — worktree page', () => {
  const REPO = '/repo'
  beforeEach(() => useRepoUIStore.setState({ activeRepo: REPO }))

  it('renders the worktree default-files setting (with an add button) and no other page', () => {
    render(<RepositorySection category="worktree" />)
    expect(screen.getByTestId('repo-worktree-default-files')).toBeInTheDocument()
    expect(screen.getByTestId('worktree-df-add')).toBeInTheDocument()
    // Other pages' controls aren't present here.
    expect(screen.queryByTestId('repo-protected-branches')).not.toBeInTheDocument()
    expect(screen.queryByTestId('repo-theme-select')).not.toBeInTheDocument()
  })
})
