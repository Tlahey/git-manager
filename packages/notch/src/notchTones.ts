import type { NotchTone } from './types'

/**
 * The halo colour per tone — the glow around the card, and the accent on its eyebrow line.
 *
 * Stored as bare `r, g, b` triples rather than hex so the pulse keyframes can vary the *alpha* of
 * one shared colour (`rgba(var(--notch-tone-rgb), …)`); a hex value can't be given an alpha from
 * inside a keyframe.
 *
 * Fixed values, deliberately **not** theme tokens: the card renders in a window that pins a dark
 * theme purely so the shared `@git-manager/ui` primitives resolve, and this palette is a
 * glanceable "what kind of thing just happened" signal that should read the same whatever theme
 * the user picked.
 *
 * The seven values are exactly the eight-entry PR palette this replaced, de-duplicated: nothing
 * about the existing notifications changed colour when they moved onto tones.
 */
export const NOTCH_TONE_RGB: Record<NotchTone, string> = {
  neutral: '100, 116, 139', // slate
  info: '99, 102, 241', // indigo
  accent: '180, 166, 245', // lavender
  success: '34, 197, 94', // green
  error: '239, 68, 68', // red
  running: '56, 189, 248', // sky
  highlight: '168, 85, 247', // purple
}

/** `rgb(…)` for a tone, for anything that needs a plain opaque colour (the eyebrow text). */
export function toneColor(tone: NotchTone): string {
  return `rgb(${NOTCH_TONE_RGB[tone]})`
}

/**
 * How urgently a card wants the notch, used by the queue to order cards and to decide whether an
 * arriving one preempts the card on screen.
 *
 * `error` outranks everything: a failed hook or a broken build is the one thing that must not wait
 * behind a queue of merged-PR confetti. A `progress` card outranks ordinary events because it is
 * *live* — kicking it off screen to show a transient event would strand an operation the user is
 * watching, and it would have nowhere to come back to mid-flight.
 */
export function tonePriority(tone: NotchTone, kind: 'event' | 'progress' | 'status'): number {
  if (tone === 'error') return 3
  if (kind === 'progress') return 2
  return 1
}
