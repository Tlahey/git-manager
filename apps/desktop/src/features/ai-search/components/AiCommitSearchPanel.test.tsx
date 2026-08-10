import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ScanFailure, ScannedCommit } from '@git-manager/ai'
import type { StoredSearchRun } from '../stores/aiCommitSearch.store'

const searchState = vi.hoisted(() => ({
  search: vi.fn(),
  cancel: vi.fn(),
  clear: vi.fn(),
  phase: 'idle',
  isRunning: false,
  error: null as string | null,
  answer: '',
  askedQuestion: '',
  progress: null as {
    phase: string
    completed: number
    total: number
    filesRead?: number
    narrowing?: boolean
  } | null,
  results: [] as unknown[],
  matches: [] as unknown[],
  unread: [] as ScannedCommit[],
  truncated: false,
  history: [] as StoredSearchRun[],
  removeRun: vi.fn(),
  clearHistory: vi.fn(),
}))

vi.mock('../hooks/useAiCommitSearch', async () => {
  const actual = await vi.importActual<typeof import('../hooks/useAiCommitSearch')>(
    '../hooks/useAiCommitSearch'
  )
  return { ...actual, useAiCommitSearch: () => searchState }
})
vi.mock('../../../components/Markdown', () => ({
  Markdown: ({ content }: { content: string }) => <div data-testid="markdown">{content}</div>,
}))

// The one thing the real `useNotchOperation` reaches for that jsdom has no host for. Everything
// else about it is left real, so the assertions below are about cards actually reaching the queue.
vi.mock('../../../api/notification.api', () => ({
  apiOnNotchDismissed: () => Promise.resolve(() => {}),
}))

/**
 * What the panel asked the notch for, kept while the hook itself stays real.
 *
 * The run id is the panel's whole contribution to the card's lifetime and is invisible from the
 * queue — it decides when a card the user closed is allowed back, and nothing else can be asserted
 * from the outside.
 */
const notchOptions = vi.hoisted(() => ({
  current: [] as { runId?: string; enabled?: boolean }[],
}))
vi.mock('../../../hooks/useNotchOperation', async () => {
  const actual = await vi.importActual<typeof import('../../../hooks/useNotchOperation')>(
    '../../../hooks/useNotchOperation'
  )
  return {
    useNotchOperation: (options: NotchOperationOptions) => {
      notchOptions.current.push(options)
      return actual.useNotchOperation(options)
    },
  }
})

import { emptyNotchQueue } from '@git-manager/notch'
import { AiCommitSearchPanel } from './AiCommitSearchPanel'
import type { NotchOperationOptions } from '../../../hooks/useNotchOperation'
import { useNotchQueueStore } from '../../../stores/notchQueue.store'
import { useRepoUIStore } from '../../../stores/repoUI.store'

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
    oldestEpoch: 1_781_395_200,
    newestEpoch: 1_783_987_200,
    ranAt: Date.now(),
    model: 'qwen3',
    ...overrides,
  }
}

function unreadCommit(shortOid: string, failure: ScanFailure): ScannedCommit {
  return {
    commit: {
      oid: shortOid.padEnd(40, '0'),
      shortOid,
      subject: 'feat: something the model choked on',
      body: '',
      author: 'Ada',
      timestamp: 1_783_987_200,
      files: [],
      filesTruncated: false,
      insertions: 1,
      deletions: 0,
      parentCount: 1,
    },
    relevant: false,
    finding: '',
    files: [],
    failed: true,
    failure,
    filesRead: 0,
  }
}

function renderPanel() {
  const onClose = vi.fn()
  const utils = render(<AiCommitSearchPanel repoPath="/repo" onClose={onClose} />)
  return { ...utils, onClose }
}

beforeEach(() => {
  vi.clearAllMocks()
  notchOptions.current = []
  useNotchQueueStore.setState({ queue: emptyNotchQueue })
  Object.assign(searchState, {
    phase: 'idle',
    isRunning: false,
    error: null,
    answer: '',
    askedQuestion: '',
    progress: null,
    results: [],
    matches: [],
    unread: [],
    truncated: false,
    history: [],
  })
  useRepoUIStore.setState({ pendingGraphSelection: null })
})

