import { describe, it, expect } from 'vitest'
import {
  dismissCurrentNotch,
  emptyNotchQueue,
  enqueueNotch,
  notchQueueSize,
  removeNotch,
  type NotchQueueEntry,
  type NotchQueueState,
} from './notchQueue'
import type { NotchEventModel, NotchProgressModel, NotchStatusModel } from './types'

/** A consumer's own entry shape: a model plus whatever else it needs to carry alongside it. */
interface TestEntry extends NotchQueueEntry {
  label?: string
}

function event(id: string, tone: NotchEventModel['tone'] = 'info'): TestEntry {
  return { model: { kind: 'event', id, tone, eyebrow: id.toUpperCase(), title: id } }
}

function progress(id: string, ratio?: number): TestEntry {
  return {
    model: {
      kind: 'progress',
      id,
      tone: 'running',
      eyebrow: 'RUNNING',
      title: id,
      ...(ratio !== undefined ? { ratio } : {}),
    },
  }
}

function failure(id: string): TestEntry {
  return { model: { kind: 'status', id, tone: 'error', eyebrow: 'FAILED', title: id } }
}

function ids(state: NotchQueueState<TestEntry>): string[] {
  return [
    ...(state.current ? [state.current.model.id] : []),
    ...state.pending.map((entry) => entry.model.id),
  ]
}

function ratioOf(entry: TestEntry | undefined): number | undefined {
  return (entry?.model as NotchProgressModel | undefined)?.ratio
}

describe('enqueueNotch', () => {
  it('shows the first card immediately', () => {
    const state = enqueueNotch<TestEntry>(emptyNotchQueue, event('a'))
    expect(state.current?.model.id).toBe('a')
    expect(state.pending).toEqual([])
  })

  it('queues the second one behind it instead of destroying the first', () => {
    // The behaviour this whole module exists for: the old popover reused one window label, so a
    // second notification replaced the first mid-read.
    let state = enqueueNotch<TestEntry>(emptyNotchQueue, event('a'))
    state = enqueueNotch(state, event('b'))
    expect(ids(state)).toEqual(['a', 'b'])
  })

  it('carries the consumer’s own fields through untouched', () => {
    // The queue orders on the model; everything else on the entry is the consumer's business.
    const state = enqueueNotch<TestEntry>(emptyNotchQueue, { ...event('a'), label: 'from a hook' })
    expect(state.current?.label).toBe('from a hook')
  })

  it('coalesces a card that carries an id already on screen', () => {
    let state = enqueueNotch<TestEntry>(emptyNotchQueue, progress('clone', 0.1))
    state = enqueueNotch(state, progress('clone', 0.6))
    expect(state.pending).toEqual([])
    expect(ratioOf(state.current ?? undefined)).toBe(0.6)
  })

  it('coalesces a card that is still waiting, without reordering it', () => {
    let state = enqueueNotch<TestEntry>(emptyNotchQueue, event('a'))
    state = enqueueNotch(state, progress('clone', 0.1))
    state = enqueueNotch(state, event('c'))
    state = enqueueNotch(state, progress('clone', 0.9))

    expect(ids(state)).toEqual(['a', 'clone', 'c'])
    expect(ratioOf(state.pending[0])).toBe(0.9)
  })

  it('lets an error take the notch from a lower-priority card', () => {
    let state = enqueueNotch<TestEntry>(emptyNotchQueue, event('a'))
    state = enqueueNotch(state, failure('hook'))
    expect(ids(state)).toEqual(['hook', 'a'])
  })

  it('gives the card it displaced the next slot, ahead of its equals', () => {
    let state = enqueueNotch<TestEntry>(emptyNotchQueue, event('showing'))
    state = enqueueNotch(state, event('waiting'))
    state = enqueueNotch(state, failure('hook'))
    expect(ids(state)).toEqual(['hook', 'showing', 'waiting'])
  })

  it('does not let an ordinary event interrupt a running progress card', () => {
    let state = enqueueNotch<TestEntry>(emptyNotchQueue, progress('fetch'))
    state = enqueueNotch(state, event('merged'))
    expect(ids(state)).toEqual(['fetch', 'merged'])
  })

  it('does not let a progress card yank an event out from under the reader', () => {
    // Progress outranks events in the *waiting list*, but that is a scheduling question — it is
    // not a licence to take over the screen mid-read.
    let state = enqueueNotch<TestEntry>(emptyNotchQueue, event('merged'))
    state = enqueueNotch(state, progress('fetch'))
    expect(ids(state)).toEqual(['merged', 'fetch'])
  })

  it('does not let an error preempt another error', () => {
    let state = enqueueNotch<TestEntry>(emptyNotchQueue, failure('first'))
    state = enqueueNotch(state, failure('second'))
    expect(ids(state)).toEqual(['first', 'second'])
  })

  it('orders the waiting list by priority', () => {
    let state = enqueueNotch<TestEntry>(emptyNotchQueue, failure('blocking'))
    state = enqueueNotch(state, event('low'))
    state = enqueueNotch(state, progress('mid'))
    expect(ids(state)).toEqual(['blocking', 'mid', 'low'])
  })

  it('keeps equal-priority cards in arrival order', () => {
    let state = enqueueNotch<TestEntry>(emptyNotchQueue, event('showing'))
    state = enqueueNotch(state, event('first'))
    state = enqueueNotch(state, event('second'))
    expect(ids(state)).toEqual(['showing', 'first', 'second'])
  })
})

