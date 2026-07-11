import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { GitStatus } from '@git-manager/git-types'
import type { ProcessedFileItem } from './CommitFileList'

vi.mock('@git-manager/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

const { useWipCommitPanel } = vi.hoisted(() => ({ useWipCommitPanel: vi.fn() }))
vi.mock('../../../hooks/useWipCommitPanel', () => ({ useWipCommitPanel }))

import { WipStagingPanel } from './WipStagingPanel'

function panelState(overrides: Partial<ReturnType<typeof useWipCommitPanel>> = {}) {
  return {
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
  useWipCommitPanel.mockReturnValue(panelState())
})

function renderPanel(props: Partial<React.ComponentProps<typeof WipStagingPanel>> = {}) {
  return render(<WipStagingPanel repoPath="/repo" gitStatus={gitStatus()} allWipChanges={[]} {...props} />)
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

describe('WipStagingPanel — classic commit form', () => {
  it('binds the commit message textarea and disables it while generating', () => {
    useWipCommitPanel.mockReturnValue(panelState({ commitMessage: 'my message', isGenerating: true }))
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
    useWipCommitPanel.mockReturnValue(panelState({ isGenerating: true, handleGenerateCommitMessage }))
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
    useWipCommitPanel.mockReturnValue(panelState({ historyOpen: true, history: ['fix: old bug', 'feat: thing'], setCommitMessage, setHistoryOpen }))
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
    rerender(<WipStagingPanel repoPath="/repo" gitStatus={gitStatus({ staged: [{ path: 'a', status: 'modified' }] })} allWipChanges={[]} />)
    expect(screen.getByText('commit.commit').closest('button')).toBeDisabled()

    useWipCommitPanel.mockReturnValue(panelState({ commitMessage: 'ok', isCommitting: true }))
    rerender(<WipStagingPanel repoPath="/repo" gitStatus={gitStatus({ staged: [{ path: 'a', status: 'modified' }] })} allWipChanges={[]} />)
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
    expect(screen.getByPlaceholderText('commitDetails.batchCommit.placeholder')).toHaveValue('auth message')
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
    expect(screen.getByText('commitDetails.batchCommit.commitBatch').closest('button')).toBeDisabled()

    useWipCommitPanel.mockReturnValue(
      panelState({ batchMode: true, wipBatches: { auth: [file()] }, batchMessages: { auth: 'ready' } })
    )
    rerender(<WipStagingPanel repoPath="/repo" gitStatus={gitStatus()} allWipChanges={[]} />)
    expect(screen.getByText('commitDetails.batchCommit.commitBatch').closest('button')).toBeEnabled()
  })

  it('commits the batch when clicked', async () => {
    const commitBatch = vi.fn()
    const files = [file()]
    useWipCommitPanel.mockReturnValue(
      panelState({ batchMode: true, wipBatches: { auth: files }, batchMessages: { auth: 'ready' }, commitBatch })
    )
    const user = userEvent.setup()
    renderPanel()
    await user.click(screen.getByText('commitDetails.batchCommit.commitBatch'))
    expect(commitBatch).toHaveBeenCalledWith('auth', files)
  })
})
