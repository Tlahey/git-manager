import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { useRepoSummary, useRepoOwner } = vi.hoisted(() => ({
  useRepoSummary: vi.fn(),
  useRepoOwner: vi.fn(),
}))
vi.mock('../../../hooks/useRepoSummary', () => ({ useRepoSummary }))
vi.mock('../../../hooks/useRepoOwner', () => ({ useRepoOwner }))
vi.mock('../../../api/repo.api', () => ({ apiOpenInEditor: vi.fn() }))

import { apiOpenInEditor } from '../../../api/repo.api'
import { RepoRow } from './RepoRow'
import { useRepoDataStore } from '../../../stores/repoData.store'
import { useRepoUIStore } from '../../../stores/repoUI.store'
import { useSettingsStore } from '../../../stores/settings.store'

const mockedOpenInEditor = apiOpenInEditor as unknown as ReturnType<typeof vi.fn>
const INITIAL_REPO_DATA = useRepoDataStore.getState()
const INITIAL_REPO_UI = useRepoUIStore.getState()
const INITIAL_SETTINGS = useSettingsStore.getState()

function summary(overrides: Record<string, unknown> = {}) {
  return {
    head: 'main',
    stagedCount: 0,
    unstagedCount: 0,
    untrackedCount: 0,
    conflictedCount: 0,
    aheadCount: 0,
    behindCount: 0,
    ...overrides,
  }
}

function renderRow(props: Partial<React.ComponentProps<typeof RepoRow>> = {}) {
  const defaults: React.ComponentProps<typeof RepoRow> = {
    path: '/repo/a',
    name: 'repo-a',
    isSaved: true,
    isPinned: false,
    isSelected: false,
    onToggleSelected: vi.fn(),
    onToggleReadme: vi.fn(),
    isReadmeActive: false,
    onToggleSummary: vi.fn(),
    isSummaryActive: false,
    summaryEnabled: true,
  }
  return render(<RepoRow {...defaults} {...props} />)
}

beforeEach(() => {
  vi.clearAllMocks()
  useRepoDataStore.setState(INITIAL_REPO_DATA, true)
  useRepoUIStore.setState(INITIAL_REPO_UI, true)
  useSettingsStore.setState(INITIAL_SETTINGS, true)
  useRepoSummary.mockReturnValue({ data: summary(), isLoading: false, error: undefined })
  useRepoOwner.mockReturnValue({ remote: null, url: null, isLoading: false })
})


describe('RepoRow — identity and row activation', () => {
  it('shows the repo name', () => {
    renderRow({ name: 'repo-a' })
    expect(screen.getByTestId('repo-row-name')).toHaveTextContent('repo-a')
  })

  it('reveals the full path in a tooltip when the name is hovered', async () => {
    const user = userEvent.setup()
    renderRow({ path: '/Users/antoine/Workspace/repo-a' })
    await user.hover(screen.getByTestId('repo-row-name'))
    await waitFor(() =>
      expect(screen.getByRole('tooltip')).toHaveTextContent('/Users/antoine/Workspace/repo-a')
    )
  })

  it('opens the tab when the row itself is clicked', () => {
    fireEvent.click(renderRow().container.firstElementChild!)
    expect(useRepoUIStore.getState().openTabs).toContain('/repo/a')
  })

  it('exposes the name as a focusable button so the repo opens from the keyboard', async () => {
    const user = userEvent.setup()
    renderRow()
    const nameButton = screen.getByTestId('repo-row-name')
    expect(nameButton.tagName).toBe('BUTTON')
    await user.click(nameButton)
    expect(useRepoUIStore.getState().openTabs).toContain('/repo/a')
  })

  it('does not nest interactive controls inside a button role', () => {
    const { container } = renderRow()
    expect(container.firstElementChild).not.toHaveAttribute('role', 'button')
  })
})

