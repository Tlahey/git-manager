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
  NotchStatusModel,
  NotchTone,
} from './types'
export { STATUS_OUTPUT_MAX_LINES } from './types'

export { NOTCH_TONE_RGB, toneColor, tonePriority } from './notchTones'

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
  NOTCH_ROW,
  notchRowHeights,
  statusOutputHeight,
  withRule,
} from './notchGeometry'
export type { NotchDevicePreset, NotchPlacement, NotchRect } from './notchGeometry'

export {
  animateValue,
  easeInCubic,
  easeOutCubic,
  ENTER_MS,
  EXIT_MS,
  rafScheduler,
  SLIDE_DISTANCE,
} from './notchAnimation'
export type { AnimateValueOptions, FrameScheduler } from './notchAnimation'

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
export { NotchNotification } from './NotchNotification'
export type { NotchNotificationProps } from './NotchNotification'
export { NotchHeaderRow } from './rows/NotchHeaderRow'
export type { NotchHeaderRowProps } from './rows/NotchHeaderRow'
export { NotchActionRow } from './rows/NotchActionRow'
export type { NotchActionRowProps } from './rows/NotchActionRow'
export { NotchBody, NotchEventBody, NotchProgressBody, NotchStatusBody } from './rows/NotchBody'

export { MacBookScreen, MacBookSurface } from './harness/MacBookScreen'
export type { MacBookScreenProps, MacBookWallpaper } from './harness/MacBookScreen'
