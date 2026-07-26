import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../../../api/repo.api', () => ({ apiOpenInEditor: vi.fn() }))

import { apiOpenInEditor } from '../../../api/repo.api'
import { RepoRowActions } from './RepoRowActions'
import { useSettingsStore } from '../../../stores/settings.store'

const mockedOpenInEditor = apiOpenInEditor as unknown as ReturnType<typeof vi.fn>
const INITIAL_SETTINGS = useSettingsStore.getState()

function withEditor(command: string) {
  useSettingsStore.setState({
    settings: {
      ...INITIAL_SETTINGS.settings,
      git: { ...INITIAL_SETTINGS.settings.git, externalEditorCommand: command },
    },
  })
}

function renderActions(props: Partial<React.ComponentProps<typeof RepoRowActions>> = {}) {
  const defaults: React.ComponentProps<typeof RepoRowActions> = {
    path: '/repo/a',
    hasError: false,
    isOpenInTab: false,
    onOpenTab: vi.fn(),
    onCloseTab: vi.fn(),
    onToggleReadme: vi.fn(),
    isReadmeActive: false,
    onToggleSummary: vi.fn(),
    isSummaryActive: false,
    summaryEnabled: true,
    hasFreshSummary: false,
  }
  const merged = { ...defaults, ...props }
  return { ...render(<RepoRowActions {...merged} />), props: merged }
}

beforeEach(() => {
  vi.clearAllMocks()
  useSettingsStore.setState(INITIAL_SETTINGS, true)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('RepoRowActions — editor button', () => {
  it('is hidden when no editor is configured', () => {
    renderActions()
    expect(screen.queryByTestId('repo-row-editor-button')).toBeNull()
  })

  it('strips the .app suffix from the editor name in its label', () => {
    withEditor('/Applications/Visual Studio Code.app')
    renderActions()
    expect(screen.getByTestId('repo-row-editor-button')).toHaveAccessibleName(
      'Open in external editor — Visual Studio Code'
    )
  })

  it('launches the configured editor for the repo path', async () => {
    withEditor('/usr/local/bin/nvim')
    mockedOpenInEditor.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderActions({ path: '/repo/z' })
    await user.click(screen.getByTestId('repo-row-editor-button'))
    expect(mockedOpenInEditor).toHaveBeenCalledWith('/repo/z', '/usr/local/bin/nvim')
  })

  it('is hidden when the repo failed to open', () => {
    withEditor('/usr/local/bin/nvim')
    renderActions({ hasError: true })
    expect(screen.queryByTestId('repo-row-editor-button')).toBeNull()
  })
})

describe('RepoRowActions — briefing and readme', () => {
  it('hides the briefing button when the feature is off', () => {
    renderActions({ summaryEnabled: false })
    expect(screen.queryByTestId('repo-summary-button')).toBeNull()
  })

  it('marks the briefing button pressed when its panel is open', () => {
    renderActions({ isSummaryActive: true })
    expect(screen.getByTestId('repo-summary-button')).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows a freshness dot only when a briefing is ready and not already open', () => {
    const { unmount } = renderActions({ hasFreshSummary: true })
    expect(screen.getByTestId('repo-summary-button').querySelector('.bg-emerald-500')).toBeTruthy()
    unmount()

    renderActions({ hasFreshSummary: true, isSummaryActive: true })
    expect(screen.getByTestId('repo-summary-button').querySelector('.bg-emerald-500')).toBeFalsy()
  })

  it('toggles the readme panel', async () => {
    const user = userEvent.setup()
    const { props } = renderActions()
    await user.click(screen.getByTestId('repo-row-readme-button'))
    expect(props.onToggleReadme).toHaveBeenCalledOnce()
  })

  it('hides both panels buttons when the repo failed to open', () => {
    renderActions({ hasError: true })
    expect(screen.queryByTestId('repo-summary-button')).toBeNull()
    expect(screen.queryByTestId('repo-row-readme-button')).toBeNull()
  })
})

describe('RepoRowActions — tab button', () => {
  it('offers to open a tab when the repo has none', async () => {
    const user = userEvent.setup()
    const { props } = renderActions({ isOpenInTab: false })
    const button = screen.getByTestId('repo-row-tab-button')
    expect(button).toHaveAccessibleName('Open in a tab')
    await user.click(button)
    expect(props.onOpenTab).toHaveBeenCalledOnce()
    expect(props.onCloseTab).not.toHaveBeenCalled()
  })

  it('offers to close the tab when the repo already has one', async () => {
    const user = userEvent.setup()
    const { props } = renderActions({ isOpenInTab: true })
    const button = screen.getByTestId('repo-row-tab-button')
    expect(button).toHaveAccessibleName('Close tab')
    await user.click(button)
    expect(props.onCloseTab).toHaveBeenCalledOnce()
    expect(props.onOpenTab).not.toHaveBeenCalled()
  })

  it('stays available even when the repo failed to open, so a broken tab can be closed', () => {
    renderActions({ hasError: true, isOpenInTab: true })
    expect(screen.getByTestId('repo-row-tab-button')).toBeInTheDocument()
  })
})
