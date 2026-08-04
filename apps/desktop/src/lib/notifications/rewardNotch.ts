/**
 * An unlocked achievement, as a notch card.
 *
 * The producer whose subject is the *user* rather than the repository — and the reason the notch
 * package grew a `reward` kind and a confetti burst. It replaces `TrophyToast`, a fixed
 * bottom-right rectangle inside the app window, which had three problems the card does not: it
 * only existed while the app window was on screen and focused, it competed with whatever the user
 * was reading, and it looked like every other toast — an unlock and a failed fetch were the same
 * shape in the same corner.
 *
 * It also stopped bypassing the display setting. The toast raised a macOS banner *as well*, every
 * time, unconditionally; the card goes through `notchDelivery` like every other producer, so a
 * user who asked for banners gets exactly one banner, and a user who turned notifications off gets
 * nothing.
 */

import type { NotchRewardModel } from '@git-manager/notch'
import type { TFunction } from '@git-manager/i18n'
import type { Achievement } from '../rewards/types'
import { achievementI18nKey } from '../rewards/achievementI18n'
import type { NotchRequest } from './notchDelivery'

/** How full the trophy cabinet is, counted at the moment of the unlock. */
export interface RewardCabinet {
  unlocked: number
  total: number
}

/**
 * The card for one unlock.
 *
 * `achievement.type` is handed to the model's `tier` unchanged: `AchievementTier` and
 * `NotchRewardTier` are the same four values, deliberately declared on both sides rather than
 * shared, because the notch package is domain-agnostic and importing the app's reward types into
 * it is exactly what that rule exists to prevent. If one of them ever grows a fifth value, this
 * assignment is where the compiler says so.
 *
 * The tier is spelled out in the eyebrow as well as worn as a medal, because a colour cannot be
 * read aloud — the medal is decorative, and "gold" has to survive a screen reader.
 */
export function rewardNotchModel(
  achievement: Achievement,
  cabinet: RewardCabinet,
  t: TFunction
): NotchRewardModel {
  return {
    kind: 'reward',
    // Per achievement, so the same unlock arriving twice (a re-render, a replayed event) coalesces
    // onto the card already showing instead of queueing a duplicate celebration.
    id: `reward:${achievement.id}`,
    // The tone is what the *queue* reads (`tonePriority`); the card's own colour comes from its
    // tier. `highlight` is the app's "it worked, and it mattered" tone, which is what an unlock is.
    tone: 'highlight',
    eyebrow: t('rewards.notch.eyebrow', { tier: t(`rewards.${achievement.type}`) }),
    context: t('rewards.notch.cabinet', { unlocked: cabinet.unlocked, total: cabinet.total }),
    title: t(achievementI18nKey(achievement.id, 'title')),
    description: t(achievementI18nKey(achievement.id, 'description')),
    reward: t(achievementI18nKey(achievement.id, 'reward')),
    tier: achievement.type,
    badge: t('rewards.notch.xp', { points: achievement.points }),
    actions: [{ id: 'activate', label: t('rewards.notch.open'), variant: 'primary' }],
  }
}

/**
 * Everything the delivery pipeline needs for one unlock.
 *
 * `key` importance: this is a discrete thing the user did, and the one card in the app that is
 * *about them*. It is worth a macOS banner when the notch isn't the chosen surface — the banner
 * loses the medal and the confetti and keeps the sentence, the same trade a failed hook makes.
 *
 * The banner copy is the toast's own sentence, carried over verbatim (the keys moved from
 * `rewards.toast.native*` to `rewards.notch.native*` when the toast went), so nothing about the
 * notification a user sees in Notification Centre changed with the card.
 */
export function rewardNotchRequest(
  achievement: Achievement,
  cabinet: RewardCabinet,
  t: TFunction
): NotchRequest {
  return {
    model: rewardNotchModel(achievement, cabinet, t),
    importance: 'key',
    route: { kind: 'rewards' },
    nativeFallback: {
      title: t('rewards.notch.nativeTitle', { tier: t(`rewards.${achievement.type}`) }),
      body: t('rewards.notch.nativeBody', {
        title: t(achievementI18nKey(achievement.id, 'title')),
        description: t(achievementI18nKey(achievement.id, 'description')),
        reward: t(achievementI18nKey(achievement.id, 'reward')),
      }),
      route: { kind: 'rewards' },
    },
  }
}
