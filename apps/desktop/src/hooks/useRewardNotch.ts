import { useEffect } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { useGameStore } from '../stores/game.store'
import { useNotchQueueStore } from '../stores/notchQueue.store'
import { rewardNotchRequest } from '../lib/notifications/rewardNotch'

/**
 * Turns an unlocked achievement into a notch card.
 *
 * The replacement for `TrophyToast`, and deliberately a hook with no markup: the celebration is a
 * card in the notch window now, so the only thing the main window still has to do is notice the
 * unlock, translate it, and hand it to the queue. Everything after that — which surface it goes
 * to, how long it stays, what a click does — is the same pipeline every other card goes through.
 *
 * The slot is cleared as soon as the card is enqueued, rather than when it leaves the screen. The
 * toast had to hold it for its whole 4.5 s life (it *was* the state that kept it rendered), which
 * meant a second unlock landing in that window was silently dropped. The queue owns the card's life
 * from the moment it is enqueued, so releasing the slot immediately is what lets two unlocks in a
 * row both be celebrated — the second one queues behind the first instead of overwriting it.
 */
export function useRewardNotch() {
  const recentUnlock = useGameStore((s) => s.recentUnlock)
  const clearRecentUnlock = useGameStore((s) => s.clearRecentUnlock)
  const { t } = useTranslation('launchpad')

  useEffect(() => {
    if (!recentUnlock) return

    // Read through `getState` rather than subscribing: the cabinet count is only ever looked at at
    // the instant of an unlock, and subscribing to the whole achievement list would re-run this
    // effect on every counter tick. `recentUnlock` is set in the same `set()` as the unlocked
    // achievement, so the count already includes the one being celebrated.
    const achievements = useGameStore.getState().achievements
    useNotchQueueStore.getState().enqueue(
      rewardNotchRequest(
        recentUnlock,
        {
          unlocked: achievements.filter((a) => a.unlocked).length,
          total: achievements.length,
        },
        t
      )
    )
    clearRecentUnlock()
  }, [recentUnlock, clearRecentUnlock, t])
}
