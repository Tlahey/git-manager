import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { GitCommit } from '@git-manager/git-types'

vi.mock('@git-manager/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key,
  }),
}))
vi.mock('../../hooks/useTheme', () => ({ useTheme: vi.fn() }))
vi.mock('../../hooks/useMonacoTheme', () => ({ useMonacoTheme: vi.fn() }))
vi.mock('../../api/git.api', () => ({
  apiListRebaseCommits: vi.fn(),
  apiRunInteractiveRebase: vi.fn(),
}))

const { closeWindow, emitMock } = vi.hoisted(() => ({ closeWindow: vi.fn(), emitMock: vi.fn() }))
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ close: closeWindow }) }))
vi.mock('@tauri-apps/api/event', () => ({ emit: emitMock }))

const { lastStepRailCalls, lastDetailsProps } = vi.hoisted(() => ({
  lastStepRailCalls: { current: [] as Record<string, unknown>[] },
  lastDetailsProps: { current: null as Record<string, unknown> | null },
}))
vi.mock('@git-manager/components', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@git-manager/components')>()
  return {
    ...actual,
    StepRailRow: (props: Record<string, unknown>) => {
      lastStepRailCalls.current.push(props)
      return (
        <div
          data-testid={props.testId as string}
          onClick={(e) =>
            (props.onRowClick as (i: number, e: unknown) => void)(props.index as number, e)
          }
        >
          {props.title as string}
        </div>
      )
    },
  }
})
vi.mock('./components/RebaseCommitDetails', () => ({
  RebaseCommitDetails: (props: Record<string, unknown>) => {
    lastDetailsProps.current = props
    return <div data-testid="rebase-commit-details" />
  },
}))

import { apiListRebaseCommits, apiRunInteractiveRebase } from '../../api/git.api'
import { RebasingCommitWindow } from './RebasingCommitWindow'
import { queryClient } from '../../lib/queryClient'

const mockedListCommits = apiListRebaseCommits as unknown as ReturnType<typeof vi.fn>
const mockedRunRebase = apiRunInteractiveRebase as unknown as ReturnType<typeof vi.fn>

function commit(oid: string, overrides: Partial<GitCommit> = {}): GitCommit {
  return {
    oid,
    shortOid: oid.slice(0, 7),
    message: `Subject ${oid}`,
    subject: `Subject ${oid}`,
    body: '',
    author: { name: 'Ada Lovelace', email: 'ada@example.com', timestamp: 0 },
    committer: { name: 'Ada Lovelace', email: 'ada@example.com', timestamp: 0 },
    parentOids: [],
    ...overrides,
  }
}

function renderWindow(props: Partial<{ repoPath: string; baseOid: string }> = {}) {
  return render(<RebasingCommitWindow repoPath="/repo" baseOid="base123" {...props} />)
}

// StepRailRow re-renders on every state change, and calls just accumulate in lastStepRailCalls
// across the whole test — search from the end to get the most recent render's props. (Using
// slice().reverse().find() instead of Array.prototype.findLast, which needs an ES2023 lib target.)
function stepRow(oid: string) {
  return lastStepRailCalls.current
    .slice()
    .reverse()
    .find((c) => (c.testId as string) === `rebase-step-${oid.slice(0, 7)}`)!
}

beforeEach(() => {
  vi.clearAllMocks()
  queryClient.clear()
  lastStepRailCalls.current = []
  lastDetailsProps.current = null
  mockedListCommits.mockResolvedValue([])
})

describe('RebasingCommitWindow — loading and plan rendering', () => {
  it('shows a loading spinner while commits load', () => {
    mockedListCommits.mockReturnValue(new Promise(() => {}))
    renderWindow()
    expect(document.querySelector('.animate-spin')).toBeTruthy()
  })

  it('renders one step row per commit, oldest first, all "pick" by default', async () => {
    mockedListCommits.mockResolvedValue([commit('aaa1111'), commit('bbb2222')])
    renderWindow()
    await waitFor(() => expect(lastStepRailCalls.current.length).toBeGreaterThan(0))
    expect(stepRow('aaa1111')).toMatchObject({ badgeLabel: 'pick', index: 0 })
    expect(stepRow('bbb2222')).toMatchObject({ badgeLabel: 'pick', index: 1 })
  })

  it('shows the commit count in the header', async () => {
    mockedListCommits.mockResolvedValue([commit('aaa1111'), commit('bbb2222')])
    renderWindow()
    await waitFor(() =>
      expect(screen.getByText('rebaseEditor.commitCount:{"count":2}')).toBeInTheDocument()
    )
  })
})

