import type { Achievement, RewardEffect } from './types'

/**
 * Selectors over `Achievement.effects`, used by UI code that needs to know "is this cosmetic
 * unlocked" (theme picker, avatar frame, ...) without hardcoding achievement ids — see
 * `AppearanceSection.tsx` and docs/architecture/15-rewards-system-refactor-plan.md ("Reward
 * Effects — decouple 'what unlocking grants' from 'who renders it'").
 */

/** The achievement that gates `id` for the given effect `type`, or `null` if no achievement
 *  declares that effect (meaning it isn't gated at all). */
export function findEffectGate(
  achievements: Achievement[],
  type: RewardEffect['type'],
  id: string
): Achievement | null {
  return achievements.find((a) => a.effects?.some((e) => e.type === type && e.id === id)) ?? null
}

/** Whether `id` (a theme id, avatar-frame id, ...) is currently usable. Ids not gated by any
 *  achievement are always unlocked. */
export function isEffectUnlocked(achievements: Achievement[], type: RewardEffect['type'], id: string): boolean {
  const gate = findEffectGate(achievements, type, id)
  return gate ? gate.unlocked : true
}

/** All effect ids of a given type currently unlocked, e.g. `getUnlockedEffects(achievements,
 *  'theme')` → the set of theme ids the user has earned. */
export function getUnlockedEffects(achievements: Achievement[], type: RewardEffect['type']): Set<string> {
  const unlocked = new Set<string>()
  for (const achievement of achievements) {
    if (!achievement.unlocked || !achievement.effects) continue
    for (const effect of achievement.effects) {
      if (effect.type === type) unlocked.add(effect.id)
    }
  }
  return unlocked
}
