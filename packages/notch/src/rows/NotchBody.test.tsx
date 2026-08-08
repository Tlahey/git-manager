import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NotchBody } from './NotchBody'
import { NOTCH_ROW, statusOutputHeight } from '../notchGeometry'
import { toneColor } from '../notchTones'
import { tierColor } from '../notchRewardTiers'
import type {
  NotchEventModel,
  NotchProgressModel,
  NotchRewardModel,
  NotchStatusModel,
} from '../types'

const event: NotchEventModel = {
  kind: 'event',
  id: 'e',
  tone: 'accent',
  eyebrow: 'REVIEW REQUESTED',
  title: 'feat: notch notifications',
  subtitle: '@jane_dev',
  avatar: { alt: 'jane_dev', fallback: 'JA' },
}

const progress: NotchProgressModel = {
  kind: 'progress',
  id: 'p',
  tone: 'running',
  eyebrow: 'SEARCHING',
  title: 'Scanning commits',
  ratio: 0.25,
  detail: '12 / 48 commits',
}

const reward: NotchRewardModel = {
  kind: 'reward',
  id: 'r',
  tone: 'highlight',
  eyebrow: 'ACHIEVEMENT UNLOCKED · GOLD',
  title: 'Merge Master',
  description: 'Merged 50 pull requests',
  reward: 'Aurora theme',
  tier: 'gold',
}

const status: NotchStatusModel = {
  kind: 'status',
  id: 's',
  tone: 'error',
  eyebrow: 'PRE-COMMIT',
  title: 'lint-staged failed',
}

describe('NotchBody — event', () => {
  it('renders the title, the subtitle in its tone, and an avatar', () => {
    render(<NotchBody model={event} />)
    expect(screen.getByTestId('notch-title')).toHaveTextContent('feat: notch notifications')
    expect(screen.getByTestId('notch-subtitle').style.color).toBe(toneColor('accent'))
    expect(screen.getByText('JA')).toBeInTheDocument()
  })

  it('drops the avatar slot when there is no one to show', () => {
    const { avatar: _avatar, ...faceless } = event
    render(<NotchBody model={faceless as NotchEventModel} />)
    expect(screen.queryByText('JA')).not.toBeInTheDocument()
  })

  // The producer knows whose name it is, so it picks the disc; this package only has to put it on.
  it("wears the producer's tint behind the initials, keeping the ring", () => {
    const tinted: NotchEventModel = {
      ...event,
      avatar: { ...event.avatar!, fallbackClassName: 'bg-linear-to-tr from-red-600 to-rose-700' },
    }
    render(<NotchBody model={tinted} />)
    const avatar = screen.getByText('JA')
    expect(avatar).toHaveClass('from-red-600', 'to-rose-700', 'ring-white/15')
    expect(avatar).not.toHaveClass('bg-white/10')
  })

  it('falls back to a neutral disc when the producer names no tint', () => {
    render(<NotchBody model={event} />)
    expect(screen.getByText('JA')).toHaveClass('bg-white/10')
  })

  it('sizes itself to the geometry', () => {
    render(<NotchBody model={event} />)
    expect(screen.getByTestId('notch-event-body')).toHaveStyle({
      height: `${NOTCH_ROW.eventBody}px`,
    })
  })
})

describe('NotchBody — progress', () => {
  it('announces the amount on a determinate bar', () => {
    render(<NotchBody model={progress} />)
    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', '25')
    expect(screen.getByTestId('notch-progress-percent')).toHaveTextContent('25%')
    expect(screen.getByTestId('notch-progress-detail')).toHaveTextContent('12 / 48 commits')
  })

  it('shows no percentage at all when the total is not known yet', () => {
    // A bar parked at 0% reads as stuck; "running, amount unknown" is the honest rendering.
    const { ratio: _ratio, ...unknown } = progress
    render(<NotchBody model={unknown as NotchProgressModel} />)
    expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow')
    expect(screen.queryByTestId('notch-progress-percent')).not.toBeInTheDocument()
  })

  it('clamps a ratio outside 0–1 rather than overflowing the track', () => {
    render(<NotchBody model={{ ...progress, ratio: 1.4 }} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
  })

  it('names the bar after the operation it is measuring', () => {
    render(<NotchBody model={progress} />)
    expect(screen.getByRole('progressbar')).toHaveAccessibleName('Scanning commits')
  })
})

describe('NotchBody — reward', () => {
  it('renders what was unlocked, what earned it, and what it grants', () => {
    render(<NotchBody model={reward} />)
    expect(screen.getByTestId('notch-title')).toHaveTextContent('Merge Master')
    expect(screen.getByTestId('notch-reward-description')).toHaveTextContent(
      'Merged 50 pull requests'
    )
    expect(screen.getByTestId('notch-reward-gain')).toHaveTextContent('Aurora theme')
  })

  it('wears a medal where the event card wears an avatar', () => {
    // The subject of a reward is the user; there is no face to show.
    render(<NotchBody model={reward} />)
    expect(screen.getByTestId('notch-tier-medal')).toHaveAttribute('data-tier', 'gold')
  })

  it('colours the gain by the tier rather than by the tone', () => {
    // The tone is already spoken for by the eyebrow above; what the reward *is* belongs to the medal
    // beside it.
    render(<NotchBody model={{ ...reward, tier: 'bronze' }} />)
    expect(screen.getByTestId('notch-reward-gain').style.color).toBe(tierColor('bronze'))
  })

  it('drops the lines it has nothing for, instead of leaving empty rows', () => {
    const { description: _description, reward: _reward, ...bare } = reward
    render(<NotchBody model={bare as NotchRewardModel} />)
    expect(screen.queryByTestId('notch-reward-description')).not.toBeInTheDocument()
    expect(screen.queryByTestId('notch-reward-gain')).not.toBeInTheDocument()
    expect(screen.getByTestId('notch-title')).toBeInTheDocument()
  })

  it('sizes itself to the geometry — the tallest body there is', () => {
    render(<NotchBody model={reward} />)
    expect(screen.getByTestId('notch-reward-body')).toHaveStyle({
      height: `${NOTCH_ROW.rewardBody}px`,
    })
    expect(NOTCH_ROW.rewardBody).toBeGreaterThan(NOTCH_ROW.eventBody)
  })
})

describe('NotchBody — status', () => {
  it('renders the outcome with no output block when there is nothing to show', () => {
    render(<NotchBody model={status} />)
    expect(screen.getByTestId('notch-title')).toHaveTextContent('lint-staged failed')
    expect(screen.queryByTestId('notch-status-output')).not.toBeInTheDocument()
  })

  it('keeps the LAST lines of output, which is where the error is', () => {
    render(
      <NotchBody model={{ ...status, outputLines: ['one', 'two', 'three', 'four', 'five'] }} />
    )
    const output = screen.getByTestId('notch-status-output')
    expect(output).toHaveTextContent('three')
    expect(output).toHaveTextContent('five')
    expect(output).not.toHaveTextContent('one')
  })

  it('sizes the output block to the lines it actually renders', () => {
    render(<NotchBody model={{ ...status, outputLines: ['a', 'b', 'c', 'd'] }} />)
    expect(screen.getByTestId('notch-status-output')).toHaveStyle({
      height: `${statusOutputHeight(3)}px`,
    })
  })
})
