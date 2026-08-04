import { describe, it, expect, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { emptyNotchQueue } from '@git-manager/notch'
import { useRewardNotch } from './useRewardNotch'
import { useGameStore } from '../stores/game.store'
import { useNotchQueueStore } from '../stores/notchQueue.store'
import type { Achievement } from '../lib/rewards/types'

const INITIAL_GAME = useGameStore.getState()

function achievement(overrides: Partial<Achievement> = {}): Achievement {
  return {
    id: 'commit_1',
    points: 10,
    type: 'bronze',
    difficulty: 'beginner',
    kind: 'action',
    unlocked: true,
    unlockedAt: 1_700_000_000_000,
    ...overrides,
  }
}

/** Two unlocked out of three, so the cabinet count in the card has something to be wrong about. */
function seedAchievements() {
  useGameStore.setState({
    achievements: [
      achievement({ id: 'commit_1', unlocked: true }),
      achievement({ id: 'pr_50', type: 'gold', unlocked: true }),
      achievement({ id: 'commit_500', type: 'platinum', unlocked: false }),
    ],
  })
}

function unlock(entry: Achievement | null) {
  act(() => {
    useGameStore.setState({ recentUnlock: entry })
  })
}

beforeEach(() => {
  useGameStore.setState({ ...INITIAL_GAME, recentUnlock: null })
  useNotchQueueStore.setState({ queue: emptyNotchQueue })
  seedAchievements()
})

describe('useRewardNotch', () => {
  it('raises nothing while nothing has been unlocked', () => {
    renderHook(() => useRewardNotch())
    expect(useNotchQueueStore.getState().queue.current).toBeNull()
  })

  it('turns an unlock into a reward card on the queue', () => {
    renderHook(() => useRewardNotch())
    unlock(achievement({ id: 'pr_50', type: 'gold', points: 80 }))

    const current = useNotchQueueStore.getState().queue.current
    expect(current?.model.kind).toBe('reward')
    expect(current?.model.id).toBe('reward:pr_50')
    expect(current?.model.title).toBe('Merge Master')
  })

  it('counts the cabinet including the trophy just won', () => {
    // `recentUnlock` is set in the same `set()` as the achievement itself, so reading the list at
    // this point already includes it — the card would otherwise be off by one on every unlock.
    renderHook(() => useRewardNotch())
    unlock(achievement({ id: 'pr_50' }))
    expect(useNotchQueueStore.getState().queue.current?.model.context).toBe(
      'Trophy cabinet · 2 / 3'
    )
  })

  it('releases the slot as soon as the card is queued', () => {
    // The toast had to hold `recentUnlock` for its whole 4.5 s life, because that state *was* what
    // kept it rendered. The queue owns the card from here, so the slot is free immediately.
    renderHook(() => useRewardNotch())
    unlock(achievement())
    expect(useGameStore.getState().recentUnlock).toBeNull()
  })

  it('celebrates two unlocks in a row instead of dropping the second', () => {
    // What the freed slot buys: the second card queues behind the first rather than overwriting a
    // toast that was still on screen.
    renderHook(() => useRewardNotch())
    unlock(achievement({ id: 'commit_1' }))
    unlock(achievement({ id: 'pr_50', type: 'gold' }))

    const queue = useNotchQueueStore.getState().queue
    expect(queue.current?.model.id).toBe('reward:commit_1')
    expect(queue.pending.map((entry) => entry.model.id)).toEqual(['reward:pr_50'])
  })

  it('coalesces the same achievement arriving twice', () => {
    renderHook(() => useRewardNotch())
    unlock(achievement({ id: 'commit_1' }))
    unlock(null)
    unlock(achievement({ id: 'commit_1' }))

    const queue = useNotchQueueStore.getState().queue
    expect(queue.current?.model.id).toBe('reward:commit_1')
    expect(queue.pending).toHaveLength(0)
  })

  it('sends the card, not a banner — the surface is decided further down', () => {
    // The toast raised a macOS banner itself, every time, whatever the display setting said. This
    // hook only enqueues; `useNotchQueue` is the one point where a surface is chosen.
    renderHook(() => useRewardNotch())
    unlock(achievement())
    const current = useNotchQueueStore.getState().queue.current
    expect(current?.importance).toBe('key')
    expect(current?.route).toEqual({ kind: 'rewards' })
    expect(current?.nativeFallback).toBeDefined()
  })
})
