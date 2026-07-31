import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Achievement } from '../../../lib/rewards/types'

vi.mock('../../../api/shell.api', () => ({ apiGetTerminalCommands: vi.fn().mockResolvedValue([]) }))

import { RewardsTab } from './RewardsTab'
import { useGameStore } from '../../../stores/game.store'

const INITIAL_STATE = useGameStore.getState()

// Display text isn't a field on Achievement anymore — it's resolved via t() from a real
// achievement id (see achievementI18nKey/RewardsTab.tsx). Tests that assert on rendered
// title/description/reward text below use a real id from achievements.json so t() resolves to
// real English copy (this suite runs against real translations, not a key-passthrough mock);
// tests that only check counts/filters/dates keep this placeholder id, since a missing i18n key
// just renders as the key string itself rather than throwing.
function achievement(overrides: Partial<Achievement> = {}): Achievement {
  return {
    id: 'a-generic',
    points: 10,
    type: 'bronze',
    difficulty: 'beginner',
    kind: 'action',
    unlocked: false,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  useGameStore.setState(INITIAL_STATE, true)
})

describe('RewardsTab — rank card', () => {
  it('shows the level name and XP for a novice (low points)', () => {
    useGameStore.setState({ points: 10, achievements: [] })
    render(<RewardsTab />)
    expect(screen.getByText('Git Novice')).toBeInTheDocument()
    expect(screen.getByText('10 / 50 XP')).toBeInTheDocument()
  })

  it('shows a higher rank name once points cross a threshold', () => {
    useGameStore.setState({ points: 250, achievements: [] })
    render(<RewardsTab />)
    expect(screen.getByText('Git Specialist')).toBeInTheDocument()
  })

  it('shows the platinum rank name when the platinum trophy is unlocked, regardless of points', () => {
    useGameStore.setState({
      points: 10,
      achievements: [
        achievement({
          id: 'platinum_trophy',
          unlocked: true,
          difficulty: 'expert',
          type: 'platinum',
        }),
      ],
    })
    render(<RewardsTab />)
    expect(screen.getByText('Git Grandmaster (Platinum)')).toBeInTheDocument()
  })
})

describe('RewardsTab — trophy cabinet', () => {
  it('counts unlocked achievements by tier and total', () => {
    useGameStore.setState({
      achievements: [
        achievement({ id: 'b1', type: 'bronze', unlocked: true }),
        achievement({ id: 'b2', type: 'bronze', unlocked: false }),
        achievement({ id: 's1', type: 'silver', unlocked: true }),
        achievement({ id: 'g1', type: 'gold', unlocked: true }),
        achievement({ id: 'p1', type: 'platinum', unlocked: false }),
      ],
    })
    const { container } = render(<RewardsTab />)
    // Bronze/Silver/Gold/Platinum counts appear in fixed DOM order in the trophy cabinet card.
    const counts = Array.from(
      container.querySelectorAll('.text-xs.font-extrabold.text-foreground')
    ).map((el) => el.textContent)
    expect(counts[0]).toBe('1') // bronze unlocked
    expect(counts[1]).toBe('1') // silver unlocked
    expect(counts[2]).toBe('1') // gold unlocked
    expect(counts[3]).toBe('0') // platinum unlocked
    expect(screen.getByText('3')).toBeInTheDocument() // total unlocked
    expect(screen.getByText('/ 5')).toBeInTheDocument() // total count
  })
})

describe('RewardsTab — status filter', () => {
  // Real ids so their titles resolve to real text: "First Steps" (commit_1) and "Status
  // Inspector" (terminal_status) — both beginner-difficulty in the real catalog too.
  const unlockedAch = achievement({
    id: 'commit_1',
    unlocked: true,
    difficulty: 'beginner',
  })
  const inProgressAch = achievement({
    id: 'terminal_status',
    unlocked: false,
    difficulty: 'beginner',
  })

  it('shows all achievements by default', () => {
    useGameStore.setState({ achievements: [unlockedAch, inProgressAch] })
    render(<RewardsTab />)
    expect(screen.getByText('First Steps')).toBeInTheDocument()
    expect(screen.getByText('Status Inspector')).toBeInTheDocument()
  })

  it('filters to only in-progress achievements', async () => {
    const user = userEvent.setup()
    useGameStore.setState({ achievements: [unlockedAch, inProgressAch] })
    render(<RewardsTab />)
    await user.click(screen.getByText("In progress"))
    expect(screen.queryByText('First Steps')).not.toBeInTheDocument()
    expect(screen.getByText('Status Inspector')).toBeInTheDocument()
  })

  it('filters to only completed achievements', async () => {
    const user = userEvent.setup()
    useGameStore.setState({ achievements: [unlockedAch, inProgressAch] })
    render(<RewardsTab />)
    await user.click(screen.getByTestId('rewards-filter-completed'))
    expect(screen.getByText('First Steps')).toBeInTheDocument()
    expect(screen.queryByText('Status Inspector')).not.toBeInTheDocument()
  })
})