describe('dismissCurrentNotch', () => {
  it('promotes the next waiting card', () => {
    let state = enqueueNotch<TestEntry>(emptyNotchQueue, event('a'))
    state = enqueueNotch(state, event('b'))
    state = dismissCurrentNotch(state)
    expect(ids(state)).toEqual(['b'])
  })

  it('leaves the notch idle when nothing is waiting', () => {
    const state = dismissCurrentNotch(enqueueNotch<TestEntry>(emptyNotchQueue, event('a')))
    expect(state).toEqual(emptyNotchQueue)
  })

  it('is safe on an already-idle queue', () => {
    expect(dismissCurrentNotch<TestEntry>(emptyNotchQueue)).toEqual(emptyNotchQueue)
  })
})

describe('removeNotch', () => {
  it('drops a waiting card without touching the one on screen', () => {
    let state = enqueueNotch<TestEntry>(emptyNotchQueue, event('a'))
    state = enqueueNotch(state, event('b'))
    state = removeNotch(state, 'b')
    expect(ids(state)).toEqual(['a'])
  })

  it('promotes the next card when it removes the one on screen', () => {
    let state = enqueueNotch<TestEntry>(emptyNotchQueue, event('a'))
    state = enqueueNotch(state, event('b'))
    state = removeNotch(state, 'a')
    expect(ids(state)).toEqual(['b'])
  })
})

describe('notchQueueSize', () => {
  it('counts the card on screen alongside the waiting ones', () => {
    let state = enqueueNotch<TestEntry>(emptyNotchQueue, event('a'))
    state = enqueueNotch(state, event('b'))
    expect(notchQueueSize(state)).toBe(2)
    expect(notchQueueSize(emptyNotchQueue)).toBe(0)
  })
})

describe('type surface', () => {
  it('accepts a bare { model } entry, which is all Storybook needs', () => {
    const bare: NotchQueueEntry = { model: event('a').model }
    const state = enqueueNotch(emptyNotchQueue as NotchQueueState<NotchQueueEntry>, bare)
    expect(state.current?.model.id).toBe('a')
  })

  it('keeps a status model’s own fields reachable off the entry', () => {
    const entry: TestEntry = {
      model: {
        kind: 'status',
        id: 'hook',
        tone: 'error',
        eyebrow: 'PRE-COMMIT',
        title: 'failed',
        outputLines: ['boom'],
      },
    }
    const state = enqueueNotch<TestEntry>(emptyNotchQueue, entry)
    const shown = state.current?.model as NotchStatusModel | undefined
    expect(shown?.outputLines).toEqual(['boom'])
  })
})
