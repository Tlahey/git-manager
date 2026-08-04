import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { NotchCard } from './NotchCard'
import { NotchConfetti } from './NotchConfetti'
import { hasActionRow, measureCardHeight, rewardConfettiOrigin } from './notchGeometry'
import { NOTCH_TIER_RGB } from './notchRewardTiers'
import { NotchHeaderRow } from './rows/NotchHeaderRow'
import { NotchActionRow } from './rows/NotchActionRow'
import { NotchBody } from './rows/NotchBody'
import type { NotchModel } from './types'

export interface NotchNotificationProps {
  model: NotchModel
  /** Owned by `useNotchPresenter` — the fade in and out. */
  visible: boolean
  /** The per-kind glyph shown in the header. */
  icon?: ReactNode
  /**
   * The left sliver of the reserved band. "Git Manager" in the app — a proper noun, and the one
   * string in this component that is deliberately not translated.
   */
  productName?: string
  /** Accessible name for the close button. Required, and already translated: this package has no
   *  i18n dependency, so the only way a string gets here is the consumer resolving it. */
  closeLabel: string
  onAction: (actionId: string) => void
  /** Clicking the card itself. */
  onActivate?: () => void
  onDismiss: () => void
  onPointerEnter?: () => void
  onPointerLeave?: () => void
  /** The real, per-machine notch geometry (see `NotchCardProps`) — omit to fall back to the
   *  package's own defaults. */
  housingHalfWidth?: number
  bandHeight?: number
  /** Forces the reward card's confetti on or off, overriding `prefers-reduced-motion`. Omit outside
   *  of a story: the system setting is the answer. */
  reducedMotion?: boolean
}

/**
 * A complete notch notification: the shell, the header, the body its kind calls for, and the
 * actions.
 *
 * Purely presentational — it holds no timers, opens no windows and knows nothing about pull
 * requests, hooks or processes. Give it a {@link NotchModel} and it renders; that is what lets the
 * same component be driven by a real Tauri window and by a Storybook slider.
 */
export function NotchNotification({
  model,
  visible,
  icon,
  productName,
  closeLabel,
  onAction,
  onActivate,
  onDismiss,
  onPointerEnter,
  onPointerLeave,
  housingHalfWidth,
  bandHeight,
  reducedMotion,
}: NotchNotificationProps) {
  // The reward card is the only one that departs from the shell's defaults, and it does so twice: it
  // glows in its medal's colour instead of its tone's, and it throws confetti. Both are read off the
  // model here rather than inside `NotchCard`, which knows nothing about notifications.
  const reward = model.kind === 'reward' ? model : null
  const celebrates = reward !== null && (reward.confetti ?? true)

  return (
    <NotchCard
      tone={model.tone}
      visible={visible}
      {...(reward ? { haloRgb: NOTCH_TIER_RGB[reward.tier] } : {})}
      {...(reward && celebrates
        ? {
            backdrop: (
              <NotchConfetti
                tier={reward.tier}
                // One burst per unlock, replayable: the same achievement always throws the same
                // paper, so nobody can read anything into the pattern.
                seed={reward.id}
                height={measureCardHeight(reward, bandHeight)}
                origin={rewardConfettiOrigin(bandHeight)}
                {...(reducedMotion !== undefined ? { reducedMotion } : {})}
              />
            ),
          }
        : {})}
      {...(onActivate ? { onActivate } : {})}
      {...(onPointerEnter ? { onPointerEnter } : {})}
      {...(onPointerLeave ? { onPointerLeave } : {})}
      {...(housingHalfWidth !== undefined ? { housingHalfWidth } : {})}
      {...(bandHeight !== undefined ? { bandHeight } : {})}
      bandStart={
        productName !== undefined ? (
          <span className="block truncate text-[9px] font-semibold uppercase tracking-[0.18em] text-white/35">
            {productName}
          </span>
        ) : undefined
      }
      bandEnd={
        // The close button lives in the band rather than the header for the same reason everything
        // else does: this is the only row with room to spare, and it is pinned to a sliver the
        // camera housing does not cover.
        <button
          type="button"
          data-testid="notch-close"
          aria-label={closeLabel}
          onClick={(e) => {
            e.stopPropagation()
            onDismiss()
          }}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/50 transition-colors hover:bg-white/20 hover:text-white"
        >
          <X className="h-3 w-3" />
        </button>
      }
    >
      <NotchHeaderRow
        tone={model.tone}
        eyebrow={model.eyebrow}
        {...(model.context !== undefined ? { context: model.context } : {})}
        {...(model.meta !== undefined ? { meta: model.meta } : {})}
        {...(icon !== undefined ? { icon } : {})}
      />
      <NotchBody model={model} />
      {hasActionRow(model) && (
        <NotchActionRow
          actions={model.actions ?? []}
          {...(model.badge !== undefined ? { badge: model.badge } : {})}
          onAction={onAction}
        />
      )}
    </NotchCard>
  )
}