describe('RepoRow — owner column', () => {
  it('shows the owner parsed from the remote', () => {
    useRepoOwner.mockReturnValue({
      remote: { host: 'github.com', owner: 'Tlahey', repo: 'repo-a' },
      url: 'git@github.com:Tlahey/repo-a.git',
      isLoading: false,
    })
    renderRow()
    expect(screen.getByTestId('repo-row-owner')).toHaveTextContent('Tlahey')
  })

  it('shows a placeholder when the repo has no usable remote', () => {
    renderRow()
    expect(screen.getByTestId('repo-row-owner-empty')).toHaveTextContent('No remote')
    expect(screen.queryByTestId('repo-row-owner')).toBeNull()
  })

  it('does not query remotes for a repo that failed to open', () => {
    useRepoSummary.mockReturnValue({ data: undefined, isLoading: false, error: new Error('bad') })
    renderRow()
    expect(useRepoOwner).toHaveBeenCalledWith(null)
  })
})

describe('RepoRow — selection checkbox', () => {
  it('reports the selected state', () => {
    renderRow({ isSelected: true })
    expect(screen.getByTestId('repo-row-checkbox')).toBeChecked()
  })

  it('calls onToggleSelected without opening the tab', async () => {
    const onToggleSelected = vi.fn()
    const user = userEvent.setup()
    renderRow({ onToggleSelected })
    await user.click(screen.getByTestId('repo-row-checkbox'))
    expect(onToggleSelected).toHaveBeenCalledOnce()
    expect(useRepoUIStore.getState().openTabs).not.toContain('/repo/a')
  })
})

describe('RepoRow — favourite star', () => {
  it('hides the star for an unsaved repo', () => {
    renderRow({ isSaved: false })
    expect(screen.queryByTestId('repo-row-star')).toBeNull()
  })

  it('keeps the star hidden until hover when the repo is not a favourite', () => {
    renderRow({ isSaved: true, isPinned: false })
    const star = screen.getByTestId('repo-row-star')
    expect(star).toHaveClass('opacity-0')
    expect(star).toHaveClass('group-hover/row:opacity-100')
  })

  it('shows the star permanently, filled, when the repo is a favourite', () => {
    renderRow({ isSaved: true, isPinned: true })
    const star = screen.getByTestId('repo-row-star')
    expect(star).not.toHaveClass('opacity-0')
    expect(star.querySelector('.lucide-star')).toHaveClass('fill-amber-500')
  })

  it('toggles the pin through the store, without triggering the row-level openTab', async () => {
    useRepoDataStore.setState({ savedRepos: [{ path: '/repo/a', name: 'repo-a', pinned: false }] })
    const user = userEvent.setup()
    renderRow({ isSaved: true, isPinned: false })
    await user.click(screen.getByTestId('repo-row-star'))

    expect(useRepoDataStore.getState().savedRepos.find((r) => r.path === '/repo/a')?.pinned).toBe(
      true
    )
    expect(useRepoUIStore.getState().openTabs).not.toContain('/repo/a')
  })
})

describe('RepoRow — loading / error / summary', () => {
  it('shows a loading indicator', () => {
    useRepoSummary.mockReturnValue({ data: undefined, isLoading: true, error: undefined })
    renderRow()
    expect(screen.getByTestId('repo-row-status-loading')).toHaveTextContent('Loading')
  })

  it('shows an invalid-repo badge on error', () => {
    useRepoSummary.mockReturnValue({ data: undefined, isLoading: false, error: new Error('bad') })
    renderRow()
    expect(screen.getByTestId('repo-row-status-error')).toHaveTextContent('Invalid repository')
  })

  it('shows the branch name and a clean checkmark when there are no changes', () => {
    renderRow()
    expect(screen.getByText('main')).toBeInTheDocument()
    expect(screen.getByTestId('repo-row-clean')).toBeInTheDocument()
  })

  it('shows conflicted/staged/unstaged/untracked/ahead/behind badges', () => {
    useRepoSummary.mockReturnValue({
      data: summary({
        conflictedCount: 1,
        stagedCount: 2,
        unstagedCount: 3,
        untrackedCount: 4,
        aheadCount: 5,
        behindCount: 6,
      }),
      isLoading: false,
      error: undefined,
    })
    renderRow()
    expect(screen.getByText('!1')).toBeInTheDocument()
    expect(screen.getByText('+2')).toBeInTheDocument()
    expect(screen.getByText('~3')).toBeInTheDocument()
    expect(screen.getByText('?4')).toBeInTheDocument()
    expect(screen.getByText('↑5')).toBeInTheDocument()
    expect(screen.getByText('↓6')).toBeInTheDocument()
    expect(screen.queryByTestId('repo-row-clean')).toBeNull()
  })
})

