import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { GitStatus } from '@git-manager/git-types'
import type { ProcessedFileItem } from './CommitFileList'

vi.mock('@git-manager/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

const { useWipCommitPanel } = vi.hoisted(() => ({ useWipCommitPanel: vi.fn() }))
vi.mock('../../../hooks/useWipCommitPanel', () => ({ useWipCommitPanel }))

// The publish-PR button has its own flow (query client, SWR, GitHub) and its own test — stub it here
// so this panel test stays focused on the commit form.
vi.mock('../pr/PrPublishButton', () => ({ PrPublishButton: () => null }))

import { WipStagingPanel } from './WipStagingPanel'
import { useSettingsStore } from '../../../stores/settings.store'

const INITIAL_SETTINGS = useSettingsStore.getState()

function setAiEnabled(enabled: boolean) {
  useSettingsStore.setState((s) => ({
    settings: { ...s.settings, ai: { ...s.settings.ai, enabled } },
  }))
}

function panelState(overrides: Partial<ReturnType<typeof useWipCommitPanel>> = {}) {
  return {
    activeTab: 'commit' as const,
    setActiveTab: vi.fn(),
    isAmend: false,
    setIsAmend: vi.fn(),
    handleToggleAmend: vi.fn(),
    stashMessage: '',
    setStashMessage: vi.fn(),
    includeUntracked: true,
    setIncludeUntracked: vi.fn(),
    isStashing: false,
    handleStash: vi.fn(),
    batchMode: false,
    setBatchMode: vi.fn(),
    wipBatches: {},
    batchMessages: {},
    setBatchMessages: vi.fn(),
    batchGenerating: {},
    generateMessageForBatch: vi.fn(),
    commitBatch: vi.fn(),
    commitMessage: '',
    setCommitMessage: vi.fn(),
    isCommitting: false,
    handleCommitWip: vi.fn(),
    handleGenerateCommitMessage: vi.fn(),
    isGenerating: false,
    commitValidation: null,
    history: [],
    historyOpen: false,
    setHistoryOpen: vi.fn(),
    ...overrides,
  }
}

function gitStatus(overrides: Partial<GitStatus> = {}): GitStatus {
  return { staged: [], unstaged: [], untracked: [], conflicted: [], ...overrides }
}

function file(overrides: Partial<ProcessedFileItem> = {}): ProcessedFileItem {
  return { path: 'src/a.ts', status: 'modified', staged: true, ...overrides }
}

beforeEach(() => {
  vi.clearAllMocks()
  useSettingsStore.setState(INITIAL_SETTINGS, true)
  useWipCommitPanel.mockReturnValue(panelState())
})

function renderPanel(props: Partial<React.ComponentProps<typeof WipStagingPanel>> = {}) {
  return render(
    <WipStagingPanel repoPath="/repo" gitStatus={gitStatus()} allWipChanges={[]} {...props} />
  )
}

describe('WipStagingPanel — mode toggle', () => {
  it('shows the batch-commit label and switches to the "back" label in batch mode', () => {
    const { rerender } = renderPanel()
    expect(screen.getByText('commitDetails.batchCommit.title')).toBeInTheDocument()

    useWipCommitPanel.mockReturnValue(panelState({ batchMode: true }))
    rerender(<WipStagingPanel repoPath="/repo" gitStatus={gitStatus()} allWipChanges={[]} />)
    expect(screen.getByText('← Retour au commit global')).toBeInTheDocument()
  })

  it('toggles batch mode when clicked', async () => {
    const setBatchMode = vi.fn()
    useWipCommitPanel.mockReturnValue(panelState({ setBatchMode }))
    const user = userEvent.setup()
    renderPanel()
    await user.click(screen.getByText('commitDetails.batchCommit.title'))
    expect(setBatchMode).toHaveBeenCalledOnce()
  })
})

describe('WipStagingPanel — tabs (Commit & Stash)', () => {
  it('switches tabs when tab buttons are clicked', async () => {
    const setActiveTab = vi.fn()
    useWipCommitPanel.mockReturnValue(panelState({ setActiveTab }))
    const user = userEvent.setup()
    renderPanel()

    await user.click(screen.getByTestId('tab-stash'))
    expect(setActiveTab).toHaveBeenCalledWith('stash')
  })

  it('renders stash inputs when stash tab is active', async () => {
    const handleStash = vi.fn()
    useWipCommitPanel.mockReturnValue(
      panelState({
        activeTab: 'stash',
        stashMessage: 'wip stash',
        handleStash,
      })
    )
    renderPanel({ gitStatus: gitStatus({ unstaged: [{ path: 'a.ts', status: 'modified' }] }) })

    expect(screen.getByTestId('stash-message-input')).toHaveValue('wip stash')
    expect(screen.getByTestId('stash-untracked-checkbox')).toBeInTheDocument()
    expect(screen.getByTestId('stash-submit-button')).toBeEnabled()

    const user = userEvent.setup()
    await user.click(screen.getByTestId('stash-submit-button'))
    expect(handleStash).toHaveBeenCalledOnce()
  })
})


describe('WipStagingPanel — classic commit form', () => {
  it('binds the commit message textarea and disables it while generating', () => {
    useWipCommitPanel.mockReturnValue(
      panelState({ commitMessage: 'my message', isGenerating: true })
    )
    renderPanel()
    expect(screen.getByPlaceholderText('commit.placeholder')).toHaveValue('my message')
    expect(screen.getByPlaceholderText('commit.placeholder')).toBeDisabled()
  })

  it('disables the generate button when there are no staged files and it is not already generating', () => {
    renderPanel({ gitStatus: gitStatus({ staged: [] }) })
    expect(screen.getByText('commit.generate').closest('button')).toBeDisabled()
  })

  it('enables the generate button once files are staged', () => {
    renderPanel({ gitStatus: gitStatus({ staged: [{ path: 'a', status: 'modified' }] }) })
    expect(screen.getByText('commit.generate').closest('button')).toBeEnabled()
  })

  it('shows a stop control while generating, and calls the handler either way', async () => {
    const handleGenerateCommitMessage = vi.fn()
    useWipCommitPanel.mockReturnValue(
      panelState({ isGenerating: true, handleGenerateCommitMessage })
    )
    const user = userEvent.setup()
    renderPanel()
    expect(screen.getByText('commit.stop')).toBeInTheDocument()
    await user.click(screen.getByText('commit.stop'))
    expect(handleGenerateCommitMessage).toHaveBeenCalledOnce()
  })

  it('toggles the history dropdown', async () => {
    const setHistoryOpen = vi.fn()
    useWipCommitPanel.mockReturnValue(panelState({ setHistoryOpen }))
    const user = userEvent.setup()
    renderPanel()
    await user.click(screen.getByTitle('commit.history'))
    expect(setHistoryOpen).toHaveBeenCalledOnce()
  })

  it('shows an empty message when history is open with no entries', () => {
    useWipCommitPanel.mockReturnValue(panelState({ historyOpen: true, history: [] }))
    renderPanel()
    expect(screen.getByText('commit.historyEmpty')).toBeInTheDocument()
  })

  it('lists history entries and selects one into the commit message', async () => {
    const setCommitMessage = vi.fn()
    const setHistoryOpen = vi.fn()
    useWipCommitPanel.mockReturnValue(
      panelState({
        historyOpen: true,
        history: ['fix: old bug', 'feat: thing'],
        setCommitMessage,
        setHistoryOpen,
      })
    )
    const user = userEvent.setup()
    renderPanel()
    await user.click(screen.getByText('fix: old bug'))
    expect(setCommitMessage).toHaveBeenCalledWith('fix: old bug')
    expect(setHistoryOpen).toHaveBeenCalledWith(false)
  })

  it('disables commit when nothing is staged, the message is blank, or a commit is in progress', () => {
    const { rerender } = renderPanel({ gitStatus: gitStatus({ staged: [] }) })
    expect(screen.getByText('commit.commit').closest('button')).toBeDisabled()

    useWipCommitPanel.mockReturnValue(panelState({ commitMessage: '   ' }))
    rerender(
      <WipStagingPanel
        repoPath="/repo"
        gitStatus={gitStatus({ staged: [{ path: 'a', status: 'modified' }] })}
        allWipChanges={[]}
      />
    )
    expect(screen.getByText('commit.commit').closest('button')).toBeDisabled()

    useWipCommitPanel.mockReturnValue(panelState({ commitMessage: 'ok', isCommitting: true }))
    rerender(
      <WipStagingPanel
        repoPath="/repo"
        gitStatus={gitStatus({ staged: [{ path: 'a', status: 'modified' }] })}
        allWipChanges={[]}
      />
    )
    expect(screen.getByText('commit.commit').closest('button')).toBeDisabled()
  })

  it('commits when enabled', async () => {
    const handleCommitWip = vi.fn()
    useWipCommitPanel.mockReturnValue(panelState({ commitMessage: 'ok', handleCommitWip }))
    const user = userEvent.setup()
    renderPanel({ gitStatus: gitStatus({ staged: [{ path: 'a', status: 'modified' }] }) })
    await user.click(screen.getByText('commit.commit'))
    expect(handleCommitWip).toHaveBeenCalledOnce()
  })
})

describe('WipStagingPanel — AI gating', () => {
  it('shows the AI generate + batch buttons when AI is enabled (default)', () => {
    renderPanel()
    expect(screen.getByTestId('commit-generate-button')).toBeInTheDocument()
    expect(screen.getByTestId('ai-batch-generate-button')).toBeInTheDocument()
  })

  it('hides the AI buttons when AI is disabled, keeping commit + history', () => {
    setAiEnabled(false)
    renderPanel()
    expect(screen.queryByTestId('commit-generate-button')).not.toBeInTheDocument()
    expect(screen.queryByTestId('ai-batch-generate-button')).not.toBeInTheDocument()
    // Non-AI controls remain.
    expect(screen.getByTestId('commit-button')).toBeInTheDocument()
    expect(screen.getByTestId('commit-history-button')).toBeInTheDocument()
  })
})

describe('WipStagingPanel — batch mode', () => {
  beforeEach(() => {
    useWipCommitPanel.mockReturnValue(
      panelState({
        batchMode: true,
        wipBatches: { auth: [file({ path: 'src/auth/login.ts' }), file({ path: 'readme.md' })] },
        batchMessages: { auth: 'auth message' },
        batchGenerating: { auth: false },
      })
    )
  })

  it('renders a group with its file count and file rows (with directory split)', () => {
    renderPanel()
    expect(screen.getByText('/auth')).toBeInTheDocument()
    expect(screen.getByText('2 file(s)')).toBeInTheDocument()
    expect(screen.getByText('src/auth/')).toBeInTheDocument()
    expect(screen.getByText('login.ts')).toBeInTheDocument()
    expect(screen.getByText('readme.md')).toBeInTheDocument()
  })

  it('binds the per-group message textarea', () => {
    renderPanel()
    expect(screen.getByPlaceholderText('commitDetails.batchCommit.placeholder')).toHaveValue(
      'auth message'
    )
  })

  it('generates a message for the batch when clicked', async () => {
    const generateMessageForBatch = vi.fn()
    useWipCommitPanel.mockReturnValue(
      panelState({
        batchMode: true,
        wipBatches: { auth: [file()] },
        batchMessages: {},
        generateMessageForBatch,
      })
    )
    const user = userEvent.setup()
    renderPanel()
    await user.click(screen.getByText('commit.generate'))
    expect(generateMessageForBatch).toHaveBeenCalledWith('auth', [file()])
  })

  it('shows the generating state and disables inputs for that group', () => {
    useWipCommitPanel.mockReturnValue(
      panelState({
        batchMode: true,
        wipBatches: { auth: [file()] },
        batchMessages: { auth: 'msg' },
        batchGenerating: { auth: true },
      })
    )
    renderPanel()
    expect(screen.getByText('commitDetails.batchCommit.generating')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('commitDetails.batchCommit.placeholder')).toBeDisabled()
  })

  it('disables the commit-batch button until a message is entered', () => {
    useWipCommitPanel.mockReturnValue(
      panelState({ batchMode: true, wipBatches: { auth: [file()] }, batchMessages: { auth: '' } })
    )
    const { rerender } = renderPanel()
    expect(
      screen.getByText('commitDetails.batchCommit.commitBatch').closest('button')
    ).toBeDisabled()

    useWipCommitPanel.mockReturnValue(
      panelState({
        batchMode: true,
        wipBatches: { auth: [file()] },
        batchMessages: { auth: 'ready' },
      })
    )
    rerender(<WipStagingPanel repoPath="/repo" gitStatus={gitStatus()} allWipChanges={[]} />)
    expect(
      screen.getByText('commitDetails.batchCommit.commitBatch').closest('button')
    ).toBeEnabled()
  })

  it('commits the batch when clicked', async () => {
    const commitBatch = vi.fn()
    const files = [file()]
    useWipCommitPanel.mockReturnValue(
      panelState({
        batchMode: true,
        wipBatches: { auth: files },
        batchMessages: { auth: 'ready' },
        commitBatch,
      })
    )
    const user = userEvent.setup()
    renderPanel()
    await user.click(screen.getByText('commitDetails.batchCommit.commitBatch'))
    expect(commitBatch).toHaveBeenCalledWith('auth', files)
  })
})