describe('RewardsTab — difficulty groups', () => {
  it('hides a difficulty group entirely once its achievements are filtered out', async () => {
    const user = userEvent.setup()
    useGameStore.setState({
      achievements: [
        achievement({ id: 'b1', difficulty: 'beginner', unlocked: true }),
        achievement({
          id: 'i1',
          difficulty: 'intermediate',
          unlocked: false,
        }),
      ],
    })
    render(<RewardsTab />)
    expect(screen.getByText("Beginner level")).toBeInTheDocument()
    expect(screen.getByText("Intermediate level")).toBeInTheDocument()

    await user.click(screen.getByTestId('rewards-filter-completed'))
    expect(screen.getByText("Beginner level")).toBeInTheDocument()
    expect(screen.queryByText("Intermediate level")).not.toBeInTheDocument()
  })

  it('shows the unlocked/total count per difficulty group', () => {
    useGameStore.setState({
      achievements: [
        achievement({ id: 'b1', difficulty: 'beginner', unlocked: true }),
        achievement({ id: 'b2', difficulty: 'beginner', unlocked: false }),
      ],
    })
    render(<RewardsTab />)
    expect(screen.getByText('1 / 2 completed')).toBeInTheDocument()
  })
})

describe('RewardsTab — achievement card content', () => {
  it('shows title, description and XP for an unlocked achievement', () => {
    useGameStore.setState({
      achievements: [
        achievement({
          id: 'terminal_log',
          points: 25,
          unlocked: true,
        }),
      ],
    })
    render(<RewardsTab />)
    const card = screen.getByTestId('achievement-card-terminal_log')
    expect(within(card).getByText('Local Historian')).toBeInTheDocument()
    expect(within(card).getByText("Run 'git log' in the terminal.")).toBeInTheDocument()
    expect(within(card).getByText('+25 XP')).toBeInTheDocument()
  })

  it('shows the unlock date when unlockedAt is present', () => {
    const ts = new Date('2024-03-15').getTime()
    useGameStore.setState({
      achievements: [achievement({ id: 'a1', unlocked: true, unlockedAt: ts })],
    })
    render(<RewardsTab />)
    expect(screen.getByText(`Earned on ${new Date(ts).toLocaleDateString()}`)).toBeInTheDocument()
  })

  it('masks the title and description behind a locked prerequisite', () => {
    // Real prerequisite pair from achievements.json: commit_10 requires commit_1.
    useGameStore.setState({
      achievements: [
        achievement({ id: 'commit_1', unlocked: false }),
        achievement({
          id: 'commit_10',
          prerequisiteId: 'commit_1',
          unlocked: false,
        }),
      ],
    })
    render(<RewardsTab />)
    const card = screen.getByTestId('achievement-card-commit_10')
    expect(within(card).getByText('???')).toBeInTheDocument()
    expect(within(card).queryByText('Commit Regular')).not.toBeInTheDocument()
    expect(
      within(card).getByText(/Mystery challenge/)
    ).toBeInTheDocument()
  })

  it('reveals the title once the prerequisite is unlocked', () => {
    useGameStore.setState({
      achievements: [
        achievement({ id: 'commit_1', unlocked: true }),
        achievement({
          id: 'commit_10',
          prerequisiteId: 'commit_1',
          unlocked: false,
        }),
      ],
    })
    render(<RewardsTab />)
    const card = screen.getByTestId('achievement-card-commit_10')
    expect(within(card).getByText('Commit Regular')).toBeInTheDocument()
  })

  it('hides a cosmetic reward name behind ??? until unlocked, but shows plain XP rewards', () => {
    useGameStore.setState({
      achievements: [
        achievement({ id: 'commit_1', rewardIsCosmetic: true, unlocked: false }),
        achievement({ id: 'terminal_status', unlocked: false }),
      ],
    })
    render(<RewardsTab />)
    const cosmeticCard = screen.getByTestId('achievement-card-commit_1')
    expect(within(cosmeticCard).getByText('Reward: ???')).toBeInTheDocument()
    const xpCard = screen.getByTestId('achievement-card-terminal_status')
    expect(within(xpCard).getByText('Reward: XP boost')).toBeInTheDocument()
  })

  it('reveals the cosmetic reward name once unlocked', () => {
    useGameStore.setState({
      achievements: [
        achievement({ id: 'commit_1', rewardIsCosmetic: true, unlocked: true }),
      ],
    })
    render(<RewardsTab />)
    expect(screen.getByText('Reward: Bronze avatar frame')).toBeInTheDocument()
  })
})

describe('RewardsTab — milestone progress bar', () => {
  it('shows a progress bar for a locked milestone achievement, using the matching counter', () => {
    useGameStore.setState({
      commitCount: 4,
      achievements: [
        achievement({
          id: 'milestone-a',
          kind: 'milestone',
          milestoneType: 'commit',
          milestoneValue: 10,
          unlocked: false,
        }),
      ],
    })
    render(<RewardsTab />)
    expect(screen.getByText('4 / 10')).toBeInTheDocument()
    expect(screen.getByText("Milestone")).toBeInTheDocument()
  })

  it('hides the progress bar once the achievement is unlocked', () => {
    useGameStore.setState({
      commitCount: 10,
      achievements: [
        achievement({
          id: 'milestone-a',
          kind: 'milestone',
          milestoneType: 'commit',
          milestoneValue: 10,
          unlocked: true,
        }),
      ],
    })
    render(<RewardsTab />)
    expect(screen.queryByText("Milestone")).not.toBeInTheDocument()
  })

  it('hides the progress bar while masked behind a locked prerequisite', () => {
    useGameStore.setState({
      commitCount: 4,
      achievements: [
        achievement({ id: 'prereq', unlocked: false }),
        achievement({
          id: 'milestone-locked',
          kind: 'milestone',
          milestoneType: 'commit',
          milestoneValue: 10,
          prerequisiteId: 'prereq',
          unlocked: false,
        }),
      ],
    })
    render(<RewardsTab />)
    expect(screen.queryByText("Milestone")).not.toBeInTheDocument()
  })
})
