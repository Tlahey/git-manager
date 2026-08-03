import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

vi.mock('@git-manager/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))

import { TimelineBar } from './TimelineBar'
import { useTimelineNavStore } from '../../stores/timelineNav.store'
import { useUndoHistoryStore } from '../../stores/undoHistory.store'
import type { UndoAction } from '../../lib/undoActions'

function commit(id: string, previousOid: string, newOid: string): UndoAction {
  return {
    id,
    label: { key: 'undoRedo.commit' },
    timestamp: 0,
    pinnedRefs: [],
    type: 'commit',
    previousOid,
    newOid,
  }
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const STACK = [commit('a', 'oid0', 'oid1'), commit('b', 'oid1', 'oid2')]

beforeEach(() => {
  useTimelineNavStore.setState({ isOpen: false, repoPath: null, previewIndex: 0 })
  useUndoHistoryStore.setState({ byRepo: { '/repo': { stack: STACK, pointer: 2 } } })
})

describe('TimelineBar', () => {
  it('renders nothing when the timeline is closed', () => {
    render(<TimelineBar repoPath="/repo" />, { wrapper })
    expect(screen.queryByTestId('timeline-steps-panel')).not.toBeInTheDocument()
  })

  it('renders nothing when open for a different repo', () => {
    useTimelineNavStore.getState().open('/other', 2)
    render(<TimelineBar repoPath="/repo" />, { wrapper })
    expect(screen.queryByTestId('timeline-steps-panel')).not.toBeInTheDocument()
  })

  it('renders the panel and scrubber when open for the active repo', () => {
    useTimelineNavStore.getState().open('/repo', 2)
    render(<TimelineBar repoPath="/repo" />, { wrapper })
    expect(screen.getByTestId('timeline-steps-panel')).toBeInTheDocument()
    expect(screen.getByTestId('timeline-scrubber')).toBeInTheDocument()
    // base + 2 actions = 3 steps
    expect(screen.getByTestId('timeline-step-0')).toBeInTheDocument()
    expect(screen.getByTestId('timeline-step-2')).toBeInTheDocument()
  })

  it('disables validate when the preview is on the current position', () => {
    useTimelineNavStore.getState().open('/repo', 2)
    render(<TimelineBar repoPath="/repo" />, { wrapper })
    expect(screen.getByTestId('timeline-scrubber-validate')).toBeDisabled()
  })

  it('replays undo the right number of times on validate and closes', async () => {
    const user = userEvent.setup()
    const undoSpy = vi.fn().mockResolvedValue(undefined)
    const redoSpy = vi.fn().mockResolvedValue(undefined)
    useUndoHistoryStore.setState({ undo: undoSpy, redo: redoSpy })

    useTimelineNavStore.getState().open('/repo', 0) // preview initial state, pointer at 2 → undo ×2
    render(<TimelineBar repoPath="/repo" />, { wrapper })

    await user.click(screen.getByTestId('timeline-scrubber-validate'))

    await waitFor(() => expect(undoSpy).toHaveBeenCalledTimes(2))
    expect(redoSpy).not.toHaveBeenCalled()
    expect(useTimelineNavStore.getState().isOpen).toBe(false)
  })

  // The store moves a whole gesture per `undo()` call, so the overlay has to count steps in
  // gestures too — one call per step it walks back. Counting raw entries would ask for two undos to
  // cross a two-operation gesture and take back the gesture *before* it as well.
  it('spends one undo call per gesture, not per git operation', async () => {
    const user = userEvent.setup()
    const undoSpy = vi.fn().mockResolvedValue(undefined)
    const redoSpy = vi.fn().mockResolvedValue(undefined)
    const gesture = [
      { ...commit('create', 'oid0', 'oid1'), correlationId: 'corr-1' },
      { ...commit('checkout', 'oid1', 'oid2'), correlationId: 'corr-1' },
      commit('later', 'oid2', 'oid3'),
    ]
    useUndoHistoryStore.setState({
      byRepo: { '/repo': { stack: gesture, pointer: 3 } },
      undo: undoSpy,
      redo: redoSpy,
    })

    // base + gesture + lone action = 3 steps, so "actual" sits at 2 and the base is 2 steps back.
    useTimelineNavStore.getState().open('/repo', 0)
    render(<TimelineBar repoPath="/repo" />, { wrapper })
    expect(screen.queryByTestId('timeline-step-3')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('timeline-scrubber-validate'))

    await waitFor(() => expect(undoSpy).toHaveBeenCalledTimes(2))
  })

  it('closes without mutating on cancel', async () => {
    const user = userEvent.setup()
    const undoSpy = vi.fn().mockResolvedValue(undefined)
    const redoSpy = vi.fn().mockResolvedValue(undefined)
    useUndoHistoryStore.setState({ undo: undoSpy, redo: redoSpy })

    useTimelineNavStore.getState().open('/repo', 0)
    render(<TimelineBar repoPath="/repo" />, { wrapper })

    await user.click(screen.getByTestId('timeline-scrubber-cancel'))

    expect(undoSpy).not.toHaveBeenCalled()
    expect(redoSpy).not.toHaveBeenCalled()
    expect(useTimelineNavStore.getState().isOpen).toBe(false)
  })
})