describe('RepoRow — open in editor', () => {
  function withEditorConfigured(command = '/Applications/Cursor.app') {
    useSettingsStore.setState({
      settings: {
        ...INITIAL_SETTINGS.settings,
        git: { ...INITIAL_SETTINGS.settings.git, externalEditorCommand: command },
      },
    })
  }

  it('opens the configured editor with the repo path', async () => {
    withEditorConfigured('/Applications/Cursor.app')
    mockedOpenInEditor.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderRow()
    await user.click(screen.getByTestId('repo-row-editor-button'))
    expect(mockedOpenInEditor).toHaveBeenCalledWith('/repo/a', '/Applications/Cursor.app')
  })

  it('names the configured editor in the button label', () => {
    withEditorConfigured('/Applications/Cursor.app')
    renderRow()
    expect(screen.getByTestId('repo-row-editor-button')).toHaveAccessibleName(
      'Open in external editor — Cursor'
    )
  })

  it('logs an error instead of throwing when the editor fails to launch', async () => {
    withEditorConfigured()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockedOpenInEditor.mockRejectedValue(new Error('editor not found'))
    const user = userEvent.setup()
    renderRow()
    await user.click(screen.getByTestId('repo-row-editor-button'))
    expect(consoleError).toHaveBeenCalled()
  })

  it('hides the editor button when the repo errored', () => {
    withEditorConfigured()
    useRepoSummary.mockReturnValue({ data: undefined, isLoading: false, error: new Error('bad') })
    renderRow()
    expect(screen.queryByTestId('repo-row-editor-button')).toBeNull()
  })

  it('hides the editor button when no editor app is configured', () => {
    renderRow()
    expect(screen.queryByTestId('repo-row-editor-button')).toBeNull()
  })
})

describe('RepoRow — readme toggle', () => {
  it('calls onToggleReadme without opening the tab', async () => {
    const onToggleReadme = vi.fn()
    const user = userEvent.setup()
    renderRow({ onToggleReadme })
    await user.click(screen.getByTestId('repo-row-readme-button'))
    expect(onToggleReadme).toHaveBeenCalledOnce()
    expect(useRepoUIStore.getState().openTabs).not.toContain('/repo/a')
  })

  it('marks the readme button pressed when its panel is open', () => {
    renderRow({ isReadmeActive: true })
    expect(screen.getByTestId('repo-row-readme-button')).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('RepoRow — daily-summary toggle', () => {
  it('calls onToggleSummary without opening the tab', async () => {
    const onToggleSummary = vi.fn()
    const user = userEvent.setup()
    renderRow({ onToggleSummary })
    await user.click(screen.getByTestId('repo-summary-button'))
    expect(onToggleSummary).toHaveBeenCalledOnce()
    expect(useRepoUIStore.getState().openTabs).not.toContain('/repo/a')
  })

  it('hides the summary button when the feature is disabled', () => {
    renderRow({ summaryEnabled: false })
    expect(screen.queryByTestId('repo-summary-button')).toBeNull()
  })

  it('hides the summary button when the repo errored', () => {
    useRepoSummary.mockReturnValue({ data: undefined, isLoading: false, error: new Error('bad') })
    renderRow()
    expect(screen.queryByTestId('repo-summary-button')).toBeNull()
  })
})

describe('RepoRow — open/close tab action', () => {
  it('opens the tab when the repo has none', async () => {
    const user = userEvent.setup()
    renderRow()
    const button = screen.getByTestId('repo-row-tab-button')
    expect(button).toHaveAccessibleName('Open in a tab')
    await user.click(button)
    expect(useRepoUIStore.getState().openTabs).toContain('/repo/a')
  })

  it('closes the tab when the repo already has one', async () => {
    useRepoUIStore.setState({ openTabs: ['/repo/a'] })
    const user = userEvent.setup()
    renderRow()
    const button = screen.getByTestId('repo-row-tab-button')
    expect(button).toHaveAccessibleName('Close tab')
    await user.click(button)
    expect(useRepoUIStore.getState().openTabs).not.toContain('/repo/a')
  })
})
