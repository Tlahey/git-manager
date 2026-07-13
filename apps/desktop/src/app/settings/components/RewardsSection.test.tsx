import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RewardsSection } from './RewardsSection'
import { useGameStore } from '../../../stores/game.store'

vi.mock('@git-manager/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

const INITIAL_GAME = useGameStore.getState()

beforeEach(() => {
  useGameStore.setState(INITIAL_GAME, true)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('RewardsSection — toggle', () => {
  it('reflects the current rewardsEnabled state', () => {
    useGameStore.setState({ rewardsEnabled: true })
    const { rerender } = render(<RewardsSection />)
    expect(screen.getByRole('checkbox')).toBeChecked()

    useGameStore.setState({ rewardsEnabled: false })
    rerender(<RewardsSection />)
    expect(screen.getByRole('checkbox')).not.toBeChecked()
  })

  it('toggles rewardsEnabled through the store', async () => {
    useGameStore.setState({ rewardsEnabled: false })
    const user = userEvent.setup()
    render(<RewardsSection />)
    await user.click(screen.getByRole('checkbox'))
    expect(useGameStore.getState().rewardsEnabled).toBe(true)
  })
})

describe('RewardsSection — reset progress', () => {
  it('resets progress after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    render(<RewardsSection />)
    await user.click(screen.getByText('settings.rewards.reset'))
    expect(useGameStore.getState().points).toBe(0)
  })

  it('does not reset when the confirmation is declined', async () => {
    useGameStore.setState({ points: 42 })
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const user = userEvent.setup()
    render(<RewardsSection />)
    await user.click(screen.getByText('settings.rewards.reset'))
    expect(useGameStore.getState().points).toBe(42)
  })
})
