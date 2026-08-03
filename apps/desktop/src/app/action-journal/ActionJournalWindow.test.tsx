import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// The window's own chrome only: the theme hook talks to Tauri, and the status check would fire a real
// provider probe. Neither is what this file is about.
vi.mock('../../hooks/useTheme', () => ({ useTheme: vi.fn() }))
vi.mock('../../hooks/useAiStatusCheck', () => ({ useAiStatusCheck: vi.fn() }))
vi.mock('../../hooks/useActionExplanation', () => ({
  useActionExplanation: () => ({
    explain: vi.fn(),
    cancel: vi.fn(),
    clear: vi.fn(),
    status: 'idle',
    isGenerating: false,
    error: null,
    text: '',
    generatedAt: null,
    hasStored: false,
  }),
}))

const poolState = {
  actions: [] as PooledAction[],
  isLoading: false,
  error: undefined as Error | undefined,
  refresh: vi.fn(),
}
vi.mock('./useActionPool', () => ({ useActionPool: () => poolState }))

import { ActionJournalWindow } from './ActionJournalWindow'
import type { PooledAction, PooledCommand } from '../../lib/actionPool'
import { useAiStatusStore } from '../../stores/aiStatus.store'
import { useSettingsStore } from '../../stores/settings.store'
import { useActionExplanationStore } from '../../stores/actionExplanation.store'

function command(overrides: Partial<PooledCommand> = {}): PooledCommand {
  return {
    entryId: 'e1',
    command: 'stage_file',
    titleKey: 'gitCommand.stageFile',
    family: 'staging',
    lines: ['git add -- a.ts'],
    status: 'ok',
    timestamp: Date.now(),
    durationMs: 4,
    ...overrides,
  }
}

function action(overrides: Partial<PooledAction> = {}): PooledAction {
  return {
    id: 'corr-1',
    titleKey: 'gitCommand.stageFile',
    family: 'staging',
    repoPath: '/repo/demo',
    startTimestamp: Date.now(),
    totalDurationMs: 4,
    status: 'ok',
    commands: [command()],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  poolState.actions = []
  poolState.isLoading = false
  poolState.error = undefined
  useAiStatusStore.setState({ state: 'connected' })
  useActionExplanationStore.setState({ explanations: {} })
  useSettingsStore.setState((s) => ({
    settings: { ...s.settings, ai: { ...s.settings.ai, enabled: true } },
  }))
})

describe('ActionJournalWindow', () => {
  it('says what it is for', () => {
    render(<ActionJournalWindow />)

    expect(screen.getByText('Behind the Scenes')).toBeInTheDocument()
    expect(screen.getByText(/git commands your recent actions actually ran/)).toBeInTheDocument()
  })

  it('invites an action when the journal is empty', () => {
    render(<ActionJournalWindow />)

    expect(screen.getByTestId('action-journal-empty')).toHaveTextContent('No actions recorded yet')
  })

  it('lists the actions with their commands', () => {
    poolState.actions = [
      action(),
      action({ id: 'corr-2', commands: [command({ entryId: 'e2', lines: ['git push origin'] })] }),
    ]
    render(<ActionJournalWindow />)

    expect(screen.getByText('git add -- a.ts')).toBeInTheDocument()
    expect(screen.getByText('git push origin')).toBeInTheDocument()
    expect(screen.getByText('2 actions')).toBeInTheDocument()
  })

  it('opens the detail panel for the action that was clicked', () => {
    poolState.actions = [action()]
    render(<ActionJournalWindow />)
    expect(screen.queryByTestId('action-detail-panel')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('action-row-corr-1'))
    expect(screen.getByTestId('action-detail-panel')).toBeInTheDocument()
  })

  it('filters on the command text, not only on the title', () => {
    poolState.actions = [
      action(),
      action({ id: 'corr-2', commands: [command({ entryId: 'e2', lines: ['git push origin'] })] }),
    ]
    render(<ActionJournalWindow />)

    fireEvent.change(screen.getByTestId('action-journal-filter'), { target: { value: 'push' } })

    expect(screen.queryByTestId('action-row-corr-1')).not.toBeInTheDocument()
    expect(screen.getByTestId('action-row-corr-2')).toBeInTheDocument()
  })

  it('says so when the filter matches nothing', () => {
    poolState.actions = [action()]
    render(<ActionJournalWindow />)

    fireEvent.change(screen.getByTestId('action-journal-filter'), { target: { value: 'zzz' } })
    expect(screen.getByTestId('action-journal-empty')).toHaveTextContent(
      'No action matches your filter'
    )
  })

  it('re-reads the log on demand', () => {
    render(<ActionJournalWindow />)

    fireEvent.click(screen.getByTestId('action-journal-refresh'))
    expect(poolState.refresh).toHaveBeenCalledOnce()
  })

  it('surfaces a read failure', () => {
    poolState.error = new Error('log unreadable')
    render(<ActionJournalWindow />)

    expect(screen.getByTestId('action-journal-error')).toHaveTextContent('log unreadable')
  })

  it('keeps the commands and drops the explanation when no provider is reachable', () => {
    // The requirement: without a model the window still shows what ran.
    poolState.actions = [action()]
    useAiStatusStore.setState({ state: 'disconnected' })
    render(<ActionJournalWindow />)

    fireEvent.click(screen.getByTestId('action-row-corr-1'))
    // Twice over: once on the row, once in the panel — the commands are never behind the model.
    expect(screen.getAllByText('git add -- a.ts')).toHaveLength(2)
    expect(screen.getByTestId('action-explain-unavailable')).toBeInTheDocument()
  })

  it('drops the explanation when AI is switched off entirely', () => {
    poolState.actions = [action()]
    useSettingsStore.setState((s) => ({
      settings: { ...s.settings, ai: { ...s.settings.ai, enabled: false } },
    }))
    render(<ActionJournalWindow />)

    fireEvent.click(screen.getByTestId('action-row-corr-1'))
    expect(screen.getByTestId('action-explain-unavailable')).toBeInTheDocument()
  })

  it('keeps the affordance while the provider check is still in flight', () => {
    // Flickering the button away and back reads as broken; a click during the check fails with a
    // localized message, which says more than a missing button.
    poolState.actions = [action()]
    useAiStatusStore.setState({ state: 'checking' })
    render(<ActionJournalWindow />)

    fireEvent.click(screen.getByTestId('action-row-corr-1'))
    expect(screen.getByTestId('action-explain')).toBeInTheDocument()
  })

  it('marks the actions already explained', () => {
    poolState.actions = [action()]
    useActionExplanationStore.setState({
      explanations: { 'corr-1': { text: 'done', generatedAt: Date.now() } },
    })
    render(<ActionJournalWindow />)

    expect(screen.getByTestId('action-row-explained')).toBeInTheDocument()
  })

  it('closes the detail panel when its action falls out of the pool', () => {
    // The pool is capped and refreshes on its own, so a panel about a vanished action would be a
    // frozen copy of something no longer in the journal.
    poolState.actions = [action()]
    const { rerender } = render(<ActionJournalWindow />)
    fireEvent.click(screen.getByTestId('action-row-corr-1'))
    expect(screen.getByTestId('action-detail-panel')).toBeInTheDocument()

    poolState.actions = []
    rerender(<ActionJournalWindow />)
    expect(screen.queryByTestId('action-detail-panel')).not.toBeInTheDocument()
  })
})
