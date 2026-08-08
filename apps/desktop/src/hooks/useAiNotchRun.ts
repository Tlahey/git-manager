import { useEffect, useRef, useState } from 'react'
import { useAiActivityStore, type AiRun } from '../stores/aiActivity.store'
import { aiRunHasItsOwnCard } from '../lib/notifications/aiRunNotch'

/**
 * How long the card stays up after the last call ends, waiting for the next one.
 *
 * This is the whole reason the hook exists. A map phase is one model call **per file**, each one
 * bracketed by its own begin/end — so between two files the run list is genuinely empty. Rendered
 * literally, a forty-file analysis would open and destroy forty OS windows, each replaying the
 * slide-in animation, which is both hideous and far more work than the analysis itself.
 *
 * Two seconds is comfortably longer than the gap between two calls (which is a promise resolution,
 * not a network round trip) and short enough that a run which has really finished doesn't leave a
 * card claiming otherwise.
 */
export const AI_RUN_NOTCH_GRACE_MS = 2000

/**
 * The AI generation the notch should be showing, held across the gaps in a map phase.
 *
 * Returns `null` when nothing is running, when the only thing running is a feature that already has
 * a card of its own, or once the grace period has run out.
 */
export function useAiNotchRun(graceMs: number = AI_RUN_NOTCH_GRACE_MS): AiRun | null {
  const runs = useAiActivityStore((s) => s.runs)
  const [held, setHeld] = useState<AiRun | null>(null)

  // The timer is only ever *pending* between two calls, so it must be cancellable from the effect
  // that starts the next one rather than merely re-created — otherwise a run that resumed inside the
  // grace period would still be retired by the first timer's expiry.
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    // The newest wins when several overlap: it is the one the user just triggered, the same rule the
    // footer pill follows.
    const active = [...runs].reverse().find((run) => !aiRunHasItsOwnCard(run.featureId)) ?? null

    if (active) {
      if (timer.current !== undefined) clearTimeout(timer.current)
      timer.current = undefined
      setHeld(active)
      return
    }

    // Nothing running. Don't arm a second countdown on top of one already ticking — a sequential
    // phase re-enters this branch after every file, and restarting the timer each time would keep
    // the card alive indefinitely after the run really ended.
    if (timer.current !== undefined) return
    timer.current = setTimeout(() => {
      timer.current = undefined
      setHeld(null)
    }, graceMs)
  }, [runs, graceMs])

  useEffect(() => {
    return () => {
      if (timer.current !== undefined) clearTimeout(timer.current)
    }
  }, [])

  return held
}
