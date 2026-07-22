import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const { openFolder } = vi.hoisted(() => ({ openFolder: vi.fn() }))
vi.mock('../../api/activityLog.api', () => ({ apiOpenActivityLogsDir: openFolder }))

import { ActivityLogsPage } from './ActivityLogsPage'
import { useActivityLogStore } from '../../stores/activityLog.store'
import { useRepoUIStore } from '../../stores/repoUI.store'
import type { ActivityLogEntry } from '../../stores/activityLog.store'

let counter = 0
function makeEntry(overrides: Partial<ActivityLogEntry> = {}): ActivityLogEntry {
  counter += 1
  return {
    id: `id-${counter}`,
    timestamp: Date.now(),
    command: 'get_log',
    durationMs: 4,
    status: 'ok',
    ...overrides,
  }
}

beforeEach(() => {
  openFolder.mockReset()
  useActivityLogStore.setState({ entries: [] })
  useRepoUIStore.setState({ activeRepo: null })
})

describe('ActivityLogsPage', () => {
  it('renders the title (capture is always on, no toggle)', () => {
    render(<ActivityLogsPage onClose={() => {}} />)
    expect(screen.getByText('Activity Logs')).toBeInTheDocument()
    expect(screen.queryByTestId('activity-enable-toggle')).not.toBeInTheDocument()
  })

  it('shows the application empty state when there is no activity yet', () => {
    render(<ActivityLogsPage onClose={() => {}} />)
    expect(screen.getByTestId('activity-empty')).toHaveTextContent(
      'No operations recorded yet. Perform an action in the app.'
    )
  })

  it('renders one flat log line per operation', () => {
    useActivityLogStore.setState({
      entries: [
        makeEntry({ command: 'pin_object', correlationId: 'c1', correlationLabel: 'git.commit' }),
        makeEntry({ command: 'create_commit', correlationId: 'c1', correlationLabel: 'git.commit' }),
      ],
    })
    render(<ActivityLogsPage onClose={() => {}} />)
    expect(screen.getAllByTestId('activity-log-row')).toHaveLength(2)
  })

  it('opens a detail panel with the action recap when a line is clicked', () => {
    useActivityLogStore.setState({
      entries: [makeEntry({ command: 'pull', correlationId: 'c1', correlationLabel: 'git.pull' })],
    })
    render(<ActivityLogsPage onClose={() => {}} />)
    expect(screen.queryByTestId('activity-log-detail')).not.toBeInTheDocument()
    fireEvent.click(screen.getAllByTestId('activity-log-row')[0])
    const detail = screen.getByTestId('activity-log-detail')
    // The recap surfaces the git terminal command for the action.
    expect(detail).toHaveTextContent('git pull')
    // And closing dismisses it.
    fireEvent.click(screen.getByTestId('activity-detail-close'))
    expect(screen.queryByTestId('activity-log-detail')).not.toBeInTheDocument()
  })

  it('traces every operation sharing the correlation id in the detail recap', () => {
    useActivityLogStore.setState({
      entries: [
        makeEntry({ command: 'pin_object', correlationId: 'c1', correlationLabel: 'git.commit' }),
        makeEntry({ command: 'create_commit', correlationId: 'c1', correlationLabel: 'git.commit' }),
      ],
    })
    render(<ActivityLogsPage onClose={() => {}} />)
    fireEvent.click(screen.getAllByTestId('activity-log-row')[0])
    const detail = screen.getByTestId('activity-log-detail')
    expect(detail).toHaveTextContent('pin_object')
    expect(detail).toHaveTextContent('create_commit')
    expect(detail).toHaveTextContent('c1') // the correlation id is shown in the panel
  })

  it('offers no trace link for an operation without a correlation id', () => {
    useActivityLogStore.setState({ entries: [makeEntry({ command: 'get_status' })] })
    render(<ActivityLogsPage onClose={() => {}} />)
    fireEvent.click(screen.getAllByTestId('activity-log-row')[0])
    expect(screen.getByTestId('activity-log-detail')).toBeInTheDocument()
    expect(screen.queryByTestId('activity-detail-trace')).not.toBeInTheDocument()
  })

  it('traces a multi-operation action to its flow via the correlation id', () => {
    useActivityLogStore.setState({
      entries: [
        makeEntry({ command: 'pin_object', correlationId: 'c1', correlationLabel: 'git.commit' }),
        makeEntry({ command: 'create_commit', correlationId: 'c1', correlationLabel: 'git.commit' }),
        makeEntry({ command: 'get_status' }),
      ],
    })
    render(<ActivityLogsPage onClose={() => {}} />)
    expect(screen.getAllByTestId('activity-log-row')).toHaveLength(3)
    fireEvent.click(screen.getAllByTestId('activity-log-row')[0])
    fireEvent.click(screen.getByTestId('activity-detail-trace'))
    expect(screen.getByTestId('activity-trace-chip')).toBeInTheDocument()
    expect(screen.getAllByTestId('activity-log-row')).toHaveLength(2)
    fireEvent.click(screen.getByTestId('activity-trace-clear'))
    expect(screen.getAllByTestId('activity-log-row')).toHaveLength(3)
  })

  it('copies the payload from the detail panel', () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    useActivityLogStore.setState({
      entries: [makeEntry({ command: 'open_repo', args: { path: '/repo' } })],
    })
    render(<ActivityLogsPage onClose={() => {}} />)
    fireEvent.click(screen.getAllByTestId('activity-log-row')[0])
    fireEvent.click(screen.getByTestId('activity-detail-copy-data'))
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/repo'))
  })

  it('filters lines by the search box', () => {
    useActivityLogStore.setState({
      entries: [makeEntry({ command: 'pull' }), makeEntry({ command: 'push' })],
    })
    render(<ActivityLogsPage onClose={() => {}} />)
    fireEvent.change(screen.getByTestId('activity-filter-input'), { target: { value: 'pull' } })
    const rows = screen.getAllByTestId('activity-log-row')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveAttribute('data-command', 'pull')
  })

  it('filters to error lines only via the level dropdown', () => {
    useActivityLogStore.setState({
      entries: [
        makeEntry({ command: 'pull', status: 'ok' }),
        makeEntry({ command: 'push', status: 'error', error: 'boom' }),
      ],
    })
    render(<ActivityLogsPage onClose={() => {}} />)
    fireEvent.change(screen.getByTestId('activity-level-filter'), { target: { value: 'error' } })
    const rows = screen.getAllByTestId('activity-log-row')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveAttribute('data-command', 'push')
  })

  it('shows a no-match empty state when the filter excludes everything', () => {
    useActivityLogStore.setState({ entries: [makeEntry({ command: 'pull' })] })
    render(<ActivityLogsPage onClose={() => {}} />)
    fireEvent.change(screen.getByTestId('activity-filter-input'), { target: { value: 'zzzz' } })
    expect(screen.getByTestId('activity-empty')).toHaveTextContent(
      'No log lines match your filter.'
    )
  })

  it('disables the repository scope when no repository is active', () => {
    render(<ActivityLogsPage onClose={() => {}} />)
    expect(screen.getByTestId('activity-scope-repository')).toBeDisabled()
  })

  it('filters to the active repository when repository scope is selected', () => {
    useRepoUIStore.setState({ activeRepo: '/repo-a' })
    useActivityLogStore.setState({
      entries: [
        makeEntry({ command: 'pull', repoPath: '/repo-a' }),
        makeEntry({ command: 'push', repoPath: '/repo-b' }),
      ],
    })
    render(<ActivityLogsPage onClose={() => {}} />)
    fireEvent.click(screen.getByTestId('activity-scope-repository'))
    const rows = screen.getAllByTestId('activity-log-row')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveAttribute('data-command', 'pull')
  })

  it('opens the logs folder when the button is clicked', () => {
    render(<ActivityLogsPage onClose={() => {}} />)
    fireEvent.click(screen.getByTestId('activity-open-folder'))
    expect(openFolder).toHaveBeenCalledOnce()
  })

  it('copies a single line from its hover button without selecting the row', () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    useActivityLogStore.setState({ entries: [makeEntry({ command: 'pull' })] })
    render(<ActivityLogsPage onClose={() => {}} />)
    fireEvent.click(screen.getByTestId('activity-copy-line'))
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('pull'))
    expect(screen.queryByTestId('activity-log-detail')).not.toBeInTheDocument()
  })

  it('calls onClose from the back button', () => {
    const onClose = vi.fn()
    render(<ActivityLogsPage onClose={onClose} />)
    fireEvent.click(screen.getByText('Back'))
    expect(onClose).toHaveBeenCalled()
  })
})
