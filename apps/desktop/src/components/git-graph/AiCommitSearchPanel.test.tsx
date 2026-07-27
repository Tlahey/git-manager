import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { StoredSearchRun } from '../../stores/aiCommitSearch.store'

const searchState = vi.hoisted(() => ({
  search: vi.fn(),
  cancel: vi.fn(),
  clear: vi.fn(),
  phase: 'idle' as string,
  isRunning: false,
  error: null as string | null,
  answer: '',
  askedQuestion: '',
  progress: null as { phase: string; completed: number; total: number } | null,
  results: [] as unknown[],
  matches: [] as unknown[],
  failedCount: 0,
  truncated: false,
  history: [] as StoredSearchRun[],
  removeRun: vi.fn(),
  clearHistory: vi.fn(),
}))

vi.mock('../../hooks/useAiCommitSearch', async () => {
  const actual = await vi.importActual<typeof import('../../hooks/useAiCommitSearch')>(
    '../../hooks/useAiCommitSearch'
  )
  return { ...actual, useAiCommitSearch: () => searchState }
})
vi.mock('../Markdown', () => ({
  Markdown: ({ content }: { content: string }) => <div data-testid="markdown">{content}</div>,
}))

import { AiCommitSearchPanel } from './AiCommitSearchPanel'
import { useRepoUIStore } from '../../stores/repoUI.store'

function storedRun(overrides: Partial<StoredSearchRun> = {}): StoredSearchRun {
  return {
    id: 'run-1',
    question: 'Did the Button change?',
    answer: '**Yes**, twice.',
    matches: [
      {
        oid: 'a'.repeat(40),
        shortOid: 'aaaaaaa',
        subject: 'feat(ui): loading state',
        author: 'Ada',
        timestamp: 1_783_987_200,
        finding: 'adds a loading state',
        files: ['packages/ui/src/Button.tsx'],
      },
    ],
    scanned: 42,
    failed: 0,
    truncated: false,
    sinceHours: 720,
    sinceEpoch: 1_781_395_200,
    ranAt: Date.now(),
    model: 'qwen3',
    ...overrides,
  }
}

function renderPanel() {
  const onClose = vi.fn()
  const utils = render(<AiCommitSearchPanel repoPath="/repo" onClose={onClose} />)
  return { ...utils, onClose }
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(searchState, {
    phase: 'idle',
    isRunning: false,
    error: null,
    answer: '',
    askedQuestion: '',
    progress: null,
    results: [],
    matches: [],
    failedCount: 0,
    truncated: false,
    history: [],
  })
  useRepoUIStore.setState({ pendingGraphSelection: null })
})

describe('AiCommitSearchPanel', () => {
  it('explains what it does before anything has been asked', () => {
    renderPanel()
    expect(screen.getByTestId('commit-search-empty')).toHaveTextContent(
      /every commit in the window is read on its own/i
    )
  })

  it('asks the question over the chosen window and commit budget', async () => {
    const user = userEvent.setup()
    renderPanel()

    await user.type(screen.getByTestId('commit-search-question'), 'Did the Button change?')
    await user.click(screen.getByTestId('commit-search-submit'))

    expect(searchState.search).toHaveBeenCalledWith('Did the Button change?', {
      sinceHours: 24 * 30,
      maxCommits: 60,
    })
  })

  it('refuses to search on an empty question', () => {
    renderPanel()
    expect(screen.getByTestId('commit-search-submit')).toBeDisabled()
  })

  it('says how far the scan has got, since it runs for minutes', () => {
    searchState.isRunning = true
    searchState.phase = 'scanning'
    searchState.progress = { phase: 'scanning', completed: 7, total: 42 }
    renderPanel()

    expect(screen.getByTestId('commit-search-progress')).toHaveTextContent('7 of 42')
    expect(screen.getByTestId('commit-search-stop')).toBeInTheDocument()
  })

  it('renders the answer and the commits behind it', () => {
    searchState.phase = 'done'
    searchState.answer = '**Yes**, twice.'
    searchState.askedQuestion = 'Did the Button change?'
    searchState.matches = [
      {
        commit: {
          oid: 'a'.repeat(40),
          shortOid: 'aaaaaaa',
          subject: 'feat(ui): loading state',
          author: 'Ada',
          timestamp: 1_783_987_200,
        },
        relevant: true,
        finding: 'adds a loading state',
        files: ['packages/ui/src/Button.tsx'],
        failed: false,
      },
    ]
    renderPanel()

    expect(screen.getByTestId('markdown')).toHaveTextContent('**Yes**, twice.')
    expect(screen.getByTestId('commit-search-match-aaaaaaa')).toHaveTextContent(
      'adds a loading state'
    )
  })

  it('points the graph at a commit when its row is clicked', async () => {
    const user = userEvent.setup()
    searchState.phase = 'done'
    searchState.answer = 'Yes.'
    searchState.matches = [
      {
        commit: {
          oid: 'a'.repeat(40),
          shortOid: 'aaaaaaa',
          subject: 'feat(ui): loading state',
          author: 'Ada',
          timestamp: 1_783_987_200,
        },
        relevant: true,
        finding: 'adds a loading state',
        files: [],
        failed: false,
      },
    ]
    renderPanel()

    await user.click(screen.getByTestId('commit-search-match-aaaaaaa'))
    expect(useRepoUIStore.getState().pendingGraphSelection).toBe('a'.repeat(40))
  })

  it('qualifies a negative answer when commits went unread or the window was cut', () => {
    // Both notices exist so a provider hiccup or a commit cap cannot read as "it never happened".
    searchState.phase = 'done'
    searchState.answer = 'No.'
    searchState.failedCount = 3
    searchState.truncated = true
    searchState.results = [{}, {}, {}]
    renderPanel()

    expect(screen.getByTestId('commit-search-failed')).toHaveTextContent('3 commit(s)')
    expect(screen.getByTestId('commit-search-truncated')).toHaveTextContent(
      /only the most recent ones/i
    )
  })

  it('surfaces a failure instead of an empty answer', () => {
    searchState.phase = 'error'
    searchState.error = 'AI_CONNECTION_FAILED'
    renderPanel()
    expect(screen.getByTestId('commit-search-error')).toBeInTheDocument()
  })

  it('says the search was stopped rather than showing nothing', () => {
    searchState.phase = 'cancelled'
    renderPanel()
    expect(screen.getByTestId('commit-search-cancelled')).toHaveTextContent(/stopped/i)
  })

  it('reopens a saved search with its answer and its commits', async () => {
    const user = userEvent.setup()
    searchState.history = [storedRun()]
    renderPanel()

    await user.click(screen.getByText('Did the Button change?'))

    expect(screen.getByTestId('markdown')).toHaveTextContent('**Yes**, twice.')
    expect(screen.getByTestId('commit-search-match-aaaaaaa')).toBeInTheDocument()
  })

  it('deletes one saved search, and drops it from view if it was open', async () => {
    const user = userEvent.setup()
    searchState.history = [storedRun()]
    renderPanel()

    await user.click(screen.getByText('Did the Button change?'))
    await user.click(screen.getByTestId('commit-search-history-remove-run-1'))

    expect(searchState.removeRun).toHaveBeenCalledWith('/repo', 'run-1')
    expect(screen.queryByTestId('markdown')).not.toBeInTheDocument()
  })

  it('closes', async () => {
    const user = userEvent.setup()
    const { onClose } = renderPanel()
    await user.click(screen.getByTestId('commit-search-close-panel'))
    expect(onClose).toHaveBeenCalled()
  })
})
