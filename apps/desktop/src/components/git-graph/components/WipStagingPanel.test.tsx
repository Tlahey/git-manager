import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { GitStatus } from '@git-manager/git-types'
import type { ProcessedFileItem } from '../../common/CommitFileList'

const { useWipCommitPanel } = vi.hoisted(() => ({ useWipCommitPanel: vi.fn() }))
vi.mock('../../../hooks/useWipCommitPanel', () => ({ useWipCommitPanel }))

// The publish-PR button has its own flow (query client, SWR, GitHub) and its own test — stub it here
// so this panel test stays focused on the commit form.
vi.mock('../../github-panels/pr/PrPublishButton', () => ({ PrPublishButton: () => null }))

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
    generateAllBatchMessages: vi.fn(),
    commitAllBatches: vi.fn(),
    isGeneratingAllBatches: false,
    isCommittingAllBatches: false,
    commitMessage: '',
    setCommitMessage: vi.fn(),
    isCommitting: false,
    handleCommitWip: vi.fn(),
    handleGenerateCommitMessage: vi.fn(),
    isGenerating: false,
    commitValidation: null,
    commitCoverage: null,
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
    expect(screen.getByText('Smart Batch Commits')).toBeInTheDocument()

    useWipCommitPanel.mockReturnValue(panelState({ batchMode: true }))
    rerender(<WipStagingPanel repoPath="/repo" gitStatus={gitStatus()} allWipChanges={[]} />)
    expect(screen.getByText('← Back to a single commit')).toBeInTheDocument()
  })

  it('toggles batch mode when clicked', async () => {
    const setBatchMode = vi.fn()
    useWipCommitPanel.mockReturnValue(panelState({ setBatchMode }))
    const user = userEvent.setup()
    renderPanel()
    await user.click(screen.getByText('Smart Batch Commits'))
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
    expect(screen.getByPlaceholderText('Commit message...')).toHaveValue('my message')
    expect(screen.getByPlaceholderText('Commit message...')).toBeDisabled()
  })

  it('disables the generate button when there are no staged files and it is not already generating', () => {
    renderPanel({ gitStatus: gitStatus({ staged: [] }) })
    expect(screen.getByText('Generate message (LLM)').closest('button')).toBeDisabled()
  })

  it('enables the generate button once files are staged', () => {
    renderPanel({ gitStatus: gitStatus({ staged: [{ path: 'a', status: 'modified' }] }) })
    expect(screen.getByText('Generate message (LLM)').closest('button')).toBeEnabled()
  })

  it('shows a stop control while generating, and calls the handler either way', async () => {
    const handleGenerateCommitMessage = vi.fn()
    useWipCommitPanel.mockReturnValue(
      panelState({ isGenerating: true, handleGenerateCommitMessage })
    )
    const user = userEvent.setup()
    renderPanel()
    expect(screen.getByText('Stop')).toBeInTheDocument()
    await user.click(screen.getByText('Stop'))
    expect(handleGenerateCommitMessage).toHaveBeenCalledOnce()
  })

  it('disables commit when nothing is staged, the message is blank, or a commit is in progress', () => {
    const { rerender } = renderPanel({ gitStatus: gitStatus({ staged: [] }) })
    expect(screen.getByTestId('commit-btn')).toBeDisabled()

    useWipCommitPanel.mockReturnValue(panelState({ commitMessage: '   ' }))
    rerender(
      <WipStagingPanel
        repoPath="/repo"
        gitStatus={gitStatus({ staged: [{ path: 'a', status: 'modified' }] })}
        allWipChanges={[]}
      />
    )
    expect(screen.getByTestId('commit-btn')).toBeDisabled()

    useWipCommitPanel.mockReturnValue(panelState({ commitMessage: 'ok', isCommitting: true }))
    rerender(
      <WipStagingPanel
        repoPath="/repo"
        gitStatus={gitStatus({ staged: [{ path: 'a', status: 'modified' }] })}
        allWipChanges={[]}
      />
    )
    expect(screen.getByTestId('commit-btn')).toBeDisabled()
  })

  it('commits when enabled', async () => {
    const handleCommitWip = vi.fn()
    useWipCommitPanel.mockReturnValue(panelState({ commitMessage: 'ok', handleCommitWip }))
    const user = userEvent.setup()
    renderPanel({ gitStatus: gitStatus({ staged: [{ path: 'a', status: 'modified' }] }) })
    await user.click(screen.getByTestId('commit-btn'))
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
    // The commit button remains, and now takes the full width on its own.
    expect(screen.getByTestId('commit-btn')).toBeInTheDocument()
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
    expect(screen.getByText('2 files')).toBeInTheDocument()
    expect(screen.getByText('src/auth/')).toBeInTheDocument()
    expect(screen.getByText('login.ts')).toBeInTheDocument()
    expect(screen.getByText('readme.md')).toBeInTheDocument()
  })

  it('binds the per-group message textarea', () => {
    renderPanel()
    expect(screen.getByPlaceholderText('Message for this batch...')).toHaveValue('auth message')
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
    await user.click(screen.getByText('Generate message (LLM)'))
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
    expect(screen.getByText('Generating...')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Message for this batch...')).toBeDisabled()
  })

  it('disables the commit-batch button until a message is entered', () => {
    useWipCommitPanel.mockReturnValue(
      panelState({ batchMode: true, wipBatches: { auth: [file()] }, batchMessages: { auth: '' } })
    )
    const { rerender } = renderPanel()
    expect(screen.getByText('Commit this batch').closest('button')).toBeDisabled()

    useWipCommitPanel.mockReturnValue(
      panelState({
        batchMode: true,
        wipBatches: { auth: [file()] },
        batchMessages: { auth: 'ready' },
      })
    )
    rerender(<WipStagingPanel repoPath="/repo" gitStatus={gitStatus()} allWipChanges={[]} />)
    expect(screen.getByText('Commit this batch').closest('button')).toBeEnabled()
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
    await user.click(screen.getByText('Commit this batch'))
    expect(commitBatch).toHaveBeenCalledWith('auth', files)
  })
})

