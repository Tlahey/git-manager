import { describe, it, expect } from 'vitest'
import { i18next } from '@git-manager/i18n'
import { measureCardHeight, type NotchRewardModel } from '@git-manager/notch'
import { rewardNotchModel, rewardNotchRequest } from './rewardNotch'
import { isEligibleForNativeBanner } from './notchDelivery'
import type { Achievement } from '../rewards/types'

// The setup file initialises i18n in English, so these are the real sentences the user reads.
const t = i18next.getFixedT('en', 'launchpad')
const tFr = i18next.getFixedT('fr', 'launchpad')

const cabinet = { unlocked: 22, total: 28 }

function achievement(overrides: Partial<Achievement> = {}): Achievement {
  return {
    id: 'pr_50',
    points: 80,
    type: 'gold',
    difficulty: 'expert',
    kind: 'milestone',
    milestoneType: 'pr_merged',
    milestoneValue: 50,
    unlocked: true,
    unlockedAt: Date.now(),
    ...overrides,
  }
}

describe('rewardNotchModel', () => {
  it('reads the achievement’s own translated copy, not a generic sentence', () => {
    const model = rewardNotchModel(achievement(), cabinet, t)
    expect(model.title).toBe('Merge Master')
    expect(model.description).toBe('Have 50 pull requests merged or closed.')
    expect(model.reward).toBe('Gold avatar frame')
  })

  it('says the tier in words as well as wearing it as a medal', () => {
    // The medal is decorative — a colour cannot be read aloud, so the eyebrow has to carry it.
    const model = rewardNotchModel(achievement(), cabinet, t)
    expect(model.tier).toBe('gold')
    expect(model.eyebrow).toBe('Achievement unlocked · Gold trophy')
  })

  it('carries the tier through unchanged for every value the app can produce', () => {
    // `AchievementTier` and `NotchRewardTier` are the same four values declared on both sides, so
    // the notch package can stay ignorant of this app's domain. This is where they are checked to
    // still line up.
    for (const tier of ['bronze', 'silver', 'gold', 'platinum'] as const) {
      expect(rewardNotchModel(achievement({ type: tier }), cabinet, t).tier).toBe(tier)
    }
  })

  it('shows how full the cabinet is, counted at the moment of the unlock', () => {
    expect(rewardNotchModel(achievement(), cabinet, t).context).toBe('Trophy cabinet · 22 / 28')
  })

  it('puts the XP in the badge rather than in the sentence', () => {
    expect(rewardNotchModel(achievement(), cabinet, t).badge).toBe('+80 XP')
  })

  it('coalesces a repeated unlock instead of celebrating it twice', () => {
    // The queue keys on `model.id`: the same achievement arriving again (a re-render, a replayed
    // event) has to land on the card already showing.
    expect(rewardNotchModel(achievement(), cabinet, t).id).toBe('reward:pr_50')
    expect(rewardNotchModel(achievement({ id: 'commit_1' }), cabinet, t).id).toBe('reward:commit_1')
  })

  it('ranks with ordinary events in the queue, and does not cut in front of anything', () => {
    // `highlight` is the app's "it worked, and it mattered" tone. Only `error` preempts, and an
    // unlock is the least urgent thing the app has to say.
    expect(rewardNotchModel(achievement(), cabinet, t).tone).toBe('highlight')
  })

  it('offers one action, which is the trophy cabinet the medal came from', () => {
    const model = rewardNotchModel(achievement(), cabinet, t)
    expect(model.actions).toEqual([{ id: 'activate', label: 'See rewards', variant: 'primary' }])
  })

  it('is translated, like every string that reaches the card', () => {
    const model = rewardNotchModel(achievement(), cabinet, tFr)
    expect(model.eyebrow).toBe('Succès débloqué · Trophée Or')
    expect(model.title).toBe('Maître de la Fusion')
  })

  it('fits the window the geometry sizes for it', () => {
    // The model crosses into a separate webview whose height is computed from it; a field the card
    // renders but the geometry does not count would clip.
    const model: NotchRewardModel = rewardNotchModel(achievement(), cabinet, t)
    expect(measureCardHeight(model)).toBeGreaterThan(0)
  })
})

describe('rewardNotchRequest', () => {
  it('routes a click to the Rewards tab, where the trophy is', () => {
    const request = rewardNotchRequest(achievement(), cabinet, t)
    expect(request.route).toEqual({ kind: 'rewards' })
  })

  it('is worth a banner when the notch is not the chosen surface', () => {
    // The toast raised a banner *as well*, unconditionally, behind the display setting's back.
    // Going through the policy is what makes it one surface or the other, never both.
    const request = rewardNotchRequest(achievement(), cabinet, t)
    expect(request.importance).toBe('key')
    expect(isEligibleForNativeBanner(request)).toBe(true)
  })

  it('keeps the sentence the toast’s banner used, so Notification Centre reads the same', () => {
    const request = rewardNotchRequest(achievement(), cabinet, t)
    expect(request.nativeFallback?.title).toBe('🏆 Gold trophy unlocked!')
    expect(request.nativeFallback?.body).toBe(
      'Merge Master: Have 50 pull requests merged or closed. (Gold avatar frame)'
    )
    expect(request.nativeFallback?.route).toEqual({ kind: 'rewards' })
  })

  it('brings no header icon, because the medal in the body is the glyph', () => {
    expect(rewardNotchRequest(achievement(), cabinet, t).iconId).toBeUndefined()
  })
})