describe('RebasingCommitWindow — selection and details panel', () => {
  it('shows a hint when nothing is selected', async () => {
    mockedListCommits.mockResolvedValue([commit('aaa1111')])
    renderWindow()
    await waitFor(() => expect(screen.getByText('rebaseEditor.selectHint')).toBeInTheDocument())
  })

  it('selects a row on click and shows its details', async () => {
    mockedListCommits.mockResolvedValue([commit('aaa1111'), commit('bbb2222')])
    const user = userEvent.setup()
    renderWindow()
    await waitFor(() => expect(lastStepRailCalls.current.length).toBeGreaterThan(0))
    await user.click(screen.getByTestId('rebase-step-aaa1111'))
    expect(screen.getByTestId('rebase-commit-details')).toBeInTheDocument()
    expect((lastDetailsProps.current!.commit as GitCommit).oid).toBe('aaa1111')
  })

  it('ctrl/cmd-click adds to the multi-selection', async () => {
    mockedListCommits.mockResolvedValue([commit('aaa1111'), commit('bbb2222')])
    renderWindow()
    await waitFor(() => expect(lastStepRailCalls.current.length).toBeGreaterThan(0))
    act(() => (stepRow('aaa1111').onRowClick as (i: number, e: unknown) => void)(0, {}))
    act(() =>
      (stepRow('bbb2222').onRowClick as (i: number, e: unknown) => void)(1, { ctrlKey: true })
    )

    expect(stepRow('aaa1111').isSelected).toBe(true)
    expect(stepRow('bbb2222').isSelected).toBe(true)
  })
})

describe('RebasingCommitWindow — reword', () => {
  it('enables reword only for a single selection', async () => {
    mockedListCommits.mockResolvedValue([commit('aaa1111'), commit('bbb2222')])
    const user = userEvent.setup()
    renderWindow()
    await waitFor(() => expect(lastStepRailCalls.current.length).toBeGreaterThan(0))
    expect(screen.getByTestId('rebase-reword')).toBeDisabled()

    await user.click(screen.getByTestId('rebase-step-aaa1111'))
    expect(screen.getByTestId('rebase-reword')).toBeEnabled()
  })

  it('opens the reword editor pre-filled with the commit message, and saves the new message', async () => {
    mockedListCommits.mockResolvedValue([commit('aaa1111', { message: 'Original message' })])
    const user = userEvent.setup()
    renderWindow()
    await waitFor(() => expect(lastStepRailCalls.current.length).toBeGreaterThan(0))
    await user.click(screen.getByTestId('rebase-step-aaa1111'))
    await user.click(screen.getByTestId('rebase-reword'))

    expect(screen.getByTestId('rebase-reword-input')).toHaveValue('Original message')
    await user.clear(screen.getByTestId('rebase-reword-input'))
    await user.type(screen.getByTestId('rebase-reword-input'), 'New message')
    await user.click(screen.getByText('rebaseEditor.saveMessage'))

    await waitFor(() => expect(stepRow('aaa1111').badgeLabel).toBe('reword'))
  })

  it('cancels the reword editor without changing the action', async () => {
    mockedListCommits.mockResolvedValue([commit('aaa1111')])
    const user = userEvent.setup()
    renderWindow()
    await waitFor(() => expect(lastStepRailCalls.current.length).toBeGreaterThan(0))
    await user.click(screen.getByTestId('rebase-step-aaa1111'))
    await user.click(screen.getByTestId('rebase-reword'))
    await user.click(screen.getByText('rebaseEditor.cancelEdit'))

    expect(screen.queryByTestId('rebase-reword-input')).not.toBeInTheDocument()
    expect(stepRow('aaa1111').badgeLabel).toBe('pick')
  })
})

describe('RebasingCommitWindow — combine (squash/fixup)', () => {
  it('requires at least two selected commits', async () => {
    mockedListCommits.mockResolvedValue([commit('aaa1111')])
    const user = userEvent.setup()
    renderWindow()
    await waitFor(() => expect(lastStepRailCalls.current.length).toBeGreaterThan(0))
    await user.click(screen.getByTestId('rebase-step-aaa1111'))
    expect(screen.getByTestId('rebase-squash')).toBeDisabled()
  })

  it('squashes into the oldest selected commit, keeping messages', async () => {
    mockedListCommits.mockResolvedValue([commit('aaa1111'), commit('bbb2222')])
    const user = userEvent.setup()
    renderWindow()
    await waitFor(() => expect(lastStepRailCalls.current.length).toBeGreaterThan(0))
    ;(stepRow('aaa1111').onRowClick as (i: number, e: unknown) => void)(0, {})
    ;(stepRow('bbb2222').onRowClick as (i: number, e: unknown) => void)(1, { ctrlKey: true })

    await user.click(screen.getByTestId('rebase-squash'))
    await user.click(screen.getByText('rebaseEditor.squashKeepMessages'))

    await waitFor(() => expect(stepRow('bbb2222').badgeLabel).toBe('squash'))
  })

  it('fixups into the oldest selected commit, discarding the message', async () => {
    mockedListCommits.mockResolvedValue([commit('aaa1111'), commit('bbb2222')])
    const user = userEvent.setup()
    renderWindow()
    await waitFor(() => expect(lastStepRailCalls.current.length).toBeGreaterThan(0))
    ;(stepRow('aaa1111').onRowClick as (i: number, e: unknown) => void)(0, {})
    ;(stepRow('bbb2222').onRowClick as (i: number, e: unknown) => void)(1, { ctrlKey: true })

    await user.click(screen.getByTestId('rebase-squash'))
    await user.click(screen.getByText('rebaseEditor.fixupDiscardMessage'))

    await waitFor(() => expect(stepRow('bbb2222').badgeLabel).toBe('fixup'))
  })
})