describe('WipStagingPanel — batch "all" actions', () => {
  const twoGroups = {
    batchMode: true,
    wipBatches: { auth: [file({ path: 'src/auth/a.ts' })], ui: [file({ path: 'src/ui/b.ts' })] },
  }

  it('generates every group in one click', async () => {
    const generateAllBatchMessages = vi.fn()
    useWipCommitPanel.mockReturnValue(panelState({ ...twoGroups, generateAllBatchMessages }))
    renderPanel()
    await userEvent.setup().click(screen.getByTestId('batch-generate-all'))
    expect(generateAllBatchMessages).toHaveBeenCalledOnce()
  })

  it('commits every group that has a message', async () => {
    const commitAllBatches = vi.fn()
    useWipCommitPanel.mockReturnValue(
      panelState({ ...twoGroups, batchMessages: { auth: 'feat: a' }, commitAllBatches })
    )
    renderPanel()
    await userEvent.setup().click(screen.getByTestId('batch-commit-all'))
    expect(commitAllBatches).toHaveBeenCalledOnce()
  })

  it('cannot commit all while no group carries a message', () => {
    useWipCommitPanel.mockReturnValue(panelState({ ...twoGroups, batchMessages: { auth: '  ' } }))
    renderPanel()
    expect(screen.getByTestId('batch-commit-all')).toBeDisabled()
  })

  it('locks every per-group action while a sequence is running', () => {
    // Each group re-stages the index to isolate itself, so a per-group click mid-run would stage
    // against the sequence's state.
    useWipCommitPanel.mockReturnValue(
      panelState({ ...twoGroups, batchMessages: { auth: 'feat: a' }, isGeneratingAllBatches: true })
    )
    renderPanel()
    expect(screen.getByTestId('batch-commit-auth')).toBeDisabled()
    expect(screen.getByTestId('batch-generate-all')).toBeDisabled()
    expect(screen.getByTestId('batch-commit-all')).toBeDisabled()
  })

  it('does not put every group in a generating state during a sequence', () => {
    // Only the group whose turn it is shows a spinner; the others stay editable-looking.
    useWipCommitPanel.mockReturnValue(
      panelState({ ...twoGroups, isGeneratingAllBatches: true, batchGenerating: { auth: true } })
    )
    renderPanel()
    expect(screen.getAllByText('Generating...')).toHaveLength(1)
  })

  it('offers no "all" actions when there is nothing to group', () => {
    useWipCommitPanel.mockReturnValue(panelState({ batchMode: true, wipBatches: {} }))
    renderPanel()
    expect(screen.queryByTestId('batch-generate-all')).not.toBeInTheDocument()
    expect(screen.queryByTestId('batch-commit-all')).not.toBeInTheDocument()
  })

  it('hides the AI-only "generate all" when AI is off, keeping "commit all"', () => {
    setAiEnabled(false)
    useWipCommitPanel.mockReturnValue(
      panelState({ ...twoGroups, batchMessages: { auth: 'feat: a' } })
    )
    renderPanel()
    expect(screen.queryByTestId('batch-generate-all')).not.toBeInTheDocument()
    expect(screen.getByTestId('batch-commit-all')).toBeInTheDocument()
  })
})

