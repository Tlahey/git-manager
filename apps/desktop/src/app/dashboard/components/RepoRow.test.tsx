import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@git-manager/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

const { useRepoSummary } = vi.hoisted(() => ({ useRepoSummary: vi.fn() }))
vi.mock('../../../hooks/useRepoSummary', () => ({ useRepoSummary }))
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

function summary(overrides: Partial<ReturnType<typeof useRepoSummary>['data']> = {}) {
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
  return render(
    <RepoRow
      path="/repo/a"
      name="repo-a"
      isSaved
      isPinned={false}
      onToggleReadme={vi.fn()}
      isReadmeActive={false}
      onToggleSummary={vi.fn()}
      isSummaryActive={false}
      summaryEnabled
      {...props}
    />
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useRepoDataStore.setState(INITIAL_REPO_DATA, true)
  useRepoUIStore.setState(INITIAL_REPO_UI, true)
  useSettingsStore.setState(INITIAL_SETTINGS, true)
  useRepoSummary.mockReturnValue({ data: summary(), isLoading: false, error: undefined })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('RepoRow — identity and row click', () => {
  it('shows the name and path', () => {
    renderRow({ name: 'repo-a', path: '/repo/a' })
    expect(screen.getByText('repo-a')).toBeInTheDocument()
    expect(screen.getByText('/repo/a')).toBeInTheDocument()
  })

  it('opens the tab when the row itself is clicked', () => {
    const { container } = renderRow()
    fireEvent.click(container.firstElementChild!)
    expect(useRepoUIStore.getState().openTabs).toContain('/repo/a')
  })
})

describe('RepoRow — pin star', () => {
  it('hides the star for an unsaved repo', () => {
    const { container } = renderRow({ isSaved: false })
    expect(container.querySelector('.lucide-star')).toBeFalsy()
  })

  it('shows a filled star when pinned, hollow otherwise', () => {
    const { container, rerender } = renderRow({ isSaved: true, isPinned: false })
    expect(container.querySelector('.lucide-star')).not.toHaveClass('fill-amber-500')

    rerender(
      <RepoRow
        path="/repo/a"
        name="repo-a"
        isSaved
        isPinned
        onToggleReadme={vi.fn()}
        isReadmeActive={false}
        onToggleSummary={vi.fn()}
        isSummaryActive={false}
        summaryEnabled
      />
    )
    expect(container.querySelector('.lucide-star')).toHaveClass('fill-amber-500')
  })

  it('toggles the pin through the store, without triggering the row-level openTab', async () => {
    useRepoDataStore.setState({ savedRepos: [{ path: '/repo/a', name: 'repo-a', pinned: false }] })
    const user = userEvent.setup()
    const { container } = renderRow({ isSaved: true, isPinned: false })
    const starButton = container.querySelector('.lucide-star')!.closest('button')!
    await user.click(starButton)

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
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('shows an invalid-repo badge on error, and hides the editor/readme buttons', () => {
    useRepoSummary.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('bad repo'),
    })
    renderRow()
    expect(screen.getByText('dashboard.invalidRepo')).toBeInTheDocument()
  })

  it('shows the branch name and a clean checkmark when there are no changes', () => {
    const { container } = renderRow()
    expect(screen.getByText('main')).toBeInTheDocument()
    expect(container.querySelector('.lucide-circle-check')).toBeTruthy()
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
  })
})

describe('RepoRow — open in editor', () => {
  function withEditorConfigured(command = '/Applications/Cursor.app') {
    useSettingsStore.setState({
      settings: {
        ...INITIAL_SETTINGS.settings,
        git: {
          ...INITIAL_SETTINGS.settings.git,
          externalEditorCommand: command,
        },
      },
    })
  }

  it('opens the configured editor with the repo path', async () => {
    withEditorConfigured('/Applications/Cursor.app')
    mockedOpenInEditor.mockResolvedValue(undefined)
    const user = userEvent.setup()
    const { container } = renderRow()
    const editorButton = container.querySelector('.lucide-code')!.closest('button')!
    await user.click(editorButton)
    expect(mockedOpenInEditor).toHaveBeenCalledWith('/repo/a', '/Applications/Cursor.app')
  })

  it('logs an error instead of throwing when the editor fails to launch', async () => {
    withEditorConfigured()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockedOpenInEditor.mockRejectedValue(new Error('editor not found'))
    const user = userEvent.setup()
    const { container } = renderRow()
    const editorButton = container.querySelector('.lucide-code')!.closest('button')!
    await user.click(editorButton)
    expect(consoleError).toHaveBeenCalled()
  })

  it('hides the editor button when the repo errored', () => {
    withEditorConfigured()
    useRepoSummary.mockReturnValue({ data: undefined, isLoading: false, error: new Error('bad') })
    const { container } = renderRow()
    expect(container.querySelector('.lucide-code')).toBeFalsy()
  })

  it('hides the editor button when no editor app is configured', () => {
    const { container } = renderRow()
    expect(container.querySelector('.lucide-code')).toBeFalsy()
  })
})

describe('RepoRow — readme toggle', () => {
  it('calls onToggleReadme without opening the tab', async () => {
    const onToggleReadme = vi.fn()
    const user = userEvent.setup()
    const { container } = renderRow({ onToggleReadme })
    const readmeButton = container.querySelector('.lucide-book-open')!.closest('button')!
    await user.click(readmeButton)
    expect(onToggleReadme).toHaveBeenCalledOnce()
    expect(useRepoUIStore.getState().openTabs).not.toContain('/repo/a')
  })

  it('applies active styling when isReadmeActive', () => {
    const { container } = renderRow({ isReadmeActive: true })
    const readmeButton = container.querySelector('.lucide-book-open')!.closest('button')!
    expect(readmeButton).toHaveClass('text-primary')
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
  it('shows a Plus button that opens the tab when not already open', async () => {
    const user = userEvent.setup()
    const { container } = renderRow()
    const addButton = container.querySelector('.lucide-plus')!.closest('button')!
    await user.click(addButton)
    expect(useRepoUIStore.getState().openTabs).toContain('/repo/a')
  })

  it('shows an X button that closes the tab when already open', async () => {
    useRepoUIStore.setState({ openTabs: ['/repo/a'] })
    const user = userEvent.setup()
    const { container } = renderRow()
    const closeButton = container.querySelector('.lucide-x')!.closest('button')!
    await user.click(closeButton)
    expect(useRepoUIStore.getState().openTabs).not.toContain('/repo/a')
  })
})
