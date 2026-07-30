import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useActionExplanationStore } from './actionExplanation.store'

describe('actionExplanation.store', () => {
  beforeEach(() => {
    useActionExplanationStore.getState().clearAll()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('remembers an explanation per action id', () => {
    const { set, get } = useActionExplanationStore.getState()
    set('corr-1', '**Staged one file.**')
    set('corr-2', '**Pulled from origin.**')

    expect(get('corr-1')?.text).toBe('**Staged one file.**')
    expect(get('corr-2')?.text).toBe('**Pulled from origin.**')
    expect(get('corr-3')).toBeUndefined()
  })

  it('stamps each explanation with when it was generated', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-29T10:00:00Z'))
    useActionExplanationStore.getState().set('corr-1', 'text')

    expect(useActionExplanationStore.getState().get('corr-1')?.generatedAt).toBe(
      new Date('2026-07-29T10:00:00Z').getTime()
    )
  })

  it('replaces an explanation when the action is explained again', () => {
    const { set, get } = useActionExplanationStore.getState()
    set('corr-1', 'first')
    set('corr-1', 'second')

    expect(get('corr-1')?.text).toBe('second')
    expect(Object.keys(useActionExplanationStore.getState().explanations)).toHaveLength(1)
  })

  it('forgets one action without touching the others', () => {
    const { set, clear, get } = useActionExplanationStore.getState()
    set('corr-1', 'a')
    set('corr-2', 'b')
    clear('corr-1')

    expect(get('corr-1')).toBeUndefined()
    expect(get('corr-2')?.text).toBe('b')
  })

  it('forgetting an unknown action leaves the store untouched', () => {
    const { set, clear } = useActionExplanationStore.getState()
    set('corr-1', 'a')
    const before = useActionExplanationStore.getState().explanations
    clear('nope')

    expect(useActionExplanationStore.getState().explanations).toBe(before)
  })

  it('evicts the oldest once past the cap, so localStorage cannot grow without bound', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-29T10:00:00Z'))
    const { set } = useActionExplanationStore.getState()

    for (let i = 0; i < 205; i++) {
      vi.advanceTimersByTime(1000)
      set(`corr-${i}`, `text ${i}`)
    }

    const { explanations, get } = useActionExplanationStore.getState()
    expect(Object.keys(explanations)).toHaveLength(200)
    // The five oldest are gone; the newest is kept.
    expect(get('corr-0')).toBeUndefined()
    expect(get('corr-4')).toBeUndefined()
    expect(get('corr-5')?.text).toBe('text 5')
    expect(get('corr-204')?.text).toBe('text 204')
  })
})