describe('WipStagingPanel — no message history dropdown', () => {
  // Removed deliberately. It held only messages generated in the current session (a plain
  // `useState`, never persisted), so it was empty at every app start. The reason it existed —
  // giving the model examples of the project's style — is served by the prompt instead: the backend
  // samples the repo's last 10 real commit subjects into every commit-message generation.
  it('offers no history control beside the generate button', () => {
    renderPanel()
    expect(screen.queryByTestId('commit-history-button')).not.toBeInTheDocument()
    expect(screen.queryByText('Recent messages')).not.toBeInTheDocument()
  })

  it('leaves the generate button whole rather than half of a split control', () => {
    renderPanel()
    const generate = screen.getByTestId('commit-generate-button')
    expect(generate.className).not.toContain('rounded-r-none')
    expect(generate.className).not.toContain('border-r-0')
  })
})

// The `--no-verify` escape hatch, which the backend has supported everywhere since hooks started
// running but nothing exposed. Behind the caret rather than beside the button on purpose: a
// repository's hooks being silently off is the exact bug this app spent a release fixing.
describe('WipStagingPanel — committing without hooks', () => {
  const staged = gitStatus({ staged: [{ path: 'a.ts', status: 'modified' }] })

  it('keeps the escape hatch out of the way until the caret is opened', async () => {
    useWipCommitPanel.mockReturnValue(panelState({ commitMessage: 'chore: something' }))
    const user = userEvent.setup()
    renderPanel({ gitStatus: staged })

    expect(screen.queryByText('Commit without running hooks')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('commit-menu-btn'))

    expect(await screen.findByText('Commit without running hooks')).toBeInTheDocument()
  })

  it('asks for hooks to be skipped when it is chosen', async () => {
    const handleCommitWip = vi.fn()
    useWipCommitPanel.mockReturnValue(
      panelState({ commitMessage: 'chore: something', handleCommitWip })
    )
    const user = userEvent.setup()
    renderPanel({ gitStatus: staged })

    await user.click(screen.getByTestId('commit-menu-btn'))
    await user.click(await screen.findByText('Commit without running hooks'))

    expect(handleCommitWip).toHaveBeenCalledWith({ skipHooks: true })
  })

  it('runs the hooks for an ordinary commit', async () => {
    const handleCommitWip = vi.fn()
    useWipCommitPanel.mockReturnValue(
      panelState({ commitMessage: 'chore: something', handleCommitWip })
    )
    const user = userEvent.setup()
    renderPanel({ gitStatus: staged })

    await user.click(screen.getByTestId('commit-btn'))

    // No argument at all, rather than `{ skipHooks: false }`: the default has to be the hooks
    // running, and an explicit `false` here would be a second way to spell it.
    expect(handleCommitWip).toHaveBeenCalledWith()
  })
})
