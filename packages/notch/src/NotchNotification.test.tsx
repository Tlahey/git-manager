import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NotchNotification } from './NotchNotification'
import { measureCardHeight, NOTCH_ROW, withRule } from './notchGeometry'
import { NOTCH_TONE_RGB } from './notchTones'
import { NOTCH_TIER_RGB } from './notchRewardTiers'
import type { NotchEventModel, NotchModel, NotchRewardModel } from './types'

const reward: NotchRewardModel = {
  kind: 'reward',
  id: 'achievement-merge-master',
  tone: 'highlight',
  eyebrow: 'ACHIEVEMENT UNLOCKED · GOLD',
  title: 'Merge Master',
  description: 'Merged 50 pull requests',
  reward: 'Aurora theme',
  tier: 'gold',
  badge: '+100 XP',
}

const model: NotchEventModel = {
  kind: 'event',
  id: 'pr-231',
  tone: 'highlight',
  eyebrow: 'PULL REQUEST MERGED',
  context: 'Tlahey/git-manager',
  meta: '2 min ago',
  title: 'feat(notch): extract the notification card',
  subtitle: '@Tlahey',
  badge: '#231',
  actions: [
    { id: 'open', label: 'Open in app', variant: 'primary' },
    { id: 'github', label: 'GitHub' },
  ],
}

function renderCard(overrides: Partial<Parameters<typeof NotchNotification>[0]> = {}) {
  const props = {
    model: model as NotchModel,
    visible: true,
    closeLabel: 'Close',
    onAction: vi.fn(),
    onDismiss: vi.fn(),
    ...overrides,
  }
  render(<NotchNotification {...props} />)
  return props
}

describe('NotchNotification', () => {
  it('lays out the whole card: band, header, body, actions', () => {
    renderCard({ productName: 'Git Manager', icon: <span>ic</span> })

    expect(screen.getByText('Git Manager')).toBeInTheDocument()
    expect(screen.getByTestId('notch-eyebrow')).toHaveTextContent('PULL REQUEST MERGED')
    expect(screen.getByTestId('notch-context')).toHaveTextContent('Tlahey/git-manager')
    expect(screen.getByTestId('notch-meta')).toHaveTextContent('2 min ago')
    expect(screen.getByTestId('notch-title')).toHaveTextContent('feat(notch)')
    expect(screen.getByTestId('notch-badge')).toHaveTextContent('#231')
    expect(screen.getByRole('button', { name: 'Open in app' })).toBeInTheDocument()
  })

  it('puts the close button in the reserved band, not in the header', () => {
    // The band is the only row with spare room, and its right sliver is real screen either side of
    // the camera housing — which is why the close button lives there.
    renderCard()
    expect(screen.getByTestId('notch-band')).toContainElement(screen.getByTestId('notch-close'))
  })

  it('names the close button with the label the consumer translated', () => {
    renderCard({ closeLabel: 'Fermer' })
    expect(screen.getByRole('button', { name: 'Fermer' })).toBeInTheDocument()
  })

  it('dismisses without also activating the card', async () => {
    const props = renderCard({ onActivate: vi.fn() })
    await userEvent.click(screen.getByTestId('notch-close'))
    expect(props.onDismiss).toHaveBeenCalledTimes(1)
    expect(props.onActivate).not.toHaveBeenCalled()
  })

  it('reports an action by id without also activating the card', async () => {
    const props = renderCard({ onActivate: vi.fn() })
    await userEvent.click(screen.getByRole('button', { name: 'GitHub' }))
    expect(props.onAction).toHaveBeenCalledWith('github')
    expect(props.onActivate).not.toHaveBeenCalled()
  })

  it('activates on a click on the card itself', async () => {
    const props = renderCard({ onActivate: vi.fn() })
    await userEvent.click(screen.getByTestId('notch-title'))
    expect(props.onActivate).toHaveBeenCalledTimes(1)
  })

  it('drops the action row when there is neither a button nor a badge', () => {
    const { actions: _actions, badge: _badge, ...bare } = model
    renderCard({ model: bare as NotchModel })
    expect(screen.queryByTestId('notch-action-row')).not.toBeInTheDocument()
  })

  it('renders a progress model as a live bar rather than an avatar row', () => {
    renderCard({
      model: {
        kind: 'progress',
        id: 'clone',
        tone: 'running',
        eyebrow: 'CLONING',
        title: 'github.com/Tlahey/git-manager',
        ratio: 0.4,
      },
    })
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40')
    expect(screen.queryByTestId('notch-event-body')).not.toBeInTheDocument()
  })

  it('renders a status model with the tail of its output', () => {
    renderCard({
      model: {
        kind: 'status',
        id: 'hook',
        tone: 'error',
        eyebrow: 'PRE-COMMIT',
        title: 'lint-staged failed',
        outputLines: ['✖ eslint --fix found 3 errors'],
      },
    })
    expect(screen.getByTestId('notch-status-output')).toHaveTextContent('eslint --fix')
  })

  it('renders a reward model as a medal, a gain and a burst of confetti', () => {
    renderCard({ model: reward })
    expect(screen.getByTestId('notch-tier-medal')).toHaveAttribute('data-tier', 'gold')
    expect(screen.getByTestId('notch-reward-gain')).toHaveTextContent('Aurora theme')
    expect(screen.getByTestId('notch-badge')).toHaveTextContent('+100 XP')
    expect(screen.getByTestId('notch-confetti')).toBeInTheDocument()
  })

  it('glows in the medal’s colour rather than the tone’s, which cannot say “gold”', () => {
    renderCard({ model: reward })
    expect(screen.getByTestId('notch-halo').style.getPropertyValue('--notch-tone-rgb')).toBe(
      NOTCH_TIER_RGB.gold
    )
  })

  it('leaves every other kind glowing in its tone', () => {
    renderCard()
    expect(screen.getByTestId('notch-halo').style.getPropertyValue('--notch-tone-rgb')).toBe(
      NOTCH_TONE_RGB.highlight
    )
  })

  it('throws no confetti at anything that is not a reward', () => {
    renderCard()
    expect(screen.queryByTestId('notch-confetti')).not.toBeInTheDocument()
  })

  it('holds the celebration back for a reward the user has already seen', () => {
    // A replay from the rewards list is not an announcement, and confetti would make it one.
    renderCard({ model: { ...reward, confetti: false } })
    expect(screen.queryByTestId('notch-confetti')).not.toBeInTheDocument()
    expect(screen.getByTestId('notch-tier-medal')).toBeInTheDocument()
  })

  it('sizes the burst to the card it is thrown inside', () => {
    // The confetti is clipped by the card, so a layer measured off a different height would either
    // leave paper visible at the bottom edge or cut the fall short.
    renderCard({ model: reward, bandHeight: 38 })
    expect(screen.getByTestId('notch-confetti')).toHaveStyle({
      height: `${measureCardHeight(reward, 38)}px`,
    })
  })

  it('omits the product name slot when the consumer does not want one', () => {
    renderCard()
    expect(screen.queryByText('Git Manager')).not.toBeInTheDocument()
  })

  it('passes the real per-machine notch geometry down to the card', () => {
    // What the app feeds in once it has actually asked `NSScreen` (`get_notch_metrics`).
    renderCard({ bandHeight: 38, housingHalfWidth: 110 })
    expect(screen.getByTestId('notch-band')).toHaveStyle({ height: `${withRule(38)}px` })
  })

  it('falls back to the package defaults when no override is given', () => {
    renderCard()
    expect(screen.getByTestId('notch-band')).toHaveStyle({
      height: `${withRule(NOTCH_ROW.band)}px`,
    })
  })
})
