import { describe, it, expect, beforeEach } from 'vitest'
import { emptyNotchQueue } from '@git-manager/notch'
import { useNotchQueueStore } from './notchQueue.store'
import type { NotchRequest } from '../lib/notifications/notchDelivery'

function request(id: string, tone: NotchRequest['model']['tone'] = 'info'): NotchRequest {
  return {
    model: { kind: 'event', id, tone, eyebrow: id.toUpperCase(), title: id },
    importance: 'key',
  }
}

function ids(): string[] {
  const { queue } = useNotchQueueStore.getState()
  return [
    ...(queue.current ? [queue.current.model.id] : []),
    ...queue.pending.map((entry) => entry.model.id),
  ]
}

beforeEach(() => {
  useNotchQueueStore.setState({ queue: emptyNotchQueue })
})

describe('useNotchQueueStore', () => {
  it('shows the first card and queues the rest', () => {
    const { enqueue } = useNotchQueueStore.getState()
    enqueue(request('a'))
    enqueue(request('b'))
    expect(ids()).toEqual(['a', 'b'])
  })

  it('carries the whole request, not just the card', () => {
    // Route, icon key and importance travel with the model instead of in a parallel map that has
    // to be kept in step.
    useNotchQueueStore.getState().enqueue({
      ...request('a'),
      iconId: 'pr_merged',
      externalUrl: 'https://example.test',
    })
    expect(useNotchQueueStore.getState().queue.current).toMatchObject({
      iconId: 'pr_merged',
      externalUrl: 'https://example.test',
      importance: 'key',
    })
  })

  it('promotes the next card when the current one is dismissed', () => {
    const { enqueue, dismissCurrent } = useNotchQueueStore.getState()
    enqueue(request('a'))
    enqueue(request('b'))
    dismissCurrent()
    expect(ids()).toEqual(['b'])
  })

  it('coalesces on the model id, so a live card updates instead of stacking', () => {
    const { enqueue } = useNotchQueueStore.getState()
    enqueue(request('clone'))
    enqueue({ ...request('clone'), iconId: 'ci_success' })
    expect(ids()).toEqual(['clone'])
    expect(useNotchQueueStore.getState().queue.current?.iconId).toBe('ci_success')
  })

  it('lets a producer withdraw its own card — a cancelled operation', () => {
    const { enqueue, remove } = useNotchQueueStore.getState()
    enqueue(request('a'))
    enqueue(request('clone'))
    remove('clone')
    expect(ids()).toEqual(['a'])
  })

  it('lets an error card cut in front of what is showing', () => {
    const { enqueue } = useNotchQueueStore.getState()
    enqueue(request('merged'))
    enqueue(request('hook-failed', 'error'))
    expect(ids()).toEqual(['hook-failed', 'merged'])
  })

  it('empties completely on clear', () => {
    const { enqueue, clear } = useNotchQueueStore.getState()
    enqueue(request('a'))
    enqueue(request('b'))
    clear()
    expect(ids()).toEqual([])
  })

  it('is not persisted — a notification queued at quit is stale by the next launch', () => {
    // Replaying yesterday's "checks failed" at startup would be worse than silence.
    expect('persist' in useNotchQueueStore).toBe(false)
  })
})
