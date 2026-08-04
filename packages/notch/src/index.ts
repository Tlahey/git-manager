/**
 * `@git-manager/notch` — the macOS notch notification surface.
 *
 * Presentational and host-agnostic: nothing in here imports Tauri, a store, an i18n function or an
 * app domain type. The consumer supplies a serializable {@link NotchModel} with its copy already
 * translated, plus a {@link NotchHost} that knows how to move and reveal whatever is carrying the
 * card. See README.md for the shape of the seam and why it is there.
 */

export type {
  NotchAction,
  NotchEventModel,
  NotchKind,
  NotchModel,
  NotchProgressModel,
  NotchRewardModel,
  NotchRewardTier,
  NotchStatusModel,
  NotchTone,
} from './types'
export { STATUS_OUTPUT_MAX_LINES } from './types'

export { NOTCH_TONE_RGB, toneColor, tonePriority } from './notchTones'
export { NOTCH_TIER_CONFETTI, NOTCH_TIER_RGB, tierAlpha, tierColor } from './notchRewardTiers'

export {
  bandSlotMaxWidth,
  computeNotchPlacement,
  getDevicePreset,
  hasActionRow,
  HALO_MARGIN,
  measureCardHeight,
  NOTCH_BAND_HEIGHT,
  NOTCH_BAND_GUTTER,
  NOTCH_CARD_WIDTH,
  NOTCH_DEVICE_PRESETS,
  NOTCH_HOUSING_HALF_WIDTH,
  NOTCH_REWARD_MEDAL_SIZE,
  NOTCH_ROW,
  NOTCH_ROW_PADDING_X,
  notchRowHeights,
  rewardConfettiOrigin,
  statusOutputHeight,
  withRule,
} from './notchGeometry'
export type { NotchDevicePreset, NotchPlacement, NotchRect } from './notchGeometry'

export {
  animateValue,
  CONTENT_FADE_MS,
  ENTER_MS,
  EXIT_FADE_AT,
  EXIT_MS,
  linear,
  rafScheduler,
  SLIDE_DISTANCE,
} from './notchAnimation'
export type { AnimateValueOptions, FrameScheduler } from './notchAnimation'

export {
  CONFETTI_MAX_DURATION_MS,
  CONFETTI_MIN_DURATION_MS,
  CONFETTI_PIECE_COUNT,
  CONFETTI_STAGGER_MS,
  CONFETTI_START_DELAY_MS,
  CONFETTI_TOTAL_MS,
  createConfettiPieces,
} from './confetti'
export type { ConfettiPiece, CreateConfettiOptions } from './confetti'

export { usePrefersReducedMotion } from './usePrefersReducedMotion'

export { createElementNotchHost, createRecordingNotchHost, noopNotchHost } from './notchHost'
export type { NotchHost } from './notchHost'

export { useNotchPresenter } from './useNotchPresenter'
export type { NotchPresenter, UseNotchPresenterOptions } from './useNotchPresenter'

export {
  dismissCurrentNotch,
  emptyNotchQueue,
  enqueueNotch,
  notchQueueSize,
  removeNotch,
} from './notchQueue'
export type { NotchQueueEntry, NotchQueueState } from './notchQueue'

export { NotchCard } from './NotchCard'
export type { NotchCardProps } from './NotchCard'
export { NotchConfetti } from './NotchConfetti'
export type { NotchConfettiProps } from './NotchConfetti'
export { NotchNotification } from './NotchNotification'
export type { NotchNotificationProps } from './NotchNotification'
export { NotchHeaderRow } from './rows/NotchHeaderRow'
export type { NotchHeaderRowProps } from './rows/NotchHeaderRow'
export { NotchActionRow } from './rows/NotchActionRow'
export type { NotchActionRowProps } from './rows/NotchActionRow'
export {
  NotchBody,
  NotchEventBody,
  NotchProgressBody,
  NotchRewardBody,
  NotchStatusBody,
} from './rows/NotchBody'
export { NotchTierMedal } from './rows/NotchTierMedal'
export type { NotchTierMedalProps } from './rows/NotchTierMedal'

export { MacBookScreen, MacBookSurface } from './harness/MacBookScreen'
export type { MacBookScreenProps, MacBookWallpaper } from './harness/MacBookScreen'
