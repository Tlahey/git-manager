import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import type { Achievement } from '../../stores/game.store'

const sendNativeNotification = vi.hoisted(() => vi.fn())
vi.mock('../../api/notification.api', () => ({
  apiSendNativeNotification: (...a: unknown[]) => sendNativeNotification(...a),
}))

import { TrophyToast } from './TrophyToast'
import { useGameStore } from '../../stores/game.store'

const INITIAL = useGameStore.getState()

// 'commit_1' is a real achievement id (see achievements.json) — its title/description/reward
// come from packages/i18n/locales/en/launchpad.json's rewards.achievements.commit_1.* keys
// (this suite runs against real English copy, not a key-passthrough mock), rather than
// arbitrary test strings, since display text is no longer a field on the Achievement type.
function achievement(overrides: Partial<Achievement> = {}): Achievement {
  return {
    id: 'commit_1',
    points: 10,
    type: 'bronze',
    difficulty: 'beginner',
    kind: 'milestone',
    unlocked: true,
    unlockedAt: Date.now(),
    ...overrides,
  }
}

// The component's effect fires a native notification without awaiting it. That promise isn't
// cancelled on unmount, so if a test doesn't flush it before finishing, it settles later and races
// the *next* test's vi.clearAllMocks() — producing unhandled rejections. Every test that sets
// recentUnlock must flush via this helper, even ones that don't assert on notifications.
async function unlock(overrides: Partial<Achievement> = {}) {
  await act(async () => {
    useGameStore.setState({ recentUnlock: achievement(overrides) })
    for (let i = 0; i < 6; i++) await Promise.resolve()
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  sendNativeNotification.mockResolvedValue(undefined)
  useGameStore.setState({ ...INITIAL, recentUnlock: null })
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('TrophyToast — visibility', () => {
  it('renders nothing when there is no recent unlock', () => {
    const { container } = render(<TrophyToast />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the toast with title/description/points/reward when an achievement unlocks', async () => {
    render(<TrophyToast />)
    await unlock()

    expect(screen.getByTestId('trophy-toast')).toBeInTheDocument()
    expect(screen.getByText('First Steps')).toBeInTheDocument()
    expect(screen.getByText('Make your first commit from the app.')).toBeInTheDocument()
    expect(screen.getByText('+10 XP')).toBeInTheDocument()
    expect(screen.getByText(/Bronze avatar frame/)).toBeInTheDocument()
  })

  it.each([
    ['bronze', 'Bronze'],
    ['silver', 'Silver'],
    ['gold', 'Gold'],
    ['platinum', 'Platinum'],
  ] as const)('labels the %s tier badge as "%s"', async (type, label) => {
    render(<TrophyToast />)
    await unlock({ type })
    expect(screen.getByText(new RegExp(`${label} trophy`, 'i'))).toBeInTheDocument()
  })
})

describe('TrophyToast — native notification', () => {
  it('sends a native notification naming the tier and the achievement', async () => {
    render(<TrophyToast />)
    await unlock()

    expect(sendNativeNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining('Bronze'),
        body: expect.stringContaining('First Steps'),
      })
    )
  })

  // Every notification kind deep-links somewhere; a trophy's destination is the Rewards tab.
  it('routes the notification to the Rewards tab when clicked', async () => {
    render(<TrophyToast />)
    await unlock()

    expect(sendNativeNotification).toHaveBeenCalledWith(
      expect.objectContaining({ route: { kind: 'rewards' } })
    )
  })
})

describe('TrophyToast — auto-dismiss / manual close', () => {
  it('fades out after 4.5s and clears the store after another 300ms', async () => {
    render(<TrophyToast />)
    await unlock()
    expect(screen.getByTestId('trophy-toast').className).toContain('opacity-100')

    await act(async () => vi.advanceTimersByTime(4500))
    expect(screen.getByTestId('trophy-toast').className).toContain('opacity-0')

    await act(async () => vi.advanceTimersByTime(300))
    expect(useGameStore.getState().recentUnlock).toBeNull()
  })

  it('manually closing the toast fades it out immediately', async () => {
    render(<TrophyToast />)
    await unlock()
    const closeButton = screen.getByTestId('trophy-toast').querySelector('button')!

    await act(async () => {
      closeButton.click()
    })

    expect(screen.getByTestId('trophy-toast').className).toContain('opacity-0')
  })
})