describe('RebasingCommitWindow — drop/restore', () => {
  it('drops the selected commit(s), then restores them', async () => {
    mockedListCommits.mockResolvedValue([commit('aaa1111')])
    const user = userEvent.setup()
    renderWindow()
    await waitFor(() => expect(lastStepRailCalls.current.length).toBeGreaterThan(0))
    await user.click(screen.getByTestId('rebase-step-aaa1111'))
    await user.click(screen.getByTestId('rebase-drop'))
    await waitFor(() => expect(stepRow('aaa1111').badgeLabel).toBe('drop'))
    expect(screen.getByTestId('rebase-drop')).toHaveTextContent('rebaseEditor.restore')

    await user.click(screen.getByTestId('rebase-drop'))
    await waitFor(() => expect(stepRow('aaa1111').badgeLabel).toBe('pick'))
  })
})

describe('RebasingCommitWindow — drag reorder', () => {
  it('reorders the plan on drag start/over/drop', async () => {
    mockedListCommits.mockResolvedValue([commit('aaa1111'), commit('bbb2222')])
    renderWindow()
    await waitFor(() => expect(lastStepRailCalls.current.length).toBeGreaterThan(0))

    // onDragStart mutates a plain ref (no re-render), so it doesn't need act(); onDragOverRow
    // and onDrop both trigger setState and must be flushed before the next call reads fresh props.
    ;(stepRow('aaa1111').onDragStart as (i: number) => void)(0)
    act(() => (stepRow('aaa1111').onDragOverRow as (i: number) => void)(1))
    act(() => (stepRow('aaa1111').onDrop as () => void)())

    expect(stepRow('bbb2222').index).toBe(0)
    expect(stepRow('aaa1111').index).toBe(1)
  })
})

describe('RebasingCommitWindow — plan validation', () => {
  it('disables Start Rebasing and shows an error when everything is dropped', async () => {
    mockedListCommits.mockResolvedValue([commit('aaa1111')])
    const user = userEvent.setup()
    renderWindow()
    await waitFor(() => expect(lastStepRailCalls.current.length).toBeGreaterThan(0))
    await user.click(screen.getByTestId('rebase-step-aaa1111'))
    await user.click(screen.getByTestId('rebase-drop'))

    await waitFor(() =>
      expect(screen.getByText('rebaseEditor.errorAllDropped')).toBeInTheDocument()
    )
    expect(screen.getByTestId('rebase-start')).toBeDisabled()
  })
})

describe('RebasingCommitWindow — start rebasing / cancel', () => {
  it('runs the interactive rebase, emits, and closes the window', async () => {
    mockedListCommits.mockResolvedValue([commit('aaa1111')])
    mockedRunRebase.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderWindow()
    await waitFor(() => expect(screen.getByTestId('rebase-start')).toBeEnabled())
    await user.click(screen.getByTestId('rebase-start'))

    await waitFor(() =>
      expect(mockedRunRebase).toHaveBeenCalledWith('/repo', 'base123', [
        { action: 'pick', oid: 'aaa1111', message: undefined },
      ])
    )
    expect(emitMock).toHaveBeenCalledWith('fixup-committed', { repoPath: '/repo' })
    expect(closeWindow).toHaveBeenCalledOnce()
  })

  it('shows an inline error and does not close on failure', async () => {
    mockedListCommits.mockResolvedValue([commit('aaa1111')])
    mockedRunRebase.mockRejectedValue(new Error('rebase failed'))
    const user = userEvent.setup()
    renderWindow()
    await waitFor(() => expect(screen.getByTestId('rebase-start')).toBeEnabled())
    await user.click(screen.getByTestId('rebase-start'))

    expect(await screen.findByText(/rebase failed/)).toBeInTheDocument()
    expect(closeWindow).not.toHaveBeenCalled()
  })

  it('closes the window via Cancel without running the rebase', async () => {
    mockedListCommits.mockResolvedValue([commit('aaa1111')])
    const user = userEvent.setup()
    renderWindow()
    await waitFor(() => expect(screen.getByTestId('rebase-cancel')).toBeInTheDocument())
    await user.click(screen.getByTestId('rebase-cancel'))
    expect(closeWindow).toHaveBeenCalledOnce()
    expect(mockedRunRebase).not.toHaveBeenCalled()
  })
})