describe('AiCommitSearchPanel', () => {
  it('explains what it does before anything has been asked', () => {
    renderPanel()
    expect(screen.getByTestId('commit-search-empty')).toHaveTextContent(
      /every commit is read file by file/i
    )
  })

  /**
   * The commit count is the only *bound* — the time window that used to sit beside it was redundant
   * (see `CommitSearchForm`). The mode is not a bound: it decides what reading a commit means, and
   * it defaults to the deep read.
   */
  it('asks the question with the commit budget as its only bound, read deeply', async () => {
    const user = userEvent.setup()
    renderPanel()

    await user.type(screen.getByTestId('commit-search-question'), 'Did the Button change?')
    await user.click(screen.getByTestId('commit-search-submit'))

    expect(searchState.search).toHaveBeenCalledWith('Did the Button change?', {
      maxCommits: 60,
      mode: 'deep',
    })
    expect(screen.queryByTestId('commit-search-window')).not.toBeInTheDocument()
  })

  it('asks for the quick mode once the box is ticked', async () => {
    const user = userEvent.setup()
    renderPanel()

    await user.type(screen.getByTestId('commit-search-question'), 'Did the Button change?')
    await user.click(screen.getByTestId('commit-search-quick'))
    await user.click(screen.getByTestId('commit-search-submit'))

    expect(searchState.search).toHaveBeenCalledWith('Did the Button change?', {
      maxCommits: 60,
      mode: 'quick',
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
    searchState.unread = [unreadCommit('bad1234', 'unreadable')]
    searchState.truncated = true
    searchState.results = [{}, {}, {}]
    renderPanel()

    expect(screen.getByTestId('commit-search-unread')).toHaveTextContent('1 commit(s) left unread')
    // The cap is the user's own, so the notice names it rather than implying something failed:
    // 3 results minus the 1 unread commit is what "read" means here.
    expect(screen.getByTestId('commit-search-truncated')).toHaveTextContent(
      /these 2 commits are the most recent ones.*the number you asked for/i
    )
  })

  /**
   * The truncation flag is known the instant the commit list comes back — before a single commit has
   * been read — so showing it live announced "these 0 commits are the most recent ones" for the
   * whole run. It qualifies an answer, so it waits for one.
   */
  it('holds the truncation caveat back until the reading is over', () => {
    searchState.isRunning = true
    searchState.phase = 'scanning'
    searchState.truncated = true
    searchState.results = []
    renderPanel()

    expect(screen.queryByTestId('commit-search-truncated')).not.toBeInTheDocument()
  })

  /**
   * The old line said "N commits could not be read" and stopped there — true, alarming and
   * unactionable. The cause is what tells the user whether to change model or start their provider.
   */
  it('names the cause and the commits rather than a bare count', () => {
    searchState.phase = 'done'
    searchState.answer = 'No.'
    searchState.unread = [unreadCommit('bad1234', 'unreadable')]
    renderPanel()

    expect(screen.getByTestId('commit-search-unread')).toHaveTextContent(
      /ignores the JSON format the app asks for/i
    )
    expect(screen.getByTestId('commit-search-unread-bad1234')).toBeInTheDocument()
  })

  it('still explains a reopened run, whose unread commits are no longer kept', async () => {
    const user = userEvent.setup()
    searchState.history = [storedRun({ failed: 4, failureReason: 'call' })]
    renderPanel()

    await user.click(screen.getByText('Did the Button change?'))

    // The commits themselves were not stored — the count and the cause were, and they are what
    // makes the caveat readable months later.
    const notice = screen.getByTestId('commit-search-failed')
    expect(notice).toHaveTextContent('4 commit(s) left unread')
    expect(notice).toHaveTextContent(/did not answer/i)
  })

  /**
   * The commit count is what was asked for; the file count is what the run actually cost, since
   * every commit is read one model call per file.
   */
  it('reports how many files were read, not just how many commits', () => {
    searchState.phase = 'done'
    searchState.answer = 'Yes.'
    searchState.results = [{ filesRead: 12 }, { filesRead: 7 }, { filesRead: 3 }]
    renderPanel()

    const notice = screen.getByTestId('commit-search-files')
    expect(notice).toHaveTextContent('22 files read across 3 commit(s)')
    // Not a caveat: reading every file is what keeps a verdict from resting on part of a commit.
    expect(notice).toHaveTextContent(/every commit is read file by file/i)
  })

  /** One model call per commit, during which both counters above it are frozen. */
  it('says when it is choosing which files to open, since both counters stall then', () => {
    searchState.isRunning = true
    searchState.phase = 'scanning'
    searchState.progress = {
      phase: 'scanning',
      completed: 1,
      total: 5,
      filesRead: 4,
      narrowing: true,
    }
    renderPanel()

    expect(screen.getByTestId('commit-search-narrowing')).toHaveTextContent(
      /choosing which files .* to open/i
    )
  })

  it('counts the files during the run too, so a slow bar reads as busy', () => {
    searchState.isRunning = true
    searchState.phase = 'scanning'
    searchState.progress = { phase: 'scanning', completed: 2, total: 42, filesRead: 31 }
    renderPanel()

    expect(screen.getByTestId('commit-search-files-read')).toHaveTextContent('31 files read')
  })

  /**
   * The triage is one pass over every message, so counting it as "0 of 1" read as a search over a
   * single commit — which is what a user reported seeing.
   */
  it('names the shortlisting pass instead of counting it as one commit', () => {
    searchState.isRunning = true
    searchState.phase = 'scanning'
    searchState.progress = { phase: 'triaging', completed: 0, total: 1 }
    renderPanel()

    expect(screen.getByTestId('commit-search-triaging')).toHaveTextContent(
      /reading every commit message to shortlist/i
    )
    expect(screen.queryByTestId('commit-search-progress')).not.toBeInTheDocument()
  })

  /**
   * What a quick run skipped is real and has to be said — but what it *found* was read in the code
   * like any other, and the badge must not imply otherwise.
   */
  it('marks a quick answer by what it skipped, not by what it read', async () => {
    const user = userEvent.setup()
    searchState.history = [storedRun({ mode: 'quick' })]
    renderPanel()

    await user.click(screen.getByText('Did the Button change?'))

    const badge = screen.getByTestId('commit-search-quick-badge')
    expect(badge).toHaveTextContent(/shortlisted from their messages/i)
    expect(badge).toHaveTextContent(/read in the code like a full search/i)
    // Both narrowings are named, because both are coverage the user gave up.
    expect(badge).toHaveTextContent(/message did not mention the subject/i)
    expect(badge).toHaveTextContent(/every file whose path did not/i)
  })

  it('marks nothing on a deep answer, which is what the panel is otherwise about', async () => {
    const user = userEvent.setup()
    searchState.history = [storedRun({ mode: 'deep' })]
    renderPanel()

    await user.click(screen.getByText('Did the Button change?'))

    expect(screen.queryByTestId('commit-search-quick-badge')).not.toBeInTheDocument()
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

/**
 * A run takes minutes, so the card is what makes it visible from wherever the user went.
 *
 * It used to be gated on the app being unfocused, on the theory that a card duplicating the panel
 * is noise. That gate was the bug: the card left every time the user came back to the app and
 * returned the moment they switched away.
 */
describe('AiCommitSearchPanel — the run on the notch', () => {
  it('shows the card while the user is looking straight at the app', () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    searchState.isRunning = true
    searchState.phase = 'scanning'
    searchState.askedQuestion = 'Did the Button change?'
    searchState.progress = { phase: 'scanning', completed: 7, total: 42 }
    renderPanel()

    expect(useNotchQueueStore.getState().queue.current?.model).toMatchObject({
      kind: 'progress',
      id: 'commit-search:/repo',
      title: 'Did the Button change?',
    })
  })

  it('never gates the card on anything, so nothing can take it down mid-run', () => {
    searchState.isRunning = true
    searchState.phase = 'scanning'
    searchState.askedQuestion = 'Did the Button change?'
    renderPanel()

    expect(notchOptions.current.at(-1)?.enabled).toBeUndefined()
  })

  it('leaves the outcome card behind when the run ends', () => {
    // A `progress` card has no timer (`resolveNotchDurationMs`); the `status` card that replaces it
    // does, which is how "it disappears when it is finished" actually happens.
    searchState.phase = 'done'
    searchState.answer = 'Yes.'
    searchState.askedQuestion = 'Did the Button change?'
    renderPanel()

    expect(useNotchQueueStore.getState().queue.current?.model).toMatchObject({
      kind: 'status',
      tone: 'success',
    })
  })

  it('counts each search as its own run, so a card the user closed comes back for the next one', async () => {
    const user = userEvent.setup()
    renderPanel()
    const before = notchOptions.current.at(-1)?.runId

    await user.type(screen.getByTestId('commit-search-question'), 'Did the Button change?')
    await user.click(screen.getByTestId('commit-search-submit'))

    expect(notchOptions.current.at(-1)?.runId).not.toBe(before)
  })
})
