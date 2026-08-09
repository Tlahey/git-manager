import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { emptyNotchQueue, type NotchModel } from '@git-manager/notch'
import { useNotchOperation } from './useNotchOperation'
import { useNotchQueueStore } from '../stores/notchQueue.store'
import { clearNotchActions, runNotchAction } from '../lib/notifications/notchActions'

function progress(ratio: number): NotchModel {
  return {
    kind: 'progress',
    id: 'commit-search:/repo',
    tone: 'running',
    eyebrow: 'SEARCHING COMMITS',
    title: 'what changed?',
    ratio,
  }
}

function current() {
  return useNotchQueueStore.getState().queue.current
}

beforeEach(() => {
  useNotchQueueStore.setState({ queue: emptyNotchQueue })
  clearNotchActions()
})

describe('useNotchOperation', () => {
  it('puts the card on the notch as soon as there is one', () => {
    renderHook(() => useNotchOperation({ id: 'op', model: progress(0.1) }))
    expect(current()?.model.title).toBe('what changed?')
  })

  it('stamps its own id onto the card, whatever the caller’s model said', () => {
    // The queue coalesces on `model.id`, the removal matches on it and action presses are scoped
    // by it. A caller whose model id drifted would get a card that updates but never goes away.
    renderHook(() => useNotchOperation({ id: 'op', model: progress(0.1) }))
    expect(current()?.model.id).toBe('op')
  })

  it('marks a running operation as ambient, so it never becomes an OS banner', () => {
    // A clone flattened into a banner is either frozen at its first value or forty banners.
    renderHook(() => useNotchOperation({ id: 'op', model: progress(0.1) }))
    expect(current()?.importance).toBe('ambient')
  })

  it('lets a caller ask for a card worth a banner', () => {
    renderHook(() => useNotchOperation({ id: 'op', model: progress(0.1), importance: 'key' }))
    expect(current()?.importance).toBe('key')
  })

  it('carries the route a click on the card should follow', () => {
    renderHook(() =>
      useNotchOperation({
        id: 'op',
        model: progress(0.1),
        route: { kind: 'ai-run', repoPath: '/repo' },
      })
    )
    expect(current()?.route).toEqual({ kind: 'ai-run', repoPath: '/repo' })
  })

  it('leaves the route off entirely when the caller gave none', () => {
    // Absent means "nowhere to navigate"; a click still brings the app forward.
    renderHook(() => useNotchOperation({ id: 'op', model: progress(0.1) }))
    expect(current()?.route).toBeUndefined()
  })

  it('updates in place as the operation progresses', () => {
    const { rerender } = renderHook(
      ({ ratio }: { ratio: number }) => useNotchOperation({ id: 'op', model: progress(ratio) }),
      { initialProps: { ratio: 0.1 } }
    )
    rerender({ ratio: 0.8 })

    expect(useNotchQueueStore.getState().queue.pending).toHaveLength(0)
    expect(current()?.model).toMatchObject({ ratio: 0.8 })
  })

  it('does not touch the queue when nothing about the card changed', () => {
    // A model is rebuilt every render; without this guard an unrelated keystroke elsewhere would
    // push a `notch://update` at the window.
    const enqueue = vi.spyOn(useNotchQueueStore.getState(), 'enqueue')
    const { rerender } = renderHook(() => useNotchOperation({ id: 'op', model: progress(0.5) }))
    const before = enqueue.mock.calls.length
    rerender()
    rerender()

    expect(enqueue.mock.calls.length).toBe(before)
  })

  it('takes the card off when the operation ends', () => {
    const { rerender } = renderHook(
      ({ model }: { model: NotchModel | null }) => useNotchOperation({ id: 'op', model }),
      { initialProps: { model: progress(0.5) as NotchModel | null } }
    )
    rerender({ model: null })

    expect(current()).toBeNull()
  })

  it('shows nothing while disabled, and appears the moment it is enabled', () => {
    // The gate the search uses: the panel in front of the user is a better place to watch a run
    // than a card duplicating it.
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useNotchOperation({ id: 'op', model: progress(0.5), enabled }),
      { initialProps: { enabled: false } }
    )
    expect(current()).toBeNull()

    rerender({ enabled: true })
    expect(current()?.model.id).toBe('op')
  })

  it('withdraws the card when it is disabled again mid-run', () => {
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useNotchOperation({ id: 'op', model: progress(0.5), enabled }),
      { initialProps: { enabled: true } }
    )
    rerender({ enabled: false })
    expect(current()).toBeNull()
  })

  it('leaves no card pinned to the screen when its owner unmounts', () => {
    const { unmount } = renderHook(() => useNotchOperation({ id: 'op', model: progress(0.5) }))
    unmount()
    expect(current()).toBeNull()
  })
})

describe('useNotchOperation — actions', () => {
  it('runs the caller’s handler when its button is pressed', () => {
    const cancel = vi.fn()
    renderHook(() => useNotchOperation({ id: 'op', model: progress(0.5), actions: { cancel } }))

    expect(runNotchAction('cancel', { notchId: 'op' })).toBe(true)
    expect(cancel).toHaveBeenCalled()
  })

  it('ignores a press meant for someone else’s card', () => {
    // Two repositories running the same kind of operation must not cancel each other.
    const cancel = vi.fn()
    renderHook(() => useNotchOperation({ id: 'repo-a', model: progress(0.5), actions: { cancel } }))

    runNotchAction('cancel', { notchId: 'repo-b' })
    expect(cancel).not.toHaveBeenCalled()
  })

  it('always calls the latest handler, not the one from the first render', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(
      ({ handler }: { handler: () => void }) =>
        useNotchOperation({ id: 'op', model: progress(0.5), actions: { cancel: handler } }),
      { initialProps: { handler: first } }
    )
    rerender({ handler: second })

    runNotchAction('cancel', { notchId: 'op' })
    expect(second).toHaveBeenCalled()
    expect(first).not.toHaveBeenCalled()
  })

  it('does not re-register on every render', () => {
    // Re-registering would warn about a duplicate id on each frame of a minutes-long operation.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { rerender } = renderHook(() =>
      useNotchOperation({ id: 'op', model: progress(0.5), actions: { cancel: vi.fn() } })
    )
    rerender()
    rerender()

    expect(warn).not.toHaveBeenCalled()
  })

  it('unregisters on unmount, so a later press finds nobody', () => {
    const { unmount } = renderHook(() =>
      useNotchOperation({ id: 'op', model: progress(0.5), actions: { cancel: vi.fn() } })
    )
    unmount()

    expect(runNotchAction('cancel', { notchId: 'op' })).toBe(false)
  })
})
