import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const explain = vi.fn()
const cancel = vi.fn()
const clear = vi.fn()
let hookState: Record<string, unknown> = {}

vi.mock('../../../hooks/useActionExplanation', () => ({
  useActionExplanation: () => ({
    explain,
    cancel,
    clear,
    status: 'idle',
    isGenerating: false,
    error: null,
    text: '',
    generatedAt: null,
    hasStored: false,
    ...hookState,
  }),
}))

import { ActionDetailPanel } from './ActionDetailPanel'
import type { PooledAction, PooledCommand } from '../../../lib/actionPool'

function command(overrides: Partial<PooledCommand> = {}): PooledCommand {
  return {
    entryId: 'e1',
    command: 'create_commit',
    titleKey: 'gitCommand.commit',
    family: 'commit',
    lines: [`git commit -m 'feat: x'`],
    status: 'ok',
    timestamp: Date.now(),
    durationMs: 30,
    ...overrides,
  }
}

function action(overrides: Partial<PooledAction> = {}): PooledAction {
  return {
    id: 'corr-1',
    label: 'git.commit',
    titleKey: 'gitCommand.action.commit',
    family: 'commit',
    repoPath: '/repo/demo',
    startTimestamp: Date.now(),
    totalDurationMs: 30,
    status: 'ok',
    commands: [command()],
    ...overrides,
  }
}

const writeText = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  hookState = {}
  writeText.mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
})

describe('ActionDetailPanel', () => {
  it('lists every command that ran, whether or not a model is available', () => {
    render(
      <ActionDetailPanel
        action={action({
          commands: [
            command({ entryId: 'e1', lines: ['git add -A'], titleKey: 'gitCommand.stageAll' }),
            command({ entryId: 'e2' }),
          ],
        })}
        aiAvailable={false}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByText('Commands that ran')).toBeInTheDocument()
    expect(screen.getByText('git add -A')).toBeInTheDocument()
    expect(screen.getByText(`git commit -m 'feat: x'`)).toBeInTheDocument()
  })

  it('offers no generate affordance with no model reachable, and says why', () => {
    render(<ActionDetailPanel action={action()} aiAvailable={false} onClose={vi.fn()} />)

    expect(screen.queryByTestId('action-explain')).not.toBeInTheDocument()
    expect(screen.getByTestId('action-explain-unavailable')).toBeInTheDocument()
    expect(screen.getByText(/No AI model is reachable/)).toBeInTheDocument()
  })

  it('does not generate on open — selecting a row is a request to read the commands', () => {
    // Auto-generating here would fire a model call on every arrow-key press down the list.
    render(<ActionDetailPanel action={action()} aiAvailable onClose={vi.fn()} />)

    expect(explain).not.toHaveBeenCalled()
    expect(screen.getByTestId('action-explain-empty')).toBeInTheDocument()
  })

  it('generates on request', () => {
    render(<ActionDetailPanel action={action()} aiAvailable onClose={vi.fn()} />)

    fireEvent.click(screen.getByTestId('action-explain'))
    expect(explain).toHaveBeenCalledOnce()
  })

  it('swaps generate for stop while the model is answering', () => {
    hookState = { isGenerating: true }
    render(<ActionDetailPanel action={action()} aiAvailable onClose={vi.fn()} />)

    expect(screen.queryByTestId('action-explain')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('action-explain-stop'))
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('renders the answer, with a way to redo or forget it', () => {
    hookState = { text: '**It committed.**', generatedAt: Date.now() }
    render(<ActionDetailPanel action={action()} aiAvailable onClose={vi.fn()} />)

    expect(screen.getByText('It committed.')).toBeInTheDocument()
    expect(screen.getByText('Regenerate')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('action-explain-forget'))
    expect(clear).toHaveBeenCalledOnce()
  })

  it('shows a provider failure instead of an empty answer', () => {
    hookState = { status: 'error', error: 'AI_PROVIDER_NOT_RUNNING' }
    render(<ActionDetailPanel action={action()} aiAvailable onClose={vi.fn()} />)

    expect(screen.getByTestId('action-explain-error')).toBeInTheDocument()
  })

  it("decodes a failed command's error payload", () => {
    render(
      <ActionDetailPanel
        action={action({
          status: 'error',
          commands: [
            command({
              status: 'error',
              error: JSON.stringify({ code: 'GIT_ERROR', message: 'nothing to commit' }),
            }),
          ],
        })}
        aiAvailable={false}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByTestId('action-command-error')).toHaveTextContent('nothing to commit')
  })

  it('copies every command line at once', async () => {
    render(
      <ActionDetailPanel
        action={action({
          commands: [
            command({ entryId: 'e1', lines: ['git checkout main'] }),
            command({ entryId: 'e2', lines: ['git merge --no-edit feat'] }),
          ],
        })}
        aiAvailable={false}
        onClose={vi.fn()}
      />
    )

    fireEvent.click(screen.getByTestId('action-copy-commands'))
    expect(writeText).toHaveBeenCalledWith('git checkout main\ngit merge --no-edit feat')
  })

  it('cancels a generation still running when the panel goes away', async () => {
    hookState = { isGenerating: true }
    const { unmount } = render(
      <ActionDetailPanel action={action()} aiAvailable onClose={vi.fn()} />
    )

    unmount()
    await waitFor(() => expect(cancel).toHaveBeenCalledOnce())
  })

  it('leaves a finished generation alone on unmount', async () => {
    const { unmount } = render(
      <ActionDetailPanel action={action()} aiAvailable onClose={vi.fn()} />
    )

    unmount()
    expect(cancel).not.toHaveBeenCalled()
  })

  it('closes on request', () => {
    const onClose = vi.fn()
    render(<ActionDetailPanel action={action()} aiAvailable onClose={onClose} />)

    fireEvent.click(screen.getByTestId('action-detail-close'))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
