import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { StoredSearchRun } from '../../../stores/aiCommitSearch.store'
import { CommitSearchHistoryList } from './CommitSearchHistoryList'

function run(overrides: Partial<StoredSearchRun> = {}): StoredSearchRun {
  return {
    id: 'run-1',
    question: 'Did the Button change?',
    answer: '**Yes.**',
    matches: [],
    scanned: 42,
    failed: 0,
    truncated: false,
    sinceHours: 720,
    sinceEpoch: 1_781_395_200,
    ranAt: Date.now() - 60_000,
    model: 'qwen3',
    ...overrides,
  }
}

function renderList(overrides: Partial<Parameters<typeof CommitSearchHistoryList>[0]> = {}) {
  const props = {
    runs: [run()],
    activeRunId: null,
    onOpen: vi.fn(),
    onRemove: vi.fn(),
    onClearAll: vi.fn(),
    ...overrides,
  }
  return { ...render(<CommitSearchHistoryList {...props} />), props }
}

describe('CommitSearchHistoryList', () => {
  it('says plainly when nothing has been asked yet', () => {
    renderList({ runs: [] })
    expect(screen.getByTestId('commit-search-history-empty')).toHaveTextContent(
      'No saved search yet for this repository.'
    )
    expect(screen.queryByTestId('commit-search-history-clear')).not.toBeInTheDocument()
  })

  it('reports what each run actually read, and by which model', () => {
    // Which model answered changes how much an old answer is worth — so it is on screen.
    renderList({ runs: [run({ matches: [], scanned: 42 })] })
    const entry = screen.getByTestId('commit-search-history-run-1')
    expect(entry).toHaveTextContent('42 commits read')
    expect(entry).toHaveTextContent('0 found')
    expect(entry).toHaveTextContent('qwen3')
  })

  it('reopens a run', async () => {
    const user = userEvent.setup()
    const { props } = renderList()
    await user.click(screen.getByText('Did the Button change?'))
    expect(props.onOpen).toHaveBeenCalledWith(props.runs[0])
  })

  it('deletes one run', async () => {
    const user = userEvent.setup()
    const { props } = renderList()
    await user.click(screen.getByTestId('commit-search-history-remove-run-1'))
    expect(props.onRemove).toHaveBeenCalledWith('run-1')
  })

  it('clears the whole history', async () => {
    const user = userEvent.setup()
    const { props } = renderList()
    await user.click(screen.getByTestId('commit-search-history-clear'))
    expect(props.onClearAll).toHaveBeenCalled()
  })

  it('marks the run currently on screen', () => {
    renderList({ activeRunId: 'run-1' })
    expect(screen.getByTestId('commit-search-history-run-1').className).toContain('border-primary')
  })
})
